import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface Event {
  id?: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  eventData: any;
  metadata: any;
  createdAt?: Date;
}

export interface AggregateSnapshot {
  aggregateId: string;
  aggregateType: string;
  data: any;
  version: number;
  createdAt: Date;
}

export class EventStore {
  constructor(private pool: Pool) {}

  async initialize(): Promise<void> {
    // Create event store tables if not exists
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS event_store.events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_id UUID NOT NULL,
        aggregate_type VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_version INTEGER NOT NULL,
        event_data JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_aggregate_events 
      ON event_store.events(aggregate_id, event_version);
      
      CREATE TABLE IF NOT EXISTS event_store.snapshots (
        aggregate_id UUID NOT NULL,
        aggregate_type VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        version INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (aggregate_id, version)
      );
    `);
  }

  async appendEvents(events: Event[]): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const event of events) {
        await client.query(
          `INSERT INTO event_store.events 
           (aggregate_id, aggregate_type, event_type, event_version, event_data, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            event.aggregateId,
            event.aggregateType,
            event.eventType,
            event.eventVersion,
            JSON.stringify(event.eventData),
            JSON.stringify(event.metadata)
          ]
        );
      }
      
      await client.query('COMMIT');
      logger.info(`Appended ${events.length} events to store`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to append events:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getEvents(
    aggregateId: string, 
    fromVersion?: number, 
    toVersion?: number
  ): Promise<Event[]> {
    let query = `
      SELECT * FROM event_store.events 
      WHERE aggregate_id = $1
    `;
    const params: any[] = [aggregateId];
    
    if (fromVersion !== undefined) {
      query += ` AND event_version >= $${params.length + 1}`;
      params.push(fromVersion);
    }
    
    if (toVersion !== undefined) {
      query += ` AND event_version <= $${params.length + 1}`;
      params.push(toVersion);
    }
    
    query += ' ORDER BY event_version ASC';
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      eventType: row.event_type,
      eventVersion: row.event_version,
      eventData: row.event_data,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
  }

  async getLastSnapshot(aggregateId: string): Promise<AggregateSnapshot | null> {
    const result = await this.pool.query(
      `SELECT * FROM event_store.snapshots 
       WHERE aggregate_id = $1 
       ORDER BY version DESC 
       LIMIT 1`,
      [aggregateId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      data: row.data,
      version: row.version,
      createdAt: row.created_at
    };
  }

  async saveSnapshot(snapshot: AggregateSnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO event_store.snapshots 
       (aggregate_id, aggregate_type, data, version)
       VALUES ($1, $2, $3, $4)`,
      [
        snapshot.aggregateId,
        snapshot.aggregateType,
        JSON.stringify(snapshot.data),
        snapshot.version
      ]
    );
    
    logger.info(`Saved snapshot for aggregate ${snapshot.aggregateId} at version ${snapshot.version}`);
  }

  async getAggregateVersion(aggregateId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT MAX(event_version) as max_version 
       FROM event_store.events 
       WHERE aggregate_id = $1`,
      [aggregateId]
    );
    
    return result.rows[0].max_version || 0;
  }

  async getEventsByType(
    eventType: string, 
    limit: number = 100, 
    after?: Date
  ): Promise<Event[]> {
    let query = `
      SELECT * FROM event_store.events 
      WHERE event_type = $1
    `;
    const params: any[] = [eventType];
    
    if (after) {
      query += ` AND created_at > $${params.length + 1}`;
      params.push(after);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      eventType: row.event_type,
      eventVersion: row.event_version,
      eventData: row.event_data,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
  }
}