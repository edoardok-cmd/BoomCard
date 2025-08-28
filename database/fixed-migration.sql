-- BoomCard Database Setup for Supabase
-- Fixed version - copy and paste this entire script

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for service isolation
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS analytics_service;
CREATE SCHEMA IF NOT EXISTS ml_service;
CREATE SCHEMA IF NOT EXISTS event_store;

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
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_service.user_roles (
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES auth_service.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- Business Card Tables
CREATE TABLE IF NOT EXISTS public.business_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth_service.users(id) ON DELETE CASCADE,
    card_name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    title VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    social_links JSONB DEFAULT '{}'::jsonb,
    qr_code_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.card_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID REFERENCES public.business_cards(id) ON DELETE CASCADE,
    viewer_ip INET,
    viewer_location JSONB DEFAULT '{}'::jsonb,
    viewed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Tables
CREATE TABLE IF NOT EXISTS analytics_service.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    card_id UUID,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON auth_service.users(email);
CREATE INDEX IF NOT EXISTS idx_business_cards_user ON public.business_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_card_views_card ON public.card_views(card_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON analytics_service.events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_user ON analytics_service.events(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_auth_users_updated_at ON auth_service.users;
CREATE TRIGGER update_auth_users_updated_at BEFORE UPDATE
    ON auth_service.users FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_cards_updated_at ON public.business_cards;
CREATE TRIGGER update_business_cards_updated_at BEFORE UPDATE
    ON public.business_cards FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default roles
INSERT INTO auth_service.roles (name, description, permissions) VALUES
('admin', 'System Administrator', '["*"]'::jsonb),
('user', 'Regular User', '["read:own_profile", "update:own_profile", "create:cards", "read:own_cards", "update:own_cards", "delete:own_cards"]'::jsonb),
('premium', 'Premium User', '["read:own_profile", "update:own_profile", "create:cards", "read:own_cards", "update:own_cards", "delete:own_cards", "analytics:detailed", "export:data"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE auth_service.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_service.events ENABLE ROW LEVEL SECURITY;

-- Grant permissions for API access
GRANT USAGE ON SCHEMA auth_service, analytics_service, ml_service, event_store TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA auth_service, analytics_service, ml_service, event_store TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth_service, analytics_service, ml_service, event_store TO anon, authenticated;