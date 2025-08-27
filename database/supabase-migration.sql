-- Supabase Migration Script for Project-50
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS analytics_service;
CREATE SCHEMA IF NOT EXISTS ml_service;
CREATE SCHEMA IF NOT EXISTS event_store;

-- Set search path
SET search_path TO public, auth_service, analytics_service, ml_service, event_store;

-- Auth Service Tables
CREATE TABLE IF NOT EXISTS auth_service.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_service.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_service.user_roles (
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES auth_service.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS auth_service.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Service Tables
CREATE TABLE IF NOT EXISTS analytics_service.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    session_id UUID,
    properties JSONB NOT NULL DEFAULT '{}',
    context JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS analytics_service.metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ML Service Tables
CREATE TABLE IF NOT EXISTS ml_service.models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    framework VARCHAR(50),
    artifacts_path TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'inactive',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS ml_service.predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID REFERENCES ml_service.models(id),
    input_data JSONB NOT NULL,
    prediction JSONB NOT NULL,
    confidence NUMERIC,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Event Store Tables
CREATE TABLE IF NOT EXISTS event_store.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_email ON auth_service.users(email);
CREATE INDEX idx_sessions_token ON auth_service.sessions(token_hash);
CREATE INDEX idx_events_timestamp ON analytics_service.events(timestamp);
CREATE INDEX idx_events_user ON analytics_service.events(user_id);
CREATE INDEX idx_metrics_name_time ON analytics_service.metrics(metric_name, timestamp);
CREATE INDEX idx_aggregate_events ON event_store.events(aggregate_id, created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
CREATE TRIGGER update_auth_users_updated_at BEFORE UPDATE
    ON auth_service.users FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default roles
INSERT INTO auth_service.roles (name, description, permissions) VALUES
('admin', 'System Administrator', '["*"]'),
('user', 'Regular User', '["read:own_profile", "update:own_profile"]'),
('analyst', 'Data Analyst', '["read:analytics", "create:reports"]')
ON CONFLICT (name) DO NOTHING;

-- Create API user for services (optional)
-- This user will be used by backend services to connect
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'project50_api') THEN
        CREATE USER project50_api WITH PASSWORD 'change_this_password';
        GRANT USAGE ON SCHEMA auth_service, analytics_service, ml_service, event_store TO project50_api;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth_service, analytics_service, ml_service, event_store TO project50_api;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth_service, analytics_service, ml_service, event_store TO project50_api;
    END IF;
END $$;