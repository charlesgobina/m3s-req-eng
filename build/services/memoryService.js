import { StepMemory } from "./stepMemory.js";
import { VectorMemoryService } from "./vectorMemoryService.js";
import { redisMemoryService } from "./redisMemoryService.js";
/**
 * MemoryService - Simplified Two-Tier Memory Architecture
 *
 * This service provides a clean, simple interface to the two-tier memory system:
 *
 * Tier 1 (StepMemory): Basic conversation memory for current step
 * - LangChain ConversationSummaryBufferMemory
 * - Redis persistence
 * - Step-specific context only
 *
 * Tier 2 (VectorMemoryService): Universal context via vector search
 * - RAG-based semantic search across ALL user data
 * - Embeddings of progress, conversations, insights
 * - Universal context for any agent
 */
export class MemoryService {
    questionModel;
    vectorMemory;
    stepMemories = new Map();
    isRedisInitialized = false;
    constructor(questionModel) {
        this.questionModel = questionModel;
        this.vectorMemory = new VectorMemoryService(questionModel);
        // Initialize Redis connection
        this.initializeRedis();
    }
    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        try {
            await redisMemoryService.initialize();
            this.isRedisInitialized = true;
            console.log('✅ MemoryService: Redis initialized');
        }
        catch (error) {
            console.error('❌ MemoryService: Redis initialization failed:', error);
            this.isRedisInitialized = false;
        }
    }
    /**
     * TIER 1: Get basic conversation memory for a specific step
     *
     * Use this for immediate conversation context within a step.
     * Handles conversation summaries, token limits, and message history.
     */
    async getStepMemory(userId, taskId, subtaskId, stepId) {
        const memoryKey = `${userId}_${taskId}_${subtaskId}_${stepId}`;
        // Return existing memory if already created
        if (this.stepMemories.has(memoryKey)) {
            return this.stepMemories.get(memoryKey);
        }
        // Create new step memory
        const sessionId = `user_${userId}_step_${taskId}_${subtaskId}_${stepId}`;
        const stepMemory = new StepMemory(userId, taskId, subtaskId, stepId, sessionId, this.questionModel);
        // Try to load existing conversation from Redis
        await stepMemory.loadFromRedis();
        // Cache the memory instance
        this.stepMemories.set(memoryKey, stepMemory);
        console.log(`🧠 [MEMORY-SERVICE] Created step memory: ${memoryKey}`);
        return stepMemory;
    }
    /**
     * TIER 2: Get universal context via vector search
     *
     * Use this to enrich agent responses with comprehensive context
     * from ALL user history (progress, conversations, insights).
     */
    async getUniversalContext(userId, agentRole, userQuestion, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        console.log(`🔍 [MEMORY-SERVICE] Getting universal context for ${agentRole}`);
        return await this.vectorMemory.getComprehensiveContext(userId, agentRole, userQuestion, fullStepId);
    }
    /**
     * Save interaction to vector memory for future context
     */
    async saveInteraction(userId, agentRole, userMessage, agentResponse, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        // Save to vector memory for universal context
        await this.vectorMemory.saveInteraction(userId, agentRole, userMessage, agentResponse, fullStepId);
        // Persist step memory to Redis
        const stepMemory = await this.getStepMemory(userId, taskId, subtaskId, stepId);
        await stepMemory.persistToRedis();
        console.log(`💾 [MEMORY-SERVICE] Saved interaction for ${userId}`);
    }
    /**
     * Handle step changes - refresh caches and update context
     */
    async onStepChange(userId, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        // Notify vector memory of step change
        await this.vectorMemory.onStepChange(userId, fullStepId);
        // Clear old step memories to prevent memory leaks
        await this.cleanupOldStepMemories(userId);
        console.log(`🔄 [MEMORY-SERVICE] Handled step change: ${fullStepId}`);
    }
    /**
     * Clean up old step memories to prevent memory leaks
     */
    async cleanupOldStepMemories(userId) {
        const userMemories = Array.from(this.stepMemories.entries())
            .filter(([key]) => key.startsWith(`${userId}_`));
        // Keep only the 3 most recent step memories per user
        if (userMemories.length > 3) {
            const oldMemories = userMemories.slice(0, -3);
            for (const [key, memory] of oldMemories) {
                await memory.persistToRedis(); // Save before cleanup
                this.stepMemories.delete(key);
                console.log(`🗑️ [MEMORY-SERVICE] Cleaned up old step memory: ${key}`);
            }
        }
    }
    /**
     * Get memory statistics for monitoring
     */
    getMemoryStats() {
        return {
            activeStepMemories: this.stepMemories.size,
            redisInitialized: this.isRedisInitialized,
        };
    }
    /**
     * Force cleanup of all memories (useful for testing)
     */
    async cleanup() {
        console.log('🧹 [MEMORY-SERVICE] Starting cleanup...');
        // Persist all step memories before cleanup
        for (const [key, memory] of this.stepMemories.entries()) {
            await memory.persistToRedis();
        }
        // Clear the in-memory cache
        this.stepMemories.clear();
        console.log('✅ [MEMORY-SERVICE] Cleanup completed');
    }
}
