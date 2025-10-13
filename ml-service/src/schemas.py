"""Pydantic schemas for ML service"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class ModelCreateRequest(BaseModel):
    """Request schema for creating a model"""
    name: str
    version: str
    framework: str
    model_type: str
    artifacts_path: str
    metadata: Optional[Dict[str, Any]] = {}


class ModelResponse(BaseModel):
    """Response schema for model data"""
    id: str
    name: str
    version: str
    framework: str
    model_type: str
    artifacts_path: str
    metadata: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PredictionRequest(BaseModel):
    """Request schema for making predictions"""
    model_id: str
    features: Dict[str, Any]
    feature_ids: Optional[List[str]] = []
    entity_id: Optional[str] = None
    request_id: Optional[str] = None


class PredictionResponse(BaseModel):
    """Response schema for predictions"""
    prediction_id: str
    model_id: str
    prediction: Dict[str, Any]
    confidence: Optional[float] = None
    latency_ms: float
    timestamp: datetime


class TrainingRequest(BaseModel):
    """Request schema for training jobs"""
    model_type: str
    model_name: str
    training_data_path: str
    validation_data_path: Optional[str] = None
    hyperparameters: Optional[Dict[str, Any]] = {}
    framework: str = "sklearn"


class ModelMetrics(BaseModel):
    """Schema for model metrics"""
    model_id: str
    total_predictions: int
    average_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    average_confidence: Optional[float] = None
    time_range: str
