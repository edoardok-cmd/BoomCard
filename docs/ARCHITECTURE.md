# project-50 Architecture

## Overview
project-50 is a modern microservices-based platform built with scalability and maintainability in mind.

## Components

### Frontend Applications
- **partner-dashboard**: frontend built with react

### Backend Services
- **api-gateway**: backend built with nestjs
- **analytics-service**: microservice built with python
- **qr-service**: microservice built with nodejs

## Technology Stack
- **Frontend**: Next.js, React, React Native
- **Backend**: NestJS, Node.js
- **Database**: PostgreSQL, Redis
- **Infrastructure**: Docker, Kubernetes
- **CI/CD**: GitHub Actions

## Architecture Patterns
- Microservices architecture
- Event-driven communication
- API Gateway pattern
- Database per service
- CQRS where applicable

## Security
- JWT-based authentication
- Role-based access control (RBAC)
- API rate limiting
- Input validation and sanitization
- HTTPS everywhere

## Scalability
- Horizontal scaling via Kubernetes
- Redis caching layer
- Database read replicas
- CDN for static assets
