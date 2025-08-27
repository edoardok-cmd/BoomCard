import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  
  constructor(private configService: ConfigService) {
    // Real Kafka connection
    this.kafka = new Kafka({
      clientId: this.configService.get('KAFKA_CLIENT_ID', 'enterprise-app'),
      brokers: this.configService.get('KAFKA_BROKERS', 'localhost:9092').split(','),
      ssl: this.configService.get('KAFKA_SSL', false),
      sasl: this.configService.get('KAFKA_SASL_USERNAME') ? {
        mechanism: 'plain',
        username: this.configService.get('KAFKA_SASL_USERNAME'),
        password: this.configService.get('KAFKA_SASL_PASSWORD'),
      } : undefined,
    });
    
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
    });
  }
  
  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }
  
  async onModuleDestroy() {
    await this.producer.disconnect();
  }
  
  async publish(topic: string, messages: any[]): Promise<void> {
    const record: ProducerRecord = {
      topic,
      messages: messages.map(message => ({
        key: message.key || null,
        value: JSON.stringify(message.value),
        headers: message.headers || {},
        timestamp: Date.now().toString(),
      })),
    };
    
    try {
      const result = await this.producer.send(record);
      this.logger.debug(`Published to ${topic}:`, result);
    } catch (error) {
      this.logger.error(`Failed to publish to ${topic}:`, error);
      throw error;
    }
  }
  
  async publishEvent(event: {
    type: string;
    aggregateId: string;
    data: any;
    metadata?: any;
  }): Promise<void> {
    await this.publish('domain-events', [{
      key: event.aggregateId,
      value: {
        eventId: crypto.randomUUID(),
        eventType: event.type,
        aggregateId: event.aggregateId,
        timestamp: new Date().toISOString(),
        data: event.data,
        metadata: event.metadata || {},
      },
    }]);
  }
}
