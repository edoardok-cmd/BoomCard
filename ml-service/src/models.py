"""Database models for ML service"""
from sqlalchemy import Column, String, DateTime, Float, Boolean, JSON, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional, Dict, Any

Base = declarative_base()


class MLModel(Base):
    """ML Model database model"""
    __tablename__ = "ml_models"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    framework: Mapped[str] = mapped_column(String, nullable=False)
    model_type: Mapped[str] = mapped_column(String, nullable=False)
    artifacts_path: Mapped[str] = mapped_column(String, nullable=False)
    metadata: Mapped[Dict[str, Any]] = mapped_column(JSON, default={})
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Prediction(Base):
    """Prediction database model"""
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    model_id: Mapped[str] = mapped_column(String, nullable=False)
    request_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    features: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    prediction: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
