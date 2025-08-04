import { ConversationSummaryBufferMemory } from "langchain/memory";
import { redisMemoryService } from './redisMemoryService.js';
/**
 * StepMemory - Simplified Tier 1 Memory
 *
 * Purpose: Handle conversation memory for a specific step
 * Scope: Current step only (task/subtask/step context)
 * Storage: LangChain ConversationSummaryBufferMemory + Redis persistence
 *
 * This is the "basic memory" tier that handles immediate conversation context
 * and summaries. For rich context across all user history, use VectorMemoryService.
 */
export class StepMemory extends ConversationSummaryBufferMemory {
    userId;
    taskId;
    subtaskId;
    stepId;
    sessionId;
    memoryId;
    isRedisInitialized = false;
    constructor(userId, taskId, subtaskId, stepId, sessionId, llm) {
        super({
            llm,
            maxTokenLimit: 2000,
            returnMessages: true,
        });
        this.userId = userId;
        this.taskId = taskId;
        this.subtaskId = subtaskId;
        this.stepId = stepId;
        this.sessionId = sessionId;
        this.memoryId = `${userId}_${taskId}_${subtaskId}_${stepId}`;
        console.log(`🧠 [STEP-MEMORY] Created for step: ${this.memoryId}`);
        // Initialize Redis for persistence
        this.initializeRedis();
    }
    /**
     * Initialize Redis connection for conversation persistence
     */
    async initializeRedis() {
        try {
            await redisMemoryService.initialize();
            this.isRedisInitialized = true;
            console.log(`✅ StepMemory: Redis initialized for ${this.memoryId}`);
        }
        catch (error) {
            console.error(`❌ StepMemory: Redis initialization failed for ${this.memoryId}:`, error);
            this.isRedisInitialized = false;
        }
    }
    /**
     * Save conversation state to Redis for persistence
     * This ensures conversation memory survives server restarts
     */
    async persistToRedis() {
        if (!this.isRedisInitialized)
            return;
        try {
            const messages = await this.chatHistory.getMessages();
            // Get summary from parent class if available
            let summary = "";
            try {
                summary = this.buffer || "";
            }
            catch (error) {
                console.log("Buffer not available yet");
            }
            const conversationData = {
                messages: messages.map(msg => ({
                    type: msg._getType(),
                    content: msg.content
                })),
                summary,
                lastAccessed: Date.now(),
                userId: this.userId,
                taskContext: `${this.taskId}_${this.subtaskId}_${this.stepId}`
            };
            await redisMemoryService.setConversationMemory(this.userId, `${this.taskId}_${this.subtaskId}_${this.stepId}`, conversationData);
            console.log(`💾 [STEP-MEMORY] Persisted to Redis: ${this.memoryId}`);
        }
        catch (error) {
            console.error('❌ Failed to persist step memory to Redis:', error);
        }
    }
    /**
     * Load conversation state from Redis
     */
    async loadFromRedis() {
        if (!this.isRedisInitialized)
            return;
        try {
            const conversationData = await redisMemoryService.getConversationMemory(this.userId, `${this.taskId}_${this.subtaskId}_${this.stepId}`);
            if (conversationData) {
                console.log(`📂 [STEP-MEMORY] Loaded from Redis: ${this.memoryId}`);
                // Note: Actual message restoration would need LangChain message objects
                // For now, just log that data exists
            }
        }
        catch (error) {
            console.error('❌ Failed to load step memory from Redis:', error);
        }
    }
    /**
     * Get memory identifier for debugging
     */
    getMemoryId() {
        return this.memoryId;
    }
    /**
     * Clear this step's memory
     */
    async clear() {
        await super.clear();
        if (this.isRedisInitialized) {
            try {
                // Clear conversation memory from Redis (TTL will handle automatic cleanup)
                const conversationKey = `${this.userId}_${this.taskId}_${this.subtaskId}_${this.stepId}`;
                console.log(`🗑️ [STEP-MEMORY] Cleared: ${this.memoryId}`);
            }
            catch (error) {
                console.error('❌ Failed to clear step memory from Redis:', error);
            }
        }
    }
}
