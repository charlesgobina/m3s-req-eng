import { SmartProgressMemory } from "./smartProgressMemory.js";
import { ComprehensiveMemoryService } from "./comprehensiveMemoryService.js";
export class EnhancedMemoryService {
    conversationMemories;
    comprehensiveMemory;
    questionModel;
    constructor(questionModel) {
        this.conversationMemories = new Map();
        this.questionModel = questionModel;
        this.comprehensiveMemory = new ComprehensiveMemoryService(questionModel);
    }
    // Updated to use SmartProgressMemory
    getConversationMemory(sessionId, userId, taskId, subtaskId, stepId) {
        // Use user-scoped memory key for better continuity
        const memoryKey = `${userId}_${taskId}_${subtaskId}_${stepId}`;
        if (!this.conversationMemories.has(memoryKey)) {
            const memory = new SmartProgressMemory(userId, taskId, subtaskId, stepId, sessionId, this.questionModel, {
                maxTokenLimit: 2000,
                returnMessages: true,
            });
            this.conversationMemories.set(memoryKey, memory);
            console.log(`🧠 Created new smart memory for: ${memoryKey}`);
        }
        return this.conversationMemories.get(memoryKey);
    }
    // Method to refresh all memories for a user when they complete a step
    async refreshUserMemories(userId) {
        try {
            const userMemories = Array.from(this.conversationMemories.entries())
                .filter(([key]) => key.startsWith(`${userId}_`))
                .map(([_, memory]) => memory);
            // Invalidate cache for all user memories
            await Promise.all(userMemories.map(memory => memory.invalidateCache()));
            console.log(`✅ Refreshed ${userMemories.length} memories for user ${userId}`);
        }
        catch (error) {
            console.error('❌ Error refreshing user memories:', error);
        }
    }
    // Clean up old memories
    cleanupOldMemories(maxAge = 24 * 60 * 60 * 1000) {
        console.log('🗑️ Cleaning up old memories...');
        // Implementation for memory cleanup based on age
        // Could track last access time and remove stale memories
    }
    // Get memory for specific user and context
    getSmartProgressMemory(userId, taskId, subtaskId, stepId) {
        // Generate a consistent sessionId for the user's learning journey
        const learningSessionId = `user_${userId}_learning_session`;
        return this.getConversationMemory(learningSessionId, userId, taskId, subtaskId, stepId);
    }
    // NEW: Get comprehensive context using RAG-based memory
    async getComprehensiveContext(userId, agentRole, userQuestion, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        return await this.comprehensiveMemory.getComprehensiveContext(userId, agentRole, userQuestion, fullStepId);
    }
    // NEW: Save interaction to comprehensive memory
    async saveInteraction(userId, agentRole, userMessage, agentResponse, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        await this.comprehensiveMemory.saveInteraction(userId, agentRole, userMessage, agentResponse, fullStepId);
    }
    // NEW: Handle step changes
    async onStepChange(userId, taskId, subtaskId, stepId) {
        const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
        await this.comprehensiveMemory.onStepChange(userId, fullStepId);
    }
}
