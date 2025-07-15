import { ConversationSummaryBufferMemory } from "langchain/memory";
export class MemoryService {
    conversationMemories;
    questionModel;
    constructor(questionModel) {
        this.conversationMemories = new Map();
        this.questionModel = questionModel;
    }
    getConversationMemory(sessionId) {
        if (!this.conversationMemories.has(sessionId)) {
            const memory = new ConversationSummaryBufferMemory({
                llm: this.questionModel,
                maxTokenLimit: 2000,
                returnMessages: true,
            });
            this.conversationMemories.set(sessionId, memory);
        }
        return this.conversationMemories.get(sessionId);
    }
}
