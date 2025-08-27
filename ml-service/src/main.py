from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import logging
import os
import json
from typing import Optional, List, Dict, Any
import numpy as np
from datetime import datetime

from .models import MLModel, Prediction
from .services import ModelService, PredictionService, TrainingService
from .schemas import (
    ModelCreateRequest, ModelResponse, PredictionRequest, 
    PredictionResponse, TrainingRequest, ModelMetrics
)
from .ml_engine import MLEngine
from .feature_store import FeatureStore
from .model_registry import ModelRegistry

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Real environment configuration
DB_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://enterprise_user:enterprise_pass@localhost/enterprise_db')
REDIS_URL = os.getenv('REDIS_URL', 'redis://:redis_pass@localhost:6379')
KAFKA_SERVERS = os.getenv('KAFKA_SERVERS', 'localhost:9092').split(',')
MINIO_URL = os.getenv('MINIO_URL', 'localhost:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', 'minio_admin')
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', 'minio_pass')

# Real metrics
request_count = Counter('ml_requests_total', 'Total ML requests', ['method', 'endpoint', 'status'])
prediction_latency = Histogram('ml_prediction_duration_seconds', 'ML prediction latency', ['model_name'])
training_duration = Histogram('ml_training_duration_seconds', 'ML training duration', ['model_type'])

# Real database engine
engine = create_async_engine(
    DB_URL.replace('postgresql+asyncpg', 'postgresql+asyncpg'),
    echo=False,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Global services
redis_client: Optional[redis.Redis] = None
ml_engine: Optional[MLEngine] = None
feature_store: Optional[FeatureStore] = None
model_registry: Optional[ModelRegistry] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - connect to real services
    global redis_client, ml_engine, feature_store, model_registry
    
    # Connect to Redis
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    logger.info("Connected to Redis")
    
    # Initialize ML components
    ml_engine = MLEngine(redis_client, MINIO_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY)
    await ml_engine.initialize()
    
    feature_store = FeatureStore(redis_client, engine)
    await feature_store.initialize()
    
    model_registry = ModelRegistry(engine, ml_engine)
    await model_registry.initialize()
    
    logger.info("ML Service initialized successfully")
    
    yield
    
    # Shutdown - cleanup
    await redis_client.close()
    await engine.dispose()
    logger.info("ML Service shutdown complete")

app = FastAPI(
    title="ML Service",
    description="Real ML service with model training, serving, and monitoring",
    version="1.0.0",
    lifespan=lifespan
)

# Real CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real OpenTelemetry instrumentation
FastAPIInstrumentor.instrument_app(app)

# Real dependency for database sessions
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Services
def get_model_service(db: AsyncSession = Depends(get_db)) -> ModelService:
    return ModelService(db, ml_engine, model_registry)

def get_prediction_service(db: AsyncSession = Depends(get_db)) -> PredictionService:
    return PredictionService(db, ml_engine, feature_store, redis_client)

def get_training_service(db: AsyncSession = Depends(get_db)) -> TrainingService:
    return TrainingService(db, ml_engine, model_registry, feature_store)

# Real health check with service verification
@app.get("/health")
async def health_check():
    health_status = {"status": "healthy", "services": {}, "timestamp": datetime.utcnow().isoformat()}
    
    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
        health_status["services"]["database"] = "connected"
    except Exception as e:
        health_status["services"]["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Check Redis
    try:
        await redis_client.ping()
        health_status["services"]["redis"] = "connected"
    except Exception as e:
        health_status["services"]["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Check ML Engine
    try:
        models_loaded = await ml_engine.get_loaded_models()
        health_status["services"]["ml_engine"] = f"loaded_models: {len(models_loaded)}"
    except Exception as e:
        health_status["services"]["ml_engine"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    return health_status

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Model management endpoints
@app.post("/models", response_model=ModelResponse)
async def create_model(
    request: ModelCreateRequest,
    background_tasks: BackgroundTasks,
    service: ModelService = Depends(get_model_service)
):
    """Create and register a new ML model"""
    try:
        model = await service.create_model(request)
        
        # Trigger async model loading
        background_tasks.add_task(ml_engine.load_model, model.id, model.artifacts_path)
        
        request_count.labels(method="POST", endpoint="/models", status="success").inc()
        return model
    except Exception as e:
        request_count.labels(method="POST", endpoint="/models", status="error").inc()
        logger.error(f"Failed to create model: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/models", response_model=List[ModelResponse])
async def list_models(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    service: ModelService = Depends(get_model_service)
):
    """List registered models"""
    return await service.list_models(skip, limit, active_only)

@app.get("/models/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: str,
    service: ModelService = Depends(get_model_service)
):
    """Get model details"""
    model = await service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model

@app.put("/models/{model_id}/activate")
async def activate_model(
    model_id: str,
    background_tasks: BackgroundTasks,
    service: ModelService = Depends(get_model_service)
):
    """Activate a model for serving"""
    model = await service.activate_model(model_id)
    background_tasks.add_task(ml_engine.load_model, model.id, model.artifacts_path)
    return {"status": "activated", "model_id": model_id}

# Prediction endpoints
@app.post("/predict", response_model=PredictionResponse)
async def predict(
    request: PredictionRequest,
    service: PredictionService = Depends(get_prediction_service)
):
    """Make a prediction using the specified model"""
    start_time = datetime.utcnow()
    
    try:
        # Get features from feature store
        features = await feature_store.get_features(
            request.feature_ids,
            request.entity_id
        )
        
        # Combine with request features
        all_features = {**features, **request.features}
        
        # Make prediction
        result = await service.predict(
            model_id=request.model_id,
            features=all_features,
            request_id=request.request_id
        )
        
        # Record metrics
        latency = (datetime.utcnow() - start_time).total_seconds()
        prediction_latency.labels(model_name=request.model_id).observe(latency)
        request_count.labels(method="POST", endpoint="/predict", status="success").inc()
        
        return result
        
    except Exception as e:
        request_count.labels(method="POST", endpoint="/predict", status="error").inc()
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/batch-predict")
async def batch_predict(
    requests: List[PredictionRequest],
    service: PredictionService = Depends(get_prediction_service)
):
    """Make batch predictions"""
    results = []
    
    for request in requests:
        try:
            result = await predict(request, service)
            results.append(result)
        except Exception as e:
            results.append({
                "request_id": request.request_id,
                "error": str(e),
                "status": "failed"
            })
    
    return {"predictions": results, "total": len(requests)}

# Training endpoints
@app.post("/train")
async def train_model(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    service: TrainingService = Depends(get_training_service)
):
    """Train a new model"""
    try:
        # Start training in background
        training_job = await service.start_training(request)
        
        # Add background task to monitor training
        background_tasks.add_task(
            service.monitor_training,
            training_job.id
        )
        
        request_count.labels(method="POST", endpoint="/train", status="success").inc()
        
        return {
            "job_id": training_job.id,
            "status": "started",
            "model_type": request.model_type,
            "estimated_duration": training_job.estimated_duration
        }
        
    except Exception as e:
        request_count.labels(method="POST", endpoint="/train", status="error").inc()
        logger.error(f"Training failed to start: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/training-jobs/{job_id}")
async def get_training_status(
    job_id: str,
    service: TrainingService = Depends(get_training_service)
):
    """Get training job status"""
    job = await service.get_training_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job

# Model metrics and monitoring
@app.get("/models/{model_id}/metrics", response_model=ModelMetrics)
async def get_model_metrics(
    model_id: str,
    time_range: str = "1h",
    service: ModelService = Depends(get_model_service)
):
    """Get model performance metrics"""
    metrics = await service.get_model_metrics(model_id, time_range)
    if not metrics:
        raise HTTPException(status_code=404, detail="Metrics not found")
    return metrics

# Feature store endpoints
@app.post("/features/compute")
async def compute_features(
    entity_id: str,
    feature_names: List[str],
    background_tasks: BackgroundTasks
):
    """Compute and store features for an entity"""
    background_tasks.add_task(
        feature_store.compute_features,
        entity_id,
        feature_names
    )
    
    return {
        "status": "computing",
        "entity_id": entity_id,
        "features": feature_names
    }

@app.get("/features/{entity_id}")
async def get_features(
    entity_id: str,
    feature_names: Optional[List[str]] = None
):
    """Get stored features for an entity"""
    features = await feature_store.get_features(feature_names, entity_id)
    return {
        "entity_id": entity_id,
        "features": features,
        "timestamp": datetime.utcnow().isoformat()
    }

# A/B Testing endpoints
@app.post("/experiments/{experiment_id}/allocation")
async def get_experiment_allocation(
    experiment_id: str,
    user_id: str,
    service: ModelService = Depends(get_model_service)
):
    """Get model allocation for A/B testing"""
    allocation = await service.get_experiment_allocation(experiment_id, user_id)
    return allocation

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)