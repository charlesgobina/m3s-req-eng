import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Configuration and Connection Management
 * 
 * This file handles the Redis connection for caching and memory management.
 * Redis is used to store conversation memories, user data cache, and context cache
 * outside of Node.js RAM to prevent memory leaks.
 */

// Redis connection configuration
const redisConfig = {
  // Connection settings
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'), // Database number (0-15)
  
  // Connection behavior
  retryDelayOnFailover: 100, // Retry delay in ms
  maxRetriesPerRequest: 3,   // Max retries for each command
  lazyConnect: true,         // Don't connect immediately, wait for first command
  
  // Keep connection alive
  keepAlive: 30000,          // Send keep-alive packets every 30 seconds
  
  // Timeouts
  connectTimeout: 10000,     // 10 seconds to establish connection
  commandTimeout: 5000,      // 5 seconds for each command
};

/**
 * Create and configure Redis client
 * 
 * ioredis is a robust Redis client for Node.js with:
 * - Automatic reconnection
 * - Built-in cluster support
 * - Promise-based API
 * - TypeScript support
 */
class RedisManager {
  private static instance: Redis | null = null;
  private static connectionPromise: Promise<Redis> | null = null;

  /**
   * Get Redis client instance (Singleton pattern)
   * This ensures we only have one Redis connection throughout the app
   */
  static async getClient(): Promise<Redis> {
    // If we already have a connected client, return it
    if (this.instance && this.instance.status === 'ready') {
      return this.instance;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Create new connection
    this.connectionPromise = this.createConnection();
    this.instance = await this.connectionPromise;
    this.connectionPromise = null;

    return this.instance;
  }

  /**
   * Create Redis connection with error handling
   */
  private static async createConnection(): Promise<Redis> {
    console.log('🔌 Connecting to Redis...');
    console.log(`   └─ Host: ${redisConfig.host}:${redisConfig.port}`);
    console.log(`   └─ Database: ${redisConfig.db}`);

    const redis = new Redis(redisConfig);

    // Connection event handlers
    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('ready', () => {
      console.log('🚀 Redis is ready to accept commands');
    });

    redis.on('error', (error: Error) => {
      console.error('❌ Redis connection error:', error.message);
    });

    redis.on('close', () => {
      console.log('🔌 Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    // Test the connection
    try {
      await redis.ping();
      console.log('✅ Redis connection test successful');
    } catch (error) {
      console.error('❌ Redis connection test failed:', error);
      throw error;
    }

    return redis;
  }

  /**
   * Gracefully close Redis connection
   * Call this when shutting down the server
   */
  static async closeConnection(): Promise<void> {
    if (this.instance) {
      console.log('🔌 Closing Redis connection...');
      await this.instance.quit();
      this.instance = null;
      console.log('✅ Redis connection closed');
    }
  }

  /**
   * Check if Redis is connected and ready
   */
  static isConnected(): boolean {
    return this.instance !== null && this.instance.status === 'ready';
  }

  /**
   * Get connection status for monitoring
   */
  static getStatus(): string {
    if (!this.instance) return 'disconnected';
    return this.instance.status;
  }
}

// Export the manager for use in other parts of the application
export default RedisManager;

/**
 * Default TTL (Time To Live) values for different types of data
 * These control how long data stays in Redis before automatic deletion
 */
export const RedisTTL = {
  // Conversation memory - 24 hours
  // Users might come back to continue conversations within a day
  CONVERSATION: 24 * 60 * 60, // 86400 seconds

  // Context cache - 5 minutes
  // Context is frequently changing, short TTL keeps it fresh
  CONTEXT: 5 * 60, // 300 seconds

  // User data cache - 4 hours
  // User progress data changes less frequently
  USER_DATA: 4 * 60 * 60, // 14400 seconds

  // Agent insights - 1 hour
  // Agent learning data, moderate frequency of change
  AGENT_INSIGHTS: 60 * 60, // 3600 seconds
};

/**
 * Redis key prefixes for organizing different types of data
 * This helps avoid key conflicts and makes debugging easier
 */
export const RedisKeys = {
  // Conversation memories: "conv:user123:task1_subtask1_step1"
  CONVERSATION: (userId: string, taskContext: string) => 
    `conv:${userId}:${taskContext}`,

  // Context cache: "ctx:user123:ProjectGuide:task1"
  CONTEXT: (userId: string, agentRole: string, taskId: string) => 
    `ctx:${userId}:${agentRole}:${taskId}`,

  // User data cache: "user:user123:data"
  USER_DATA: (userId: string) => 
    `user:${userId}:data`,

  // Agent insights: "insights:user123:ProjectGuide"
  AGENT_INSIGHTS: (userId: string, agentRole: string) => 
    `insights:${userId}:${agentRole}`,
};