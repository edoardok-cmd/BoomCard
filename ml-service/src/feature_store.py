"""Feature store for ML features"""
import json
from typing import Dict, Any, Optional, List
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncEngine
import logging

logger = logging.getLogger(__name__)


class FeatureStore:
    """Feature store for managing and serving features"""

    def __init__(self, redis_client: redis.Redis, db_engine: AsyncEngine):
        self.redis = redis_client
        self.db_engine = db_engine

    async def initialize(self) -> None:
        """Initialize feature store"""
        logger.info("Feature store initialized")

    async def get_features(
        self,
        feature_names: Optional[List[str]],
        entity_id: str
    ) -> Dict[str, Any]:
        """Get features for an entity"""
        features = {}

        if not feature_names:
            return features

        # Get features from Redis cache
        for feature_name in feature_names:
            key = f"feature:{entity_id}:{feature_name}"
            value = await self.redis.get(key)
            if value:
                features[feature_name] = json.loads(value)

        return features

    async def store_features(
        self,
        entity_id: str,
        features: Dict[str, Any],
        ttl: int = 3600
    ) -> None:
        """Store features for an entity"""
        for feature_name, value in features.items():
            key = f"feature:{entity_id}:{feature_name}"
            await self.redis.set(key, json.dumps(value), ex=ttl)

    async def compute_features(
        self,
        entity_id: str,
        feature_names: List[str]
    ) -> Dict[str, Any]:
        """Compute features for an entity"""
        # Placeholder for feature computation logic
        computed_features = {}

        for feature_name in feature_names:
            # Add computation logic here
            computed_features[feature_name] = 0.0

        # Store computed features
        await self.store_features(entity_id, computed_features)

        return computed_features

    async def delete_features(self, entity_id: str, feature_names: Optional[List[str]] = None) -> None:
        """Delete features for an entity"""
        if feature_names:
            keys = [f"feature:{entity_id}:{name}" for name in feature_names]
        else:
            # Delete all features for entity
            pattern = f"feature:{entity_id}:*"
            keys = []
            async for key in self.redis.scan_iter(match=pattern):
                keys.append(key)

        if keys:
            await self.redis.delete(*keys)
