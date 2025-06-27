import { ConversationSummaryBufferMemory } from "langchain/memory";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";

export class MemoryService {
  private conversationMemories: Map<string, ConversationSummaryBufferMemory>;
  private questionModel: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;

  constructor(questionModel: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference) {
    this.conversationMemories = new Map();
    this.questionModel = questionModel;
  }

  getConversationMemory(sessionId: string): ConversationSummaryBufferMemory {
    if (!this.conversationMemories.has(sessionId)) {
      const memory = new ConversationSummaryBufferMemory({
        llm: this.questionModel,
        maxTokenLimit: 1000,
        returnMessages: true,
      });

      this.conversationMemories.set(sessionId, memory);
    }
    return this.conversationMemories.get(sessionId)!;
  }

}