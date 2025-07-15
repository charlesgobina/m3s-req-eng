import { SmartProgressMemory } from "./smartProgressMemory.js";
import { ComprehensiveMemoryService } from "./comprehensiveMemoryService.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";

export class EnhancedMemoryService {
  private conversationMemories: Map<string, SmartProgressMemory>;
  private comprehensiveMemory: ComprehensiveMemoryService;
  private questionModel: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;

  constructor(questionModel: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference) {
    this.conversationMemories = new Map();
    this.questionModel = questionModel;
    this.comprehensiveMemory = new ComprehensiveMemoryService(questionModel);
  }

  // Updated to use SmartProgressMemory
  getConversationMemory(
    sessionId: string,
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): SmartProgressMemory {
    // Use user-scoped memory key for better continuity
    const memoryKey = `${userId}_${taskId}_${subtaskId}_${stepId}`;
    
    if (!this.conversationMemories.has(memoryKey)) {
      const memory = new SmartProgressMemory(
        userId,
        taskId,
        subtaskId,
        stepId,
        sessionId,
        this.questionModel,
        {
          maxTokenLimit: 2000,
          returnMessages: true,
        }
      );

      this.conversationMemories.set(memoryKey, memory);
      console.log(`🧠 Created new smart memory for: ${memoryKey}`);
    }
    
    return this.conversationMemories.get(memoryKey)!;
  }

  // Method to refresh all memories for a user when they complete a step
  async refreshUserMemories(userId: string): Promise<void> {
    try {
      const userMemories = Array.from(this.conversationMemories.entries())
        .filter(([key]) => key.startsWith(`${userId}_`))
        .map(([_, memory]) => memory);

      // Invalidate cache for all user memories
      await Promise.all(
        userMemories.map(memory => memory.invalidateCache())
      );
      
      console.log(`✅ Refreshed ${userMemories.length} memories for user ${userId}`);
    } catch (error) {
      console.error('❌ Error refreshing user memories:', error);
    }
  }

  // Clean up old memories
  cleanupOldMemories(maxAge: number = 24 * 60 * 60 * 1000): void {
    console.log('🗑️ Cleaning up old memories...');
    // Implementation for memory cleanup based on age
    // Could track last access time and remove stale memories
  }

  // Get memory for specific user and context
  getSmartProgressMemory(
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): SmartProgressMemory {
    // Generate a consistent sessionId for the user's learning journey
    const learningSessionId = `user_${userId}_learning_session`;
    
    return this.getConversationMemory(
      learningSessionId,
      userId,
      taskId,
      subtaskId,
      stepId
    );
  }

  // NEW: Get comprehensive context using RAG-based memory
  async getComprehensiveContext(
    userId: string,
    agentRole: string,
    userQuestion: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): Promise<string> {
    const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
    return await this.comprehensiveMemory.getComprehensiveContext(
      userId,
      agentRole,
      userQuestion,
      fullStepId
    );
  }

  // NEW: Save interaction to comprehensive memory
  async saveInteraction(
    userId: string,
    agentRole: string,
    userMessage: string,
    agentResponse: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): Promise<void> {
    const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
    await this.comprehensiveMemory.saveInteraction(
      userId,
      agentRole,
      userMessage,
      agentResponse,
      fullStepId
    );
  }

  // NEW: Handle step changes
  async onStepChange(
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): Promise<void> {
    const fullStepId = `${taskId}_${subtaskId}_${stepId}`;
    await this.comprehensiveMemory.onStepChange(userId, fullStepId);
  }
}