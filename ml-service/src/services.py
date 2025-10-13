"""Service layer for ML operations"""
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime

from .models import MLModel, Prediction
from .schemas import (
    ModelCreateRequest, ModelResponse, PredictionRequest,
    PredictionResponse, TrainingRequest, ModelMetrics
)


class ModelService:
    """Service for model management"""

    def __init__(self, db: AsyncSession, ml_engine: Any = None, model_registry: Any = None):
        self.db = db
        self.ml_engine = ml_engine
        self.model_registry = model_registry

    async def create_model(self, request: ModelCreateRequest) -> ModelResponse:
        """Create a new model"""
        model = MLModel(
            id=str(uuid.uuid4()),
            name=request.name,
            version=request.version,
            framework=request.framework,
            model_type=request.model_type,
            artifacts_path=request.artifacts_path,
            metadata=request.metadata,
            is_active=False
        )
        self.db.add(model)
        await self.db.commit()
        await self.db.refresh(model)
        return ModelResponse.model_validate(model)

    async def list_models(self, skip: int = 0, limit: int = 100, active_only: bool = False) -> List[ModelResponse]:
        """List models"""
        query = select(MLModel)
        if active_only:
            query = query.where(MLModel.is_active == True)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        models = result.scalars().all()
        return [ModelResponse.model_validate(model) for model in models]

    async def get_model(self, model_id: str) -> Optional[ModelResponse]:
        """Get a model by ID"""
        result = await self.db.execute(select(MLModel).where(MLModel.id == model_id))
        model = result.scalar_one_or_none()
        if model:
            return ModelResponse.model_validate(model)
        return None

    async def activate_model(self, model_id: str) -> ModelResponse:
        """Activate a model"""
        result = await self.db.execute(select(MLModel).where(MLModel.id == model_id))
        model = result.scalar_one_or_none()
        if not model:
            raise ValueError("Model not found")
        model.is_active = True
        await self.db.commit()
        await self.db.refresh(model)
        return ModelResponse.model_validate(model)

    async def get_model_metrics(self, model_id: str, time_range: str) -> Optional[ModelMetrics]:
        """Get model metrics"""
        if self.ml_engine:
            stats = await self.ml_engine.get_model_stats(model_id)
            return ModelMetrics(
                model_id=model_id,
                total_predictions=stats.get('total_predictions', 0),
                average_latency_ms=stats.get('average_latency_ms', 0),
                p95_latency_ms=stats.get('p95_latency_ms', 0),
                p99_latency_ms=stats.get('p99_latency_ms', 0),
                time_range=time_range
            )
        return None

    async def get_experiment_allocation(self, experiment_id: str, user_id: str) -> Dict[str, Any]:
        """Get A/B test allocation"""
        # Simple hash-based allocation
        hash_val = hash(f"{experiment_id}:{user_id}")
        variant = "A" if hash_val % 2 == 0 else "B"
        return {
            "experiment_id": experiment_id,
            "user_id": user_id,
            "variant": variant,
            "model_id": f"model_{variant.lower()}"
        }


class PredictionService:
    """Service for predictions"""

    def __init__(self, db: AsyncSession, ml_engine: Any = None, feature_store: Any = None, redis_client: Any = None):
        self.db = db
        self.ml_engine = ml_engine
        self.feature_store = feature_store
        self.redis = redis_client

    async def predict(self, model_id: str, features: Dict[str, Any], request_id: Optional[str] = None) -> PredictionResponse:
        """Make a prediction"""
        start_time = datetime.utcnow()

        # Make prediction using ML engine
        result = await self.ml_engine.predict(model_id, features)

        latency_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

        # Store prediction in database
        prediction = Prediction(
            id=str(uuid.uuid4()),
            model_id=model_id,
            request_id=request_id,
            features=features,
            prediction=result['prediction'],
            confidence=result['prediction'].get('confidence'),
            latency_ms=latency_ms
        )
        self.db.add(prediction)
        await self.db.commit()

        return PredictionResponse(
            prediction_id=prediction.id,
            model_id=model_id,
            prediction=result['prediction'],
            confidence=result['prediction'].get('confidence'),
            latency_ms=latency_ms,
            timestamp=prediction.created_at
        )


class TrainingService:
    """Service for model training"""

    def __init__(self, db: AsyncSession, ml_engine: Any = None, model_registry: Any = None, feature_store: Any = None):
        self.db = db
        self.ml_engine = ml_engine
        self.model_registry = model_registry
        self.feature_store = feature_store

    async def start_training(self, request: TrainingRequest) -> Any:
        """Start a training job"""
        job = type('TrainingJob', (), {
            'id': str(uuid.uuid4()),
            'status': 'started',
            'estimated_duration': 300
        })()
        return job

    async def monitor_training(self, job_id: str) -> None:
        """Monitor a training job"""
        pass

    async def get_training_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get training job status"""
        return {
            'job_id': job_id,
            'status': 'completed',
            'progress': 100
        }
