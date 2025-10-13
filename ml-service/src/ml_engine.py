import asyncio
import pickle
import json
from typing import Dict, Any, Optional, List
import numpy as np
import pandas as pd
from datetime import datetime
import redis.asyncio as redis
from minio import Minio
import tensorflow as tf
import torch
import joblib
from sklearn.base import BaseEstimator
import logging

logger = logging.getLogger(__name__)

class MLEngine:
    """Real ML engine for model loading, inference, and management"""
    
    def __init__(self, redis_client: redis.Redis, minio_url: str, 
                 minio_access_key: str, minio_secret_key: str):
        self.redis = redis_client
        self.minio_client = Minio(
            minio_url,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=False
        )
        self.loaded_models: Dict[str, Any] = {}
        self.model_metadata: Dict[str, Dict] = {}
        
    async def initialize(self):
        """Initialize ML engine and create necessary buckets"""
        # Create model bucket if not exists
        if not self.minio_client.bucket_exists("ml-models"):
            self.minio_client.make_bucket("ml-models")
            logger.info("Created ML models bucket")
            
        if not self.minio_client.bucket_exists("ml-artifacts"):
            self.minio_client.make_bucket("ml-artifacts")
            logger.info("Created ML artifacts bucket")
    
    async def load_model(self, model_id: str, model_path: str):
        """Load a model from storage into memory"""
        try:
            # Check if already loaded
            if model_id in self.loaded_models:
                logger.info(f"Model {model_id} already loaded")
                return

            # Get model metadata from Redis
            metadata_str = await self.redis.get(f"model:metadata:{model_id}")
            metadata = {}
            if metadata_str:
                metadata = json.loads(metadata_str)
                self.model_metadata[model_id] = metadata

            # Download model from MinIO
            model_data = self._download_model(model_path)

            # Load based on framework
            framework = metadata.get('framework', 'sklearn')
            
            if framework == 'tensorflow':
                model = tf.keras.models.load_model(model_data)
            elif framework == 'pytorch':
                model = torch.load(model_data)
            elif framework == 'sklearn':
                model = joblib.load(model_data)
            else:
                with open(model_data, 'rb') as f:
                    model = pickle.load(f)
            
            self.loaded_models[model_id] = model
            
            # Cache model info in Redis
            await self.redis.set(
                f"model:loaded:{model_id}",
                json.dumps({
                    'loaded_at': datetime.utcnow().isoformat(),
                    'framework': framework,
                    'version': metadata.get('version', '1.0')
                }),
                ex=3600  # 1 hour expiry
            )
            
            logger.info(f"Successfully loaded model {model_id}")
            
        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            raise
    
    async def predict(self, model_id: str, features: Dict[str, Any]) -> Dict[str, Any]:
        """Make prediction using loaded model"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not loaded")
        
        model = self.loaded_models[model_id]
        metadata = self.model_metadata.get(model_id, {})
        
        # Prepare features
        feature_vector = self._prepare_features(features, metadata)
        
        # Make prediction based on model type
        framework = metadata.get('framework', 'sklearn')
        
        start_time = datetime.utcnow()
        
        probabilities = None
        predicted_class = None
        confidence = None
        prediction_value = None

        if framework == 'tensorflow':
            prediction = model.predict(feature_vector)
            if metadata.get('task') == 'classification':
                probabilities = prediction[0].tolist()
                predicted_class = int(np.argmax(prediction[0]))
                confidence = float(np.max(prediction[0]))
            else:
                prediction_value = float(prediction[0][0])
                
        elif framework == 'pytorch':
            model.eval()
            with torch.no_grad():
                input_tensor = torch.FloatTensor(feature_vector)
                output = model(input_tensor)
                if metadata.get('task') == 'classification':
                    probabilities = torch.softmax(output, dim=1)[0].tolist()
                    predicted_class = int(torch.argmax(output[0]))
                    confidence = float(torch.max(torch.softmax(output, dim=1)[0]))
                    prediction_value = None
                else:
                    probabilities = None
                    predicted_class = None
                    confidence = None
                    prediction_value = float(output[0])
                    
        else:  # sklearn and others
            prediction = model.predict(feature_vector)
            if hasattr(model, 'predict_proba'):
                proba = model.predict_proba(feature_vector)
                probabilities = proba[0].tolist()
                predicted_class = int(prediction[0])
                confidence = float(np.max(proba[0]))
                prediction_value = None
            else:
                probabilities = None
                predicted_class = None
                confidence = None
                prediction_value = float(prediction[0])
        
        latency_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Store prediction in Redis for monitoring
        await self._store_prediction_metrics(model_id, latency_ms, confidence)
        
        return {
            'model_id': model_id,
            'prediction': {
                'class': predicted_class,
                'value': prediction_value,
                'probabilities': probabilities,
                'confidence': confidence
            },
            'metadata': {
                'model_version': metadata.get('version', '1.0'),
                'framework': framework,
                'latency_ms': latency_ms,
                'timestamp': datetime.utcnow().isoformat()
            }
        }
    
    def _prepare_features(self, features: Dict[str, Any], metadata: Dict) -> np.ndarray:
        """Prepare features for model input"""
        feature_names = metadata.get('feature_names', sorted(features.keys()))
        feature_vector = []
        
        for name in feature_names:
            if name not in features:
                # Use default value or raise error
                default = metadata.get('feature_defaults', {}).get(name)
                if default is None:
                    raise ValueError(f"Missing required feature: {name}")
                value = default
            else:
                value = features[name]
            
            # Handle categorical features
            if name in metadata.get('categorical_features', []):
                # One-hot encode or use embedding
                encoder = metadata.get('encoders', {}).get(name)
                if encoder:
                    value = encoder.transform([value])[0]
            
            feature_vector.append(value)
        
        return np.array([feature_vector])
    
    def _download_model(self, model_path: str) -> str:
        """Download model from MinIO"""
        local_path = f"/tmp/{model_path.split('/')[-1]}"
        bucket, object_name = model_path.split('/', 1)
        
        self.minio_client.fget_object(
            bucket,
            object_name,
            local_path
        )
        
        return local_path
    
    async def _store_prediction_metrics(self, model_id: str, latency_ms: float, 
                                      confidence: Optional[float]):
        """Store prediction metrics in Redis"""
        timestamp = datetime.utcnow().isoformat()
        
        # Store in sorted set for time-series queries
        await self.redis.zadd(
            f"model:metrics:latency:{model_id}",
            {f"{timestamp}:{latency_ms}": datetime.utcnow().timestamp()}
        )
        
        if confidence is not None:
            await self.redis.zadd(
                f"model:metrics:confidence:{model_id}",
                {f"{timestamp}:{confidence}": datetime.utcnow().timestamp()}
            )
        
        # Increment prediction counter (redis.hincrby returns int, not awaitable)
        self.redis.hincrby(f"model:stats:{model_id}", "predictions", 1)  # type: ignore

        # Update last prediction time (redis.hset returns int, not awaitable)
        self.redis.hset(  # type: ignore
            f"model:stats:{model_id}",
            "last_prediction",
            timestamp
        )
    
    async def unload_model(self, model_id: str):
        """Unload model from memory"""
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]
            if model_id in self.model_metadata:
                del self.model_metadata[model_id]
            await self.redis.delete(f"model:loaded:{model_id}")
            logger.info(f"Unloaded model {model_id}")
    
    async def get_loaded_models(self) -> List[str]:
        """Get list of currently loaded models"""
        return list(self.loaded_models.keys())
    
    async def get_model_stats(self, model_id: str) -> Dict[str, Any]:
        """Get model statistics"""
        stats = await self.redis.hgetall(f"model:stats:{model_id}")  # type: ignore
        
        # Get recent latencies
        recent_latencies = await self.redis.zrevrange(
            f"model:metrics:latency:{model_id}",
            0, 99,  # Last 100 predictions
            withscores=False
        )
        
        latencies = [float(l.split(':')[1]) for l in recent_latencies]
        
        return {
            'total_predictions': int(stats.get('predictions', 0)),
            'last_prediction': stats.get('last_prediction'),
            'average_latency_ms': np.mean(latencies) if latencies else 0,
            'p95_latency_ms': np.percentile(latencies, 95) if latencies else 0,
            'p99_latency_ms': np.percentile(latencies, 99) if latencies else 0
        }