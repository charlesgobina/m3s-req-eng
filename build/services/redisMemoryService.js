import RedisManager, { RedisTTL, RedisKeys } from '../config/redisConfig.js';
export class RedisMemoryService {
    redis = null;
    /**
     * Initialize Redis connection
     * Call this before using any other methods
     */
    async initialize() {
        try {
            this.redis = await RedisManager.getClient();
            console.log('✅ RedisMemoryService initialized');
        }
        catch (error) {
            console.error('❌ Failed to initialize RedisMemoryService:', error);
            throw error;
        }
    }
    /**
     * Ensure Redis is connected before operations
     */
    async ensureConnected() {
        if (!this.redis) {
            await this.initialize();
        }
        return this.redis;
    }
    // =================================================================
    // CONVERSATION MEMORY MANAGEMENT
    // Replaces: MemoryOrchestrator.conversationMemories Map
    // =================================================================
    /**
     * Store conversation memory data
     *
     * @param userId - User identifier
     * @param taskContext - Context like "task1_subtask1_step1"
     * @param memoryData - Conversation memory data to store
     */
    async setConversationMemory(userId, taskContext, memoryData) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.CONVERSATION(userId, taskContext);
        try {
            // Store as JSON with automatic expiration
            await redis.setex(key, RedisTTL.CONVERSATION, // 24 hours TTL
            JSON.stringify(memoryData));
            console.log(`💾 Stored conversation memory: ${key}`);
            console.log(`   └─ TTL: ${RedisTTL.CONVERSATION} seconds (24 hours)`);
        }
        catch (error) {
            console.error('❌ Failed to store conversation memory:', error);
            throw error;
        }
    }
    /**
     * Retrieve conversation memory data
     *
     * @param userId - User identifier
     * @param taskContext - Context like "task1_subtask1_step1"
     * @returns Conversation memory data or null if not found/expired
     */
    async getConversationMemory(userId, taskContext) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.CONVERSATION(userId, taskContext);
        try {
            const data = await redis.get(key);
            if (!data) {
                console.log(`📭 No conversation memory found: ${key}`);
                return null;
            }
            const parsed = JSON.parse(data);
            console.log(`📋 Retrieved conversation memory: ${key}`);
            console.log(`   └─ Messages: ${parsed.messages?.length || 0}`);
            // Update last accessed time
            parsed.lastAccessed = Date.now();
            await this.setConversationMemory(userId, taskContext, parsed);
            return parsed;
        }
        catch (error) {
            console.error('❌ Failed to retrieve conversation memory:', error);
            return null;
        }
    }
    /**
     * Remove conversation memory (manual cleanup)
     */
    async deleteConversationMemory(userId, taskContext) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.CONVERSATION(userId, taskContext);
        await redis.del(key);
        console.log(`🗑️ Deleted conversation memory: ${key}`);
    }
    // =================================================================
    // CONTEXT CACHE MANAGEMENT  
    // Replaces: AgentContextCache.contextCache Map
    // =================================================================
    /**
     * Store context cache data
     *
     * @param userId - User identifier
     * @param agentRole - Agent role like "ProjectGuide"
     * @param taskId - Task identifier
     * @param context - Context string to cache
     */
    async setContextCache(userId, agentRole, taskId, context) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.CONTEXT(userId, agentRole, taskId);
        const cacheData = {
            context,
            timestamp: Date.now(),
            agentRole,
            userId,
            taskId
        };
        try {
            // Short TTL for context cache (5 minutes)
            await redis.setex(key, RedisTTL.CONTEXT, // 5 minutes TTL
            JSON.stringify(cacheData));
            console.log(`🧠 Cached context: ${key}`);
            console.log(`   └─ TTL: ${RedisTTL.CONTEXT} seconds (5 minutes)`);
            console.log(`   └─ Size: ${context.length} characters`);
        }
        catch (error) {
            console.error('❌ Failed to cache context:', error);
            throw error;
        }
    }
    /**
     * Retrieve context cache data
     *
     * @param userId - User identifier
     * @param agentRole - Agent role
     * @param taskId - Task identifier
     * @returns Cached context or null if not found/expired
     */
    async getContextCache(userId, agentRole, taskId) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.CONTEXT(userId, agentRole, taskId);
        try {
            const data = await redis.get(key);
            if (!data) {
                console.log(`📭 No context cache found: ${key}`);
                return null;
            }
            const parsed = JSON.parse(data);
            const ageInSeconds = Math.round((Date.now() - parsed.timestamp) / 1000);
            console.log(`📋 Retrieved context cache: ${key}`);
            console.log(`   └─ Age: ${ageInSeconds} seconds`);
            console.log(`   └─ Size: ${parsed.context.length} characters`);
            return parsed.context;
        }
        catch (error) {
            console.error('❌ Failed to retrieve context cache:', error);
            return null;
        }
    }
    /**
     * Clear context cache for a user (used when user completes steps)
     */
    async clearUserContextCache(userId) {
        const redis = await this.ensureConnected();
        // Find all context cache keys for this user
        const pattern = `ctx:${userId}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
            console.log(`🗑️ Cleared ${keys.length} context cache entries for user ${userId}`);
        }
    }
    // =================================================================
    // USER DATA CACHE MANAGEMENT
    // Replaces: VectorMemoryService.userDataCache Map  
    // =================================================================
    /**
     * Store user data cache
     *
     * @param userId - User identifier
     * @param userData - User data to cache
     */
    async setUserDataCache(userId, userData) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.USER_DATA(userId);
        try {
            // Medium TTL for user data (4 hours)
            await redis.setex(key, RedisTTL.USER_DATA, // 4 hours TTL
            JSON.stringify(userData));
            console.log(`👤 Cached user data: ${key}`);
            console.log(`   └─ TTL: ${RedisTTL.USER_DATA} seconds (4 hours)`);
            console.log(`   └─ Progress items: ${userData.userProgress.length}`);
            console.log(`   └─ Conversations: ${userData.allConversations.length}`);
            console.log(`   └─ Insights: ${userData.agentInsights.length}`);
        }
        catch (error) {
            console.error('❌ Failed to cache user data:', error);
            throw error;
        }
    }
    /**
     * Retrieve user data cache
     *
     * @param userId - User identifier
     * @returns Cached user data or null if not found/expired
     */
    async getUserDataCache(userId) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.USER_DATA(userId);
        try {
            const data = await redis.get(key);
            if (!data) {
                console.log(`📭 No user data cache found: ${key}`);
                return null;
            }
            const parsed = JSON.parse(data);
            const ageInHours = Math.round((Date.now() - parsed.lastUpdated) / (1000 * 60 * 60));
            console.log(`👤 Retrieved user data cache: ${key}`);
            console.log(`   └─ Age: ${ageInHours} hours`);
            console.log(`   └─ Progress items: ${parsed.userProgress.length}`);
            console.log(`   └─ Conversations: ${parsed.allConversations.length}`);
            return parsed;
        }
        catch (error) {
            console.error('❌ Failed to retrieve user data cache:', error);
            return null;
        }
    }
    /**
     * Clear user data cache (force refresh)
     */
    async clearUserDataCache(userId) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.USER_DATA(userId);
        await redis.del(key);
        console.log(`🗑️ Cleared user data cache: ${key}`);
    }
    // =================================================================
    // AGENT INSIGHTS MANAGEMENT
    // =================================================================
    /**
     * Store agent insights
     */
    async setAgentInsights(userId, agentRole, insights) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.AGENT_INSIGHTS(userId, agentRole);
        const insightData = {
            insights,
            agentRole,
            userId,
            timestamp: Date.now()
        };
        await redis.setex(key, RedisTTL.AGENT_INSIGHTS, // 1 hour TTL
        JSON.stringify(insightData));
        console.log(`🧠 Stored agent insights: ${key}`);
    }
    /**
     * Retrieve agent insights
     */
    async getAgentInsights(userId, agentRole) {
        const redis = await this.ensureConnected();
        const key = RedisKeys.AGENT_INSIGHTS(userId, agentRole);
        const data = await redis.get(key);
        if (!data)
            return null;
        const parsed = JSON.parse(data);
        return parsed.insights;
    }
    // =================================================================
    // UTILITY AND MONITORING METHODS
    // =================================================================
    /**
     * Get memory usage statistics from Redis
     */
    async getMemoryStats() {
        const redis = await this.ensureConnected();
        try {
            // Count different types of keys
            const allKeys = await redis.keys('*');
            const conversationKeys = await redis.keys('conv:*');
            const contextKeys = await redis.keys('ctx:*');
            const userDataKeys = await redis.keys('user:*');
            // Get Redis memory usage
            const info = await redis.info('memory');
            const memoryMatch = info.match(/used_memory_human:(.+)/);
            const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';
            return {
                totalKeys: allKeys.length,
                conversationKeys: conversationKeys.length,
                contextKeys: contextKeys.length,
                userDataKeys: userDataKeys.length,
                redisMemoryUsed: memoryUsed
            };
        }
        catch (error) {
            console.error('❌ Failed to get memory stats:', error);
            throw error;
        }
    }
    /**
     * Clean up all expired keys (manual cleanup)
     * Redis does this automatically, but you can force it
     */
    async cleanupExpiredKeys() {
        const redis = await this.ensureConnected();
        // Get all keys and check their TTL
        const allKeys = await redis.keys('*');
        let expiredCount = 0;
        for (const key of allKeys) {
            const ttl = await redis.ttl(key);
            // TTL -2 means key doesn't exist or expired
            // TTL -1 means key exists but has no expiration
            if (ttl === -2) {
                expiredCount++;
            }
        }
        console.log(`🗑️ Manual cleanup found ${expiredCount} expired keys`);
        return expiredCount;
    }
    /**
     * Emergency: Clear all memory data (use with caution!)
     */
    async clearAllMemoryData() {
        const redis = await this.ensureConnected();
        const stats = await this.getMemoryStats();
        console.warn(`⚠️ Clearing ALL memory data (${stats.totalKeys} keys)`);
        await redis.flushdb(); // Clear current database only
        console.log('🗑️ All memory data cleared');
    }
}
// Export singleton instance
export const redisMemoryService = new RedisMemoryService();
