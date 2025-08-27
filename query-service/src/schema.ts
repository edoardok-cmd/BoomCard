import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime
  scalar JSON

  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    roles: [Role!]!
    sessions: [Session!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Role {
    id: ID!
    name: String!
    description: String
    permissions: [String!]!
    users: [User!]!
  }

  type Session {
    id: ID!
    userId: ID!
    user: User!
    ipAddress: String
    userAgent: String
    expiresAt: DateTime!
    createdAt: DateTime!
  }

  type AnalyticsEvent {
    id: ID!
    eventType: String!
    userId: ID
    sessionId: ID
    properties: JSON!
    context: JSON!
    timestamp: DateTime!
  }

  type Metric {
    id: ID!
    name: String!
    value: Float!
    dimensions: JSON!
    timestamp: DateTime!
  }

  type MLModel {
    id: ID!
    name: String!
    version: String!
    modelType: String!
    framework: String
    status: ModelStatus!
    metrics: JSON!
    createdAt: DateTime!
    predictions: [Prediction!]!
  }

  enum ModelStatus {
    ACTIVE
    INACTIVE
    TRAINING
    FAILED
  }

  type Prediction {
    id: ID!
    modelId: ID!
    model: MLModel!
    inputData: JSON!
    prediction: JSON!
    confidence: Float
    latencyMs: Int
    createdAt: DateTime!
  }

  type DashboardMetrics {
    totalUsers: Int!
    activeUsers: Int!
    totalEvents: Int!
    averageSessionDuration: Float!
    topEvents: [EventCount!]!
    modelPerformance: [ModelMetric!]!
  }

  type EventCount {
    eventType: String!
    count: Int!
  }

  type ModelMetric {
    modelId: ID!
    modelName: String!
    accuracy: Float!
    latency: Float!
    predictions: Int!
  }

  # Queries
  type Query {
    # User queries
    me: User
    user(id: ID!): User
    users(limit: Int, offset: Int): [User!]!
    
    # Analytics queries
    events(
      userId: ID
      eventType: String
      startDate: DateTime
      endDate: DateTime
      limit: Int
    ): [AnalyticsEvent!]!
    
    metrics(
      name: String
      startDate: DateTime
      endDate: DateTime
    ): [Metric!]!
    
    dashboardMetrics(timeRange: String!): DashboardMetrics!
    
    # ML queries
    models(status: ModelStatus): [MLModel!]!
    model(id: ID!): MLModel
    predictions(
      modelId: ID
      limit: Int
      offset: Int
    ): [Prediction!]!
    
    # Search
    search(query: String!, types: [SearchType!]): SearchResults!
  }

  enum SearchType {
    USER
    EVENT
    MODEL
  }

  type SearchResults {
    users: [User!]!
    events: [AnalyticsEvent!]!
    models: [MLModel!]!
    totalResults: Int!
  }

  # Mutations
  type Mutation {
    # User mutations
    updateProfile(input: UpdateProfileInput!): User!
    changePassword(oldPassword: String!, newPassword: String!): Boolean!
    
    # Analytics mutations
    trackEvent(input: TrackEventInput!): AnalyticsEvent!
    
    # ML mutations
    createModel(input: CreateModelInput!): MLModel!
    updateModelStatus(id: ID!, status: ModelStatus!): MLModel!
    predict(input: PredictInput!): Prediction!
  }

  input UpdateProfileInput {
    firstName: String
    lastName: String
  }

  input TrackEventInput {
    eventType: String!
    properties: JSON!
    context: JSON
  }

  input CreateModelInput {
    name: String!
    version: String!
    modelType: String!
    framework: String
  }

  input PredictInput {
    modelId: ID!
    inputData: JSON!
  }

  # Subscriptions
  type Subscription {
    # Real-time event stream
    eventReceived(userId: ID, eventTypes: [String!]): AnalyticsEvent!
    
    # Real-time metrics updates
    metricUpdated(names: [String!]): Metric!
    
    # Model training updates
    modelStatusChanged(modelId: ID!): MLModel!
    
    # Dashboard updates
    dashboardUpdated: DashboardMetrics!
  }
`;