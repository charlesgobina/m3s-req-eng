import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import retriever from "../utils/retriever.js";
import { combineDocuments } from "../utils/combineDocuments.js";
import {
  LearningTask,
  TeamMember,
  Subtask,
  Steps,
} from "../types/index.js";
import { MemoryService } from "./memoryService.js";
import { AgentFactory } from "./agentFactory.js";
import { ValidationService } from "./validationService.js";
import dotenv from "dotenv";
dotenv.config();


export class AgentService {
  private model: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;
  private questionModel: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;
  private learningTasks: LearningTask[];
  private memoryService: MemoryService;
  private agentFactory: AgentFactory;
  private validationService: ValidationService;

  constructor() {
    // Initialize models
    this.model = new ChatGroq({
      model: "gemma2-9b-it",
      temperature: 0,
      apiKey: process.env.GROQ_API_KEY,
      streaming: true,
    });

    this.questionModel = new ChatGroq({
      model: "gemma2-9b-it",
      temperature: 0,
      apiKey: process.env.GROQ_API_KEY,
      streaming: false,
    });

    // Initialize services
    this.memoryService = new MemoryService(this.questionModel);
    this.agentFactory = new AgentFactory(this.model);
    this.validationService = new ValidationService(this.memoryService, this.agentFactory);
    
    this.learningTasks = this.getLearningTasks();
  }

  async initialize() {
    console.log("AgentService initialized");
  }



  // Generate standalone question from user input
  private async generateStandaloneQuestion(
    userMessage: string,
    conversationHistory?: string
  ): Promise<string> {
    const prompt = `You are an expert at converting conversational questions into clear, standalone questions for information retrieval.

TASK: Convert the user's message into a clear, standalone question that can be used to search for relevant information.

GUIDELINES:
1. Remove conversational noise (greetings, filler words, etc.)
2. Make the question self-contained (no pronouns without clear antecedents)
3. Focus on the core information need
4. Keep the original intent and context
5. If it's already clear and standalone, return it as-is

${conversationHistory ? `CONVERSATION CONTEXT:\n${conversationHistory}\n` : ''}

USER MESSAGE: "${userMessage}"

STANDALONE QUESTION:`;

    try {
      const response = await this.questionModel.invoke([
        new SystemMessage(prompt),
        new HumanMessage(userMessage)
      ]);

      if (typeof response === 'object' && response !== null && 'content' in response) {
        return response.content.toString().trim();
      }
      return typeof response === 'string' ? response.trim() : String(response).trim();
    } catch (error) {
      console.error('Error generating standalone question:', error);
      // Fallback to original message if processing fails
      return userMessage;
    }
  }

  // Retrieve relevant context using standalone question
  private async retrieveRelevantContext(standaloneQuestion: string): Promise<string> {
    try {
      const relevantDocs = await retriever._getRelevantDocuments(standaloneQuestion);
      
      // Log retrieved documents for debugging
      console.log('\n=== RETRIEVED DOCUMENTS ===');
      console.log(`Query: "${standaloneQuestion}"`);
      console.log(`Documents found: ${relevantDocs.length}`);
      
      if (relevantDocs.length === 0) {
        console.log('No documents retrieved from vector store');
        return "No specific project context found for this question.";
      }

      relevantDocs.forEach((doc, index) => {
        console.log(`\n--- Document ${index + 1} ---`);
        console.log(`Source: ${doc.metadata?.source || 'Unknown'}`);
        console.log(`Content preview: ${doc.pageContent.substring(0, 150)}...`);
      });
      console.log('=== END RETRIEVED DOCUMENTS ===\n');

      return combineDocuments(relevantDocs);
    } catch (error) {
      console.error('Error retrieving context:', error);
      return "Error retrieving project context.";
    }
  }

  async routeToAgent(
    message: string,
    taskId: string,
    preferredAgent?: string
  ): Promise<string> {
    if (preferredAgent && this.agentFactory.getTeamAgent(preferredAgent)) {
      return preferredAgent;
    }

    const task = this.learningTasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Invalid task ID");

    const routingPrompt = `You are an intelligent routing agent for a requirements engineering learning system.

CURRENT TASK: ${task.name} (${task.phase})
TASK DESCRIPTION: ${task.description}
STUDENT MESSAGE: "${message}"

AVAILABLE TEAM MEMBERS:
${this.agentFactory.getTeamMembers()
  .map((m) => `- ${m.role} (${m.name}): ${m.expertise.join(", ")}`)
  .join("\n")}

Based on the student's message and current task, which team member would be MOST helpful to respond?
Consider:
1. The team member's expertise alignment with the question
2. The current learning phase
3. The type of guidance needed

Respond with ONLY the role name (e.g., "Product Owner", "Business Analyst", etc.)`;

    const routingAgent = this.agentFactory.getRoutingAgent();
    const response = await routingAgent.invoke({
      messages: [new SystemMessage(routingPrompt), new HumanMessage(message)],
    });

    const suggestedRole =
      response.messages[response.messages.length - 1].content.trim();

    const validRole = this.agentFactory.getTeamMembers().find(
      (m) => m.role.toLowerCase() === suggestedRole.toLowerCase()
    );

    return validRole ? validRole.role : "Business Analyst";
  }

  async chatWithAgent(
    message: string,
    taskId: string,
    subtask: Subtask,
    step: Steps,
    agentRole: string,
    sessionId: string,
  ): Promise<AsyncIterable<string>> {
    const task = this.learningTasks.find((t) => t.id === taskId);
    const member = this.agentFactory.getTeamMembers().find((m) => m.role === agentRole);

    if (!task || !subtask || !member) {
      throw new Error("Invalid task or team member");
    }

    // Get conversation memory for this session
    const memory = this.memoryService.getConversationMemory(sessionId);

    // Generate standalone question using conversation context
    const conversationHistory = await memory.chatHistory.getMessages();
    const contextString = conversationHistory.length > 0 
      ? conversationHistory.slice(-4).map(msg => `${msg._getType()}: ${msg.content}`).join('\n')
      : "";
    
    const standaloneQuestion = await this.generateStandaloneQuestion(message, contextString);
    const retrievedContext = await this.retrieveRelevantContext(standaloneQuestion);

    const systemPrompt = this.buildTeamMemberPrompt(
      member,
      task,
      subtask,
      step,
      sessionId,
      retrievedContext,
      message,
      standaloneQuestion
    );

    const agent = this.agentFactory.getTeamAgent(agentRole);
    if (!agent) {
      throw new Error(`Agent not found for role: ${agentRole}`);
    }

    // Get messages from conversation memory (automatically managed)
    const memoryMessages = await memory.chatHistory.getMessages();
    const managedMessages = [
      new SystemMessage(systemPrompt),
      ...memoryMessages.slice(-4), // Keep last 4 messages (2 pairs)
      new HumanMessage(message)
    ];

    console.log(`\n=== MEMORY MANAGEMENT ===`);
    console.log(`Session: ${sessionId}`);
    console.log(`Agent: ${agentRole}`);
    console.log(`Total messages in memory: ${memoryMessages.length}`);
    console.log(`Messages being sent to model: ${managedMessages.length}`);
    console.log(`=== END MEMORY MANAGEMENT ===\n`);

    // Use invoke for standard agent response
    const response = await agent.invoke({
      messages: managedMessages,
    });

    // Get the agent's response content
    const agentResponse = response.messages[response.messages.length - 1].content;

    // Save conversation to memory
    await memory.saveContext(
      { input: message },
      { output: agentResponse }
    );

    // Return the response as an async generator for compatibility
    return this.createAsyncGenerator(agentResponse);
  }

  // Simple async generator for compatibility with streaming interface
  private async *createAsyncGenerator(response: string): AsyncIterable<string> {
    yield response;
  }

  async validateSubmission(
    submission: string,
    taskId: string,
    subTask: Subtask,
    step: Steps,
    sessionId: string,
  ): Promise<{
    score: number;
    feedback: string;
    recommendations: string;
    passed: boolean;
  }> {
    return await this.validationService.validateSubmission(
      submission,
      taskId,
      subTask,
      step,
      sessionId,
      this.learningTasks,
      this.generateStandaloneQuestion.bind(this),
      this.retrieveRelevantContext.bind(this)
    );
  }

  // private async *streamResponse(response: any, sessionId: string, agentRole: string): AsyncIterable<string> {
  //   let fullResponse = "";
  //   try {
  //     for await (const chunk of response) {
  //       let content = "";

  //       if (chunk && chunk.content) {
  //         content = chunk.content;
  //       } else if (typeof chunk === "string") {
  //         content = chunk;
  //       }

  //       if (content && content.trim()) {
  //         fullResponse += content;
  //         yield content;
  //       }
  //     }

  //     // Update conversation summary with agent's response
  //     if (fullResponse.trim()) {
  //       this.updateConversationSummary(sessionId, fullResponse, agentRole);
  //     }
  //   } catch (error: any) {
  //     console.error("Stream error:", error);
  //     yield `[ERROR] ${error.message}`;
  //   }
  // }

  private buildTeamMemberPrompt(
    member: TeamMember,
    task: LearningTask,
    subTask: Subtask,
    step: Steps,
    sessionId: string,
    retrievedContext: string,
    originalQuestion: string,
    standaloneQuestion: string
  ): string {
    return `You are ${member.name}, a ${member.role} with expertise in ${member.expertise.join(", ")}. You follow the INTERACTION GUIDELINES given to you to respond to user queries.

CRITICAL CONSTRAINT: You MUST base your responses ONLY on the RELEVANT PROJECT INFORMATION provided below. DO NOT use any general knowledge or information outside of what is explicitly provided in the project context. If the provided context doesn't contain enough information to answer the question, you must clearly state that you need more project-specific information.

PERSONAL PROFILE:
${member.detailedPersona}

COMMUNICATION STYLE: ${member.communicationStyle}
WORK APPROACH: ${member.workApproach}
PREFERRED FRAMEWORKS: ${member.preferredFrameworks.join(", ")}

STUDENT'S QUESTION CONTEXT:
Original Question: "${originalQuestion}"
Clarified Question: "${standaloneQuestion}"

RELEVANT PROJECT INFORMATION (YOUR ONLY KNOWLEDGE SOURCE):
${retrievedContext}

CURRENT LEARNING TASK: ${task.name}
Task Phase: ${task.phase}

AND YOU ARE CURRENTLY WORKING ON:
STEP: ${step.step} found in the
SUBTASK: ${subTask.name} with
Subtask Description: ${subTask.description} the objective of this step is ${step.objective} and validation criteria are ${step.validationCriteria.join(", ")}

TEAM COLLEAGUES:
${this.agentFactory.getTeamMembers()
  .filter((m) => m.role !== member.role)
  .map((m) => `- ${m.name} (${m.role}): ${m.expertise.slice(0, 2).join(", ")}`)
  .join("\n")}

INTERACTION GUIDELINES:

1. STRICT CONTEXT ADHERENCE:
   - ONLY use information from the "RELEVANT PROJECT INFORMATION" section above
   - If the context doesn't contain enough information, say: "Based on the project information I have access to, I don't have enough details to answer that fully. Could you provide more project-specific context or documents?"
   - Never make assumptions or use general knowledge beyond the provided context

2. NATURAL CONVERSATION FLOW:
   - Respond naturally like a real colleague would, but always within the bounds of the provided project context
   - If greeted casually, respond casually first, then guide conversation toward project matters when appropriate

3. COLLABORATIVE BRAINSTORMING:
   - Guide the student through discovery using ONLY the provided project information
   - DON'T GIVE DIRECT ANSWERS for ${step.step} but guide them to accomplish the objective: ${step.objective}
   - Ask questions that help them explore the provided context

4. COLLEAGUE REFERRALS:
   - When the provided context suggests another colleague might help, suggest speaking with them
   - Use their names: "You should definitely run this by Sarah" or "Michael would have great insights on this"
   - Only suggest this when the context indicates their expertise would be relevant

5. CONTEXT AWARENESS:
   - Be aware of previous conversation topics, but always stay within project context bounds
   - Build on previous points that relate to the provided project information
   - Don't repeat information already covered unless clarification is needed

6. RESPONSE VALIDATION:
   - Before responding, verify that your answer is supported by the provided project context
   - If you're unsure, ask for clarification rather than guessing

REMEMBER: You are a project team member with access ONLY to the specific project documents and information provided above. You cannot access or reference any information outside of this context. If you need more information, you must ask for it.`;
  }


  private getLearningTasks(): LearningTask[] {
    return [
      {
        id: "home",
        taskNumber: 1,
        name: "Home",
        description:
          "Welcome to the Campus Smart Dining project! This is your starting point for all learning tasks related to requirements engineering.",
        phase: "Introduction",
        objective: "Familiarize yourself with the project and its objectives",
        subtasks: [
          
        ],
      },

      {
        id: "stakeholder_identification_analysis",
        taskNumber: 2,
        name: "Stakeholder Identification & Analysis",
        description:
          "Identify and analyze all stakeholders who will be affected by or can influence the Campus Smart Dining system",
        phase: "Requirements Discovery",
        objective: "Master stakeholder identification and analysis techniques",
        subtasks: [
          {
            id: "stakeholder_identification",
            subtaskNumber: 1,
            name: "Stakeholder Identification",
            description:
              "Identify all individuals and groups who will be affected by or can influence the system",
            
            steps: [
              {
                id: "comprehensive_stakeholder_list",
                stepNumber: 1,
                step: "Comprehensive stakeholder list",
                objective: "Provide a complete list of all identified stakeholders",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 6 different stakeholder types",
                ],
                deliverables: ["Stakeholder register", "Stakeholder map"],
                primaryAgent: "Product Owner",
              },
              {
                id: "stakeholder_categorization",
                stepNumber: 2,
                step: "Stakeholder categorization (primary/secondary/key)",
                objective: "Categorization of stakeholders based on their influence and interest",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Categorizes stakeholders into primary, secondary, and key groups",
                  "Considers both influence and interest levels",
                  "Involves relevant stakeholders in the categorization process",
                ],
                deliverables: ["Stakeholder categorization report"],
                primaryAgent: "Product Owner",  
              },
              {
                id: "direct_and_indirect_stakeholders",
                stepNumber: 3,
                step: "Direct and indirect stakeholders",
                objective: "Categorization of stakeholders based on their direct or indirect influence on the project",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Creates a preliminary influence-interest matrix",
                  "Maps at least 5 stakeholders",
                  "Considers both influence and interest levels",
                ],
                deliverables: ["Initial influence-interest matrix"],
                primaryAgent: "Product Owner",
              }
            ],
            
          },
          {
            id: "stakeholder_analysis",
            subtaskNumber: 2,
            name: "Stakeholder Analysis & Prioritization",
            description:
              "Analyze stakeholder characteristics, needs, influence levels, and potential conflicts",
            
            steps: [
              {
                id: "stakeholder_power_dynamics",
                stepNumber: 1,
                step: "Stakeholder power dynamics",
                objective: "Understanding of how stakeholder power influences project outcomes",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 3 key power dynamics",
                  "Explains how these dynamics affect project success",
                  "Considers both positive and negative influences",
                ],
                deliverables: ["Power dynamics analysis report"],
                primaryAgent: "Product Owner",
              },
              {
                id: "engagement_strategies",
                stepNumber: 2,
                step: "Engagement strategies",
                objective: "Proposed strategies for engaging with each stakeholder group",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies appropriate engagement strategies for each stakeholder group",
                  "Considers stakeholder preferences and concerns",
                  "Involves stakeholders in the development of engagement strategies",
                ],
                deliverables: ["Stakeholder engagement plan"],
                primaryAgent: "Product Owner",
              }
            ],
            
          },
          
        ],
      },
    ];
  }

  getTeamMembersList(): TeamMember[] {
    return this.agentFactory.getTeamMembers();
  }

  getLearningTasksList(): LearningTask[] {
    return this.learningTasks;
  }
}
