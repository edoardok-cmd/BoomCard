import express from 'express';
import { Kafka, Consumer, Producer, EachMessagePayload } from 'kafkajs';
import { Pool } from 'pg';
import Redis from 'redis';
import { EventStore } from './core/event-store';
import { CommandHandler } from './core/command-handler';
import { EventHandler } from './core/event-handler';
import { ProjectionManager } from './core/projection-manager';
import { SagaManager } from './core/saga-manager';
import { logger } from './utils/logger';
import { metrics } from './utils/metrics';
import { initTracing } from './utils/tracing';

// Initialize tracing
initTracing('event-processor');

// Real database connections
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'enterprise_db',
  user: process.env.DB_USER || 'enterprise_user',
  password: process.env.DB_PASSWORD || 'enterprise_pass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Real Redis connection
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://:redis_pass@localhost:6379'
});

// Real Kafka connection
const kafka = new Kafka({
  clientId: 'event-processor',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'event-processor-group' });

// Initialize core components
const eventStore = new EventStore(pgPool);
const commandHandler = new CommandHandler(eventStore, producer);
const eventHandler = new EventHandler(pgPool, redis);
const projectionManager = new ProjectionManager(pgPool, redis);
const sagaManager = new SagaManager(eventStore, producer);

// Express app for health checks and metrics
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database
    await pgPool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    res.json({
      status: 'healthy',
      services: {
        database: 'connected',
        redis: 'connected',
        kafka: 'connected'
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  const metricsData = await metrics.register.metrics();
  res.send(metricsData);
});

// Command endpoint for CQRS
app.post('/commands', async (req, res) => {
  try {
    const { commandType, aggregateId, payload } = req.body;
    
    const result = await commandHandler.handle({
      commandType,
      aggregateId,
      payload,
      metadata: {
        userId: req.headers['x-user-id'] as string,
        timestamp: new Date().toISOString(),
        correlationId: req.headers['x-correlation-id'] as string
      }
    });
    
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Command handling failed:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Start Kafka consumer
async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ 
    topics: ['domain-events', 'system-events'], 
    fromBeginning: false 
  });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      const startTime = Date.now();
      
      try {
        const event = JSON.parse(message.value.toString());
        
        logger.info('Processing event:', {
          topic,
          eventType: event.eventType,
          aggregateId: event.aggregateId
        });
        
        // Process event through different handlers
        await Promise.all([
          eventHandler.handle(event),
          projectionManager.project(event),
          sagaManager.handle(event)
        ]);
        
        // Update metrics
        metrics.eventsProcessed.inc({ topic, eventType: event.eventType });
        metrics.eventProcessingDuration.observe(
          { topic, eventType: event.eventType },
          Date.now() - startTime
        );
        
      } catch (error) {
        logger.error('Event processing failed:', error);
        metrics.eventProcessingErrors.inc({ topic });
        
        // Send to dead letter queue
        await producer.send({
          topic: 'dead-letter-queue',
          messages: [{
            key: message.key,
            value: message.value,
            headers: {
              ...message.headers,
              'error': error.message,
              'originalTopic': topic,
              'failedAt': new Date().toISOString()
            }
          }]
        });
      }
    }
  });
}

// Start the service
async function start() {
  try {
    // Connect to services
    await redis.connect();
    await producer.connect();
    
    // Initialize event store
    await eventStore.initialize();
    
    // Start projection rebuilding if needed
    await projectionManager.rebuildIfNeeded();
    
    // Start Kafka consumer
    await startConsumer();
    
    // Start HTTP server
    const port = process.env.PORT || 3005;
    app.listen(port, () => {
      logger.info(`Event processor running on port ${port}`);
    });
    
  } catch (error) {
    logger.error('Failed to start event processor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await consumer.disconnect();
  await producer.disconnect();
  await redis.disconnect();
  await pgPool.end();
  process.exit(0);
});

start();