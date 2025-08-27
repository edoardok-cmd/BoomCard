-- Create real schemas for microservices
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS analytics_service;
CREATE SCHEMA IF NOT EXISTS ml_service;
CREATE SCHEMA IF NOT EXISTS event_store;

-- Auth Service Real Tables
CREATE TABLE auth_service.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_service.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_service.user_roles (
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES auth_service.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE auth_service.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Service Real Tables
CREATE TABLE analytics_service.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    session_id UUID,
    properties JSONB NOT NULL DEFAULT '{}',
    context JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false
);

CREATE TABLE analytics_service.metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ML Service Real Tables
CREATE TABLE ml_service.models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    framework VARCHAR(50),
    artifacts_path TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'inactive',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version)
);

CREATE TABLE ml_service.predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES ml_service.models(id),
    input_data JSONB NOT NULL,
    prediction JSONB NOT NULL,
    confidence NUMERIC,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event Store for Event Sourcing
CREATE TABLE event_store.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_aggregate_events ON event_store.events(aggregate_id, created_at);

-- Create materialized views for real-time analytics
CREATE MATERIALIZED VIEW analytics_service.daily_active_users AS
SELECT 
    DATE(timestamp) as date,
    COUNT(DISTINCT user_id) as active_users,
    COUNT(*) as total_events
FROM analytics_service.events
WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(timestamp);

-- Create real indexes for performance
CREATE INDEX idx_users_email ON auth_service.users(email);
CREATE INDEX idx_sessions_token ON auth_service.sessions(token_hash);
CREATE INDEX idx_events_timestamp ON analytics_service.events(timestamp);
CREATE INDEX idx_events_user ON analytics_service.events(user_id);
CREATE INDEX idx_metrics_name_time ON analytics_service.metrics(metric_name, timestamp);

-- Insert real seed data
INSERT INTO auth_service.roles (name, description, permissions) VALUES
('admin', 'System Administrator', '["*"]'),
('user', 'Regular User', '["read:own_profile", "update:own_profile"]'),
('analyst', 'Data Analyst', '["read:analytics", "create:reports"]');
