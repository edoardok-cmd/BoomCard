import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Pool } from 'pg';
import Redis from 'redis';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import DataLoader from 'dataloader';

import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { dataSources } from './datasources';
import { logger } from './utils/logger';
import { createContext, Context } from './context';
import { initializeLoaders } from './loaders';

// Real database connection
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'enterprise_db',
  user: process.env.DB_USER || 'enterprise_user',
  password: process.env.DB_PASSWORD || 'enterprise_pass',
  max: 20,
});

// Real Redis connection for caching and subscriptions
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://:redis_pass@localhost:6379'
});

// Real Redis PubSub for GraphQL subscriptions
const pubsub = new RedisPubSub({
  publisher: redis.duplicate(),
  subscriber: redis.duplicate(),
});

async function startServer() {
  // Connect to Redis
  await redis.connect();
  logger.info('Connected to Redis');

  // Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Set up WebSocket handling
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx, msg, args) => {
        // Authenticate WebSocket connections
        const token = ctx.connectionParams?.authorization;
        const user = await authenticateToken(token);
        
        return {
          user,
          pubsub,
          dataSources: dataSources(),
        };
      },
      onConnect: async (ctx) => {
        logger.info('Client connected via WebSocket');
      },
      onDisconnect: async (ctx) => {
        logger.info('Client disconnected from WebSocket');
      },
    },
    wsServer
  );

  // Create Apollo Server
  const server = new ApolloServer<Context>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Apply middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
    }),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Create context with real data connections
        const token = req.headers.authorization;
        const user = await authenticateToken(token);
        
        // Initialize DataLoaders for N+1 query prevention
        const loaders = initializeLoaders(pgPool);
        
        return {
          user,
          pgPool,
          redis,
          pubsub,
          loaders,
          dataSources: dataSources(),
        };
      },
    })
  );

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      await pgPool.query('SELECT 1');
      await redis.ping();
      
      res.json({
        status: 'healthy',
        services: {
          database: 'connected',
          redis: 'connected',
          graphql: 'running'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  const port = process.env.PORT || 4000;
  
  httpServer.listen(port, () => {
    logger.info(`🚀 GraphQL server ready at http://localhost:${port}/graphql`);
    logger.info(`🔌 Subscriptions ready at ws://localhost:${port}/graphql`);
  });
}

async function authenticateToken(token: string | undefined) {
  if (!token) return null;
  
  try {
    // Real token validation against auth service
    const response = await fetch('http://auth-service:3000/api/auth/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.replace('Bearer ', '') })
    });
    
    if (response.ok) {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    logger.error('Auth validation failed:', error);
    return null;
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await redis.disconnect();
  await pgPool.end();
  process.exit(0);
});

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});