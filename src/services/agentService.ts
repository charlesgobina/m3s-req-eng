import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import retriever from "../utils/retriever.js";
import { combineDocuments } from "../utils/combineDocuments.js";
import { LearningTask, TeamMember, Subtask, Steps } from "../types/index.js";
import { MemoryService } from "./memoryService.js";
import { AgentFactory } from "./agentFactory.js";
import { ValidationService } from "./validationService.js";
import { authService } from "./index.js";
import dotenv from "dotenv";
dotenv.config();

export class AgentService {
  // Singleton instance
  private static instance: AgentService | null = null;
  
  private model:
    | ChatOpenAI
    | ChatGroq
    | ChatGoogleGenerativeAI
    | HuggingFaceInference;
  private questionModel:
    | ChatOpenAI
    | ChatGroq
    | ChatGoogleGenerativeAI
    | HuggingFaceInference;
  private learningTasks: LearningTask[];
  private memoryService: MemoryService;
  private agentFactory: AgentFactory;
  private validationService: ValidationService;

  private constructor() {
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
    this.validationService = new ValidationService(
      this.memoryService,
      this.agentFactory
    );

    this.learningTasks = this.getLearningTasks();
    
    console.log("🔧 AgentService: Singleton instance created");
  }

  /**
   * Get singleton instance of AgentService
   * This prevents multiple instances and reduces memory usage
   */
  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      console.log("🏗️ Creating new AgentService singleton instance...");
      AgentService.instance = new AgentService();
    } else {
      console.log("♻️ Reusing existing AgentService singleton instance");
    }
    
    return AgentService.instance;
  }

  /**
   * Initialize the service (called once after getInstance)
   */
  async initialize(): Promise<void> {
    console.log("✅ AgentService initialized");
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    AgentService.instance = null;
    console.log("🗑️ AgentService singleton instance reset");
  }

  // Retrieve relevant context using user question
  private async retrieveRelevantContext(userQuestion: string): Promise<string> {
    try {
      const relevantDocs = await retriever._getRelevantDocuments(userQuestion);

      // Log retrieved documents for debugging
      console.log("\n=== RETRIEVED DOCUMENTS ===");
      console.log(`Query: "${userQuestion}"`);
      console.log(`Documents found: ${relevantDocs.length}`);

      if (relevantDocs.length === 0) {
        console.log("No documents retrieved from vector store");
        return "No specific project context found for this question.";
      }

      relevantDocs.forEach((doc, index) => {
        console.log(`\n--- Document ${index + 1} ---`);
        console.log(`Source: ${doc.metadata?.source || "Unknown"}`);
        console.log(`Content preview: ${doc.pageContent.substring(0, 150)}...`);
      });
      console.log("=== END RETRIEVED DOCUMENTS ===\n");

      return combineDocuments(relevantDocs);
    } catch (error) {
      console.error("Error retrieving context:", error);
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
${this.agentFactory
  .getTeamMembers()
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

    const validRole = this.agentFactory
      .getTeamMembers()
      .find((m) => m.role.toLowerCase() === suggestedRole.toLowerCase());

    return validRole ? validRole.role : "Business Analyst";
  }

  async chatWithAgent(
    message: string,
    taskId: string,
    subtask: Subtask,
    step: Steps,
    agentRole: string,
    sessionId: string,
    userId: string
  ): Promise<AsyncIterable<string>> {
    const task = this.learningTasks.find((t) => t.id === taskId);
    const member = this.agentFactory
      .getTeamMembers()
      .find((m) => m.role === agentRole);

    if (!task || !subtask || !member) {
      throw new Error("Invalid task or team member");
    }

    // Get smart progress memory (now async due to Redis)
    const memory = await this.memoryService.getStepMemory(
      userId,
      taskId,
      subtask.id,
      step.id
    );

    // Handle different context based on role type
    const intervieweeRoles = ["Student", "Lecturer", "Academic Advisor"];
    const isInterviewee = intervieweeRoles.includes(member.role);
    const basicProjectContext = await this.retrieveRelevantContext(message);

    let systemPrompt: string;

    if (isInterviewee) {
      // Interviewees only get basic project context
      systemPrompt = this.buildIntervieweePrompt(
        member,
        task,
        subtask,
        step,
        basicProjectContext
      );
    } else {
      // Team members get comprehensive context
      const comprehensiveContext =
        await this.memoryService.getUniversalContext(
          userId,
          agentRole,
          message,
          taskId,
          subtask.id,
          step.id
        );

      // Get user's name to personalize the interaction
      const user = await authService.getUserById(userId);
      const userName = user ? `${user.firstName} ${user.lastName}` : "Student";

      systemPrompt = this.buildEnhancedTeamAssistantPrompt(
        member,
        task,
        subtask,
        step,
        comprehensiveContext,
        userName
      );
    }

    const agent = this.agentFactory.getTeamAgent(agentRole);
    if (!agent) {
      throw new Error(`Agent not found for role: ${agentRole}`);
    }

    // Get messages from conversation memory (automatically managed)
    const memoryMessages = await memory.chatHistory.getMessages();
    const managedMessages = [
      new SystemMessage(systemPrompt),
      ...memoryMessages.slice(-4), // Keep last 4 messages (2 pairs)
      new HumanMessage(message),
    ];

    console.log(`\n=== MEMORY MANAGEMENT ===`);
    console.log(`User: ${userId}`);
    console.log(`Agent: ${agentRole}`);
    console.log(`Context: ${taskId}/${subtask.id}/${step.id}`);
    console.log(`Memory messages: ${memoryMessages.length}`);
    console.log(
      `Role type: ${
        isInterviewee
          ? "Interviewee (basic context)"
          : "Team member (comprehensive context)"
      }`
    );
    console.log(`=== END MEMORY ===\n`);

    // Use invoke for standard agent response
    const response = await agent.invoke({
      messages: managedMessages,
    });

    // Get the agent's response content
    const agentResponse =
      response.messages[response.messages.length - 1].content;

    // Save conversation to memory
    await memory.saveContext({ input: message }, { output: agentResponse });

    // Agent insights are now handled by vector memory service

    // Save interaction to comprehensive memory
    // await this.memoryService.saveInteraction(
    //   userId,
    //   agentRole,
    //   message,
    //   agentResponse,
    //   taskId,
    //   subtask.id,
    //   step.id
    // );

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
    userId?: string
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
      userId || "unknown_user",
      this.learningTasks,
      this.retrieveRelevantContext.bind(this)
    );
  }

  // Method to call when user completes a step
  async onStepCompletion(userId: string, stepData: any): Promise<void> {
    try {
      console.log(
        `🎯 [STEP-COMPLETION] Processing completion for user ${userId}`
      );

      // Memory cleanup handled automatically by MemoryService

      // Notify comprehensive memory system about step change
      if (stepData.taskId && stepData.subtaskId && stepData.stepId) {
        await this.memoryService.onStepChange(
          userId,
          stepData.taskId,
          stepData.subtaskId,
          stepData.stepId
        );
      }

      console.log(
        `✅ Step completion processed and memories updated for user ${userId}`
      );
    } catch (error) {
      console.error("❌ Error processing step completion:", error);
    }
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

  private buildIntervieweePrompt(
    member: TeamMember,
    task: LearningTask,
    subTask: Subtask,
    step: Steps,
    basicProjectContext: string
  ): string {
    return `
    You are ${member.name}, a ${
      member.role
    } at the university. You are being interviewed by a STUDENT USER who is learning about requirements engineering, using EduConnect as a resource. 
    
    IMPORTANT: The user is NOT any of the example personas mentioned in the project documentation (such as Sarah Martinez, Professor Julson Kumar, etc.). Those are fictional examples for the project specification. You are speaking with a real student user who is different from these examples.
    Your Identity and Background
    ${member.detailedPersona}
    You communicate with a ${
      member.communicationStyle
    } style, approach work through ${
      member.workApproach
    }, and have expertise in ${member.expertise.join(
      ", "
    )}. Your personality is ${member.personality}.
    Your Knowledge About EduConnect
    ${basicProjectContext}
    
    IMPORTANT: You are an interviewee, not a core team member. You only know basic information about the EduConnect project. The project documentation contains example personas (like Sarah Martinez) - these are FICTIONAL EXAMPLES, not the person you're talking to. You should respond from your role's perspective as someone who would potentially use or be involved with the system, but you don't have detailed technical knowledge or access to internal project discussions.
    Core Behavior
    You are being interviewed as a real person who would use educational technology, not as a consultant or technical expert. Share your authentic experiences, challenges, and needs from your daily work as a ${
      member.role
    }.
    Respond conversationally using personal language like "I find that..." or "In my experience..." Keep responses focused on your actual needs and pain points rather than technical solutions. When you don't know something technical, say so honestly.
    Express genuine emotions about current systems you use - frustration with clunky interfaces, satisfaction with tools that work well, or confusion about complex features. Share specific examples from your routine when relevant.
    If asked about technical implementation details, redirect to your user perspective: "I'm not sure how that would work technically, but what I need is..."
    Ask clarifying questions if you don't understand what the student is asking about your experience or needs.
    Response Guidelines
    Keep responses conversational and personal, typically 2-4 sentences. Focus on describing problems and wishes rather than providing solutions. Stay authentically in character as someone who would use the EduConnect system based on your role, personality, and communication style.
    You care about educational technology working well for people like you, but you're not a system designer - you're sharing your real user perspective to help the student understand genuine needs.
        `;
  }

  // Enhanced team assistant prompt with comprehensive memory context
  private buildEnhancedTeamAssistantPrompt(
    member: TeamMember,
    task: LearningTask,
    subTask: Subtask,
    step: Steps,
    comprehensiveContext: string,
    userName: string
  ): string {
    return member.role === "Team Lead"
      ? `
### ROLE & MISSION
You are ${member.name}, the ${
          member.role
        } assisting ${userName}, a student who is learning requirement engineering. EduConnect is a sample project designed to enhance the student's understanding on requirement engineering concepts. 

CRITICAL: You are speaking with ${userName}, a real student, not any of the fictional example personas from the project documentation (like Sarah Martinez, Professor Julson Kumar, etc.). Those are just examples in the project specification. Treat ${userName} as a unique individual learning about requirements engineering. Your mission is to act as a collaborative mentor, guiding the student through a specific requirements engineering task. You are a teacher and a teammate, not just a generic assistant.

### YOUR PERSONA
- **Identity**: ${member.detailedPersona}
- **Communication Style**: ${member.communicationStyle}
- **Work Approach**: ${member.workApproach}
- **Expertise**: ${
          member.expertise?.join(", ") || "general requirements engineering"
        }

### CURRENT LEARNING CONTEXT
- **Task**: ${userName} is working on the "${task.name}" task in the "${
          task.phase
        }" phase.
- **Step**: They are focused on "${step.step}" within the "${
          subTask.name
        }" subtask.
- **Objective**: The goal is to: ${step.objective}.
- **Success Criteria**: Success is defined by: ${
          step.validationCriteria?.join(", ") || "completing the objective"
        }.

## TEAM COLLEAGUES RESPONSIBLE FOR BUILDING THE SYSTEM
${this.agentFactory
  .getTeamMembers()
  .filter((m) => m.role !== member.role)
  .map((m) => `- ${m.name} (${m.role}): ${m.expertise.slice(0, 2).join(", ")}`)
  .join("\n")}

### KNOWLEDGE BASE & MEMORY
This is the complete context you have for this interaction. It is divided into two parts: the static **Project Context** and the dynamic **Student's Memory**. Use both to inform your response.

${comprehensiveContext}
        `
      : `### ROLE & MISSION
You are ${member.name}, the ${
          member.role
        } assisting ${userName}, a student who is learning requirement engineering. EduConnect is a sample project designed to enhance the student's understanding on requirement engineering concepts. 

CRITICAL: You are speaking with ${userName}, a real student, not any of the fictional example personas from the project documentation (like Sarah Martinez, Professor Julson Kumar, etc.). Those are just examples in the project specification. Treat ${userName} as a unique individual learning about requirements engineering. Your mission is to act as a collaborative mentor, guiding a student through a specific requirements engineering task. You are a teacher and a teammate, not just a generic assistant.

### YOUR PERSONA
- **Identity**: ${member.detailedPersona}
- **Communication Style**: ${member.communicationStyle}
- **Work Approach**: ${member.workApproach}
- **Expertise**: ${
          member.expertise?.join(", ") || "general requirements engineering"
        }

### CURRENT LEARNING CONTEXT
- **Task**: ${userName} is working on the "${task.name}" task in the "${
          task.phase
        }" phase.
- **Step**: They are focused on "${step.step}" within the "${
          subTask.name
        }" subtask.
- **Objective**: The goal is to: ${step.objective}.
- **Success Criteria**: Success is defined by: ${
          step.validationCriteria?.join(", ") || "completing the objective"
        }.

## TEAM COLLEAGUES RESPONSIBLE FOR BUILDING THE SYSTEM
${this.agentFactory
  .getTeamMembers()
  .filter((m) => m.role !== member.role)
  .map((m) => `- ${m.name} (${m.role}): ${m.expertise.slice(0, 2).join(", ")}`)
  .join("\n")}

### KNOWLEDGE BASE & MEMORY
This is the complete context you have for this interaction. It is divided into two parts: the static **Project Context** and the dynamic **Student's Memory**. Use both to inform your response.

${comprehensiveContext}

### CORE DIRECTIVES
1.  **Synthesize Knowledge**: Your primary task is to synthesize information from the **PROJECT CONTEXT** (the static knowledge about the EduConnect system) and the **STUDENT'S MEMORY** (their previous work, conversations, and insights) to provide tailored guidance.
2.  **Be a Mentor, Not an Oracle**: Use the synthesized knowledge to ask insightful, Socratic questions that guide the student toward the step's objective. Do not give away the answer directly. Your goal is to facilitate learning, not to provide solutions.
3.  **Maintain Continuity**: Reference the **STUDENT'S MEMORY** to create a seamless, continuous learning experience. For example: "I see in your previous work that you identified students as a primary stakeholder. How does that influence the requirement you're writing now?" or "Building on your conversation with Sarah about user personas..."
4.  **Embody Your Persona**: Your persona should color all your interactions. A Technical Lead should ground the conversation in feasibility, while a UX Designer should focus on user empathy, all while using the knowledge base to inform their perspective.
5.  **Handle Off-Topic Chatter Gracefully**: If the student's message is off-topic, respond briefly and politely.
6.  **Acknowledge Knowledge Gaps**: If the **PROJECT CONTEXT** lacks specific information, state it clearly and turn it into a learning moment. Example: "That's a great question. The project documents don't cover that detail. How might we approach getting an answer to that in a real-world project?"
7.  **Collaborate with the Team**: Actively suggest involving other team members when their expertise is more relevant, based on the student's needs and the team's skills.
8.  **Handling Submissions**: If the student submits a query that appears to align with the step's objective and validation criteria, Acknowledge it and tell them to try submitting it for validation using the input field to their right if they are on desktop and below if they are on mobile.

Your ultimate goal is to provide a realistic, supportive, and effective learning experience that prepares the student for real-world requirements engineering challenges.`;
  }

  private getLearningTasks(): LearningTask[] {
    return [
      {
        id: "home",
        isCompleted: false,
        taskNumber: 1,
        name: "Welcome to EduConnect",
        description:
          "Get introduced to the EduConnect project and meet your learning team",
        phase: "Introduction",
        objective:
          "Get oriented with the project and understand your learning journey",
        subtasks: [
          {
            id: "getting_started",
            isCompleted: false,
            subtaskNumber: 1,
            name: "Getting Started with EduConnect",
            description:
              "Learn about the EduConnect project and how it will help you in your requirements engineering journey",
            steps: [
              {
                id: "project_rundown",
                stepNumber: 1,
                step: "Project Rundown",
                objective:
                  "Understand the goals and scope of the EduConnect project",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "",
                ],
                deliverables: ["Project overview summary"],
                primaryAgent: "Team Lead",
                isSubmissionRequired: false,
              },
            ],
          },
          {
            id: "getting_to_know_you",
            isCompleted: false,
            subtaskNumber: 2,
            name: "Getting to Know You",
            description:
              "Let's start by getting to know each other and setting up your learning experience",
            steps: [
              {
                id: "personal_introduction",
                stepNumber: 1,
                step: "Personal Introduction",
                objective:
                  "Share your name and background so we can personalize your learning experience",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Just the student's name",
                ],
                deliverables: ["Personal introduction"],
                primaryAgent: "Team Lead",
                isSubmissionRequired: true,
                agentInstruction:
                  "As the student to introduce themselves and share their background to personalize the learning experience.",
              },
            ],
          },
          {
            id: "project_overview",
            isCompleted: false,
            subtaskNumber: 3,
            name: "Project Overview & Team Introduction",
            description:
              "Learn about the EduConnect project and meet the team you'll be working with",
            steps: [
              {
                id: "learn_about_educonnect",
                stepNumber: 1,
                step: "Learn About EduConnect",
                objective:
                  "Understand what the EduConnect project is, why it matters, and what problems it solves",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Demonstrates understanding of the project's main goals and importance",
                ],
                deliverables: ["Project understanding summary"],
                primaryAgent: "Team Lead",
                isSubmissionRequired: false,
                agentInstruction:
                  "Explain the project's goals and importance to the student. Go as far as giving a brief summary of the stakeholders involves, their names, and their roles in the project.",
              },
              {
                id: "meet_your_team",
                stepNumber: 2,
                step: "Meet Your Team",
                objective:
                  "Get to know the different experts you'll collaborate with and understand your learning journey",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Shows understanding of team roles and the collaborative learning approach",
                ],
                deliverables: ["Team roles understanding"],
                primaryAgent: "Team Lead",
                isSubmissionRequired: false,
                agentInstruction:
                  "Introduce the team members, their roles, and how they will support the student's learning journey.",
              },
            ],
          },
        ],
      },

      {
        id: "stakeholder_identification_analysis",
        isCompleted: false,
        taskNumber: 2,
        name: "Stakeholder Identification & Analysis",
        description:
          "In this task, you will identify all the stakeholders (users) who will use or be affected by the system. You will also learn to categorize them into primary and secondary stakeholders and get to know their needs and influence on the project",
        phase: "Requirements Discovery",
        objective:
          "Understand who your stakeholders are and how they influence the project",
        subtasks: [
          {
            id: "stakeholder_identification",
            isCompleted: false,
            subtaskNumber: 1,
            name: "Stakeholder Identification",
            description:
              "In this subtask, you will identify at least 6 stakeholders who will use or be affected by the system (the stakeholders). You will also learn to categorize them into primary and secondary stakeholders.",

            steps: [
              {
                id: "list_stakeholders",
                stepNumber: 1,
                step: "List all stakeholders",
                objective:
                  "Create a simple list of at least 6 stakeholders who will interact with or be affected by the EduConnect system",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Lists at least 6 different stakeholder types (students, lecturers, administrators, etc.)",
                ],
                deliverables: ["Stakeholder list"],
                primaryAgent: "Product Owner",
                isSubmissionRequired: true,
                responseFormatExample: "E.g Examiners, Government ...",
              },
              {
                id: "categorize_stakeholders",
                stepNumber: 2,
                step: "Categorize stakeholders as primary or secondary",
                objective:
                  "Remember the list you created earlier? Now, sort your stakeholders into primary (direct users) and secondary (indirect users) groups. You can always ask Sarah for help at any time.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Correctly categorizes stakeholders into primary and secondary groups with brief explanation",
                ],
                deliverables: ["Categorized stakeholder list"],
                primaryAgent: "Product Owner",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Primary: apples, bananas; Secondary: avocado"
              },
            ],
          },
          {
            id: "stakeholder_analysis",
            isCompleted: false,
            subtaskNumber: 2,
            name: "Stakeholder Analysis",
            description:
              "In this subtask, you will analyze the stakeholders you identified earlier. You will learn to understand their needs, influence, and how they relate to each other.",

            steps: [
              {
                id: "stakeholder_needs",
                stepNumber: 1,
                step: "Identify stakeholder needs",
                objective:
                  "For the students and lecturers, identify at least two specific needs and expectations from the EduConnect system",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 2 specific needs for both stakeholder groups (students and lecturers)",
                ],
                deliverables: ["Stakeholder needs list"],
                primaryAgent: "Product Owner",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Students: access to resources, Lecturers: tools for teaching etc.",
              },
              // {
              //   id: "influence_interest_matrix",
              //   stepNumber: 2,
              //   step: "Create influence-interest matrix",
              //   objective:
              //     "You are expected to create a simple influence-interest matrix to portray how much influence and interest each stakeholder has in the project. You can always ask Sarah for help at any time.",
              //   isCompleted: false,
              //   studentResponse: "",
              //   validationCriteria: [
              //     "Places stakeholders in correct quadrants of influence-interest matrix with justification",
              //   ],
              //   deliverables: ["Influence-interest matrix"],
              //   primaryAgent: "Product Owner",
              //   isSubmissionRequired: true,
              //   responseFormatExample: "E.g. High Influence/High Interest: apples; Low Influence/High Interest: bananas"
              // },
            ],
          },
        ],
      },
      {
        id: "requirements_elicitation",
        isCompleted: false,
        taskNumber: 3,
        name: "Requirements Elicitation",
        description:
          "In this task, you will learn to gather requirements by talking to stakeholders and understanding their problems",
        phase: "Requirements Discovery",
        objective: "Practice interviewing skills and problem identification with stakeholders (students and lecturers)",
        subtasks: [
          {
            id: "conduct_interviews",
            isCompleted: false,
            subtaskNumber: 1,
            name: "Conduct Stakeholder Interviews",
            description:
              "In this subtask, you will interview different stakeholders to understand their problems and needs",
            steps: [
              {
                id: "interview_student",
                stepNumber: 1,
                step: "Interview a student",
                objective:
                  "Talk to the student agent to understand student problems with current learning systems",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 2 specific problems students face with current systems",
                ],
                deliverables: ["Student problems list"],
                primaryAgent: "Student",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Access to resources..., lack of feedback... etc.",
              },
              {
                id: "interview_lecturer",
                stepNumber: 2,
                step: "Interview a lecturer",
                objective:
                  "Talk to the lecturer agent to understand lecturer challenges in teaching",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 2 specific challenges lecturers face in their teaching work",
                ],
                deliverables: ["Lecturer problems list"],
                primaryAgent: "Lecturer",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Lack of training, outdated materials... etc.",
              },
            ],
          },
          {
            id: "analyze_problems",
            isCompleted: false,
            subtaskNumber: 2,
            name: "Analyze Problems",
            description:
              "In this task, you will look at the problems you found and understand what they mean for the system",
            steps: [
              {
                id: "common_themes",
                stepNumber: 1,
                step: "Find common themes",
                objective:
                  "Look for patterns and common problems across different stakeholder groups. You can always refer back to the interviews you conducted earlier or ask Lisa for help at any time.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 2 common themes or problems that affect students and lecturers",
                ],
                deliverables: ["Common themes list"],
                primaryAgent: "Business Analyst",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Common themes: access to resources, communication issues... etc.",
              },
              {
                id: "problem_impact",
                stepNumber: 2,
                step: "Assess problem impact",
                objective:
                  "Understand which problems are most important to solve. You need to talk to Lisa to get her insights on the impact of each problem.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "List at least 3 most important problems to solve",
                ],
                deliverables: ["Problem priority list"],
                primaryAgent: "Business Analyst",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Problem 1: High impact on user experience; Problem 2: Low impact but easy to fix",
              },
            ],
          },
        ],
      },
      {
        id: "requirements_analysis_prioritization",
        isCompleted: false,
        taskNumber: 4,
        name: "Requirements Analysis & Prioritization",
        description:
          "Learn to turn problems into clear requirements and decide which ones to work on first using MoSCoW prioritization",
        phase: "Requirements Analysis",
        objective: "Practice creating and prioritizing requirements",
        subtasks: [
          {
            id: "create_requirements",
            isCompleted: false,
            subtaskNumber: 1,
            name: "Create Requirements",
            description:
              "Turn the stakeholder problems into clear functional and non-functional requirements",
            steps: [
              {
                id: "functional_requirements",
                stepNumber: 1,
                step: "Write functional requirements",
                objective:
                  "Come up with 5 functional requirements that describe what the system should do. You should talk with the tech lead, she knows all about these.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Writes at least 5 clear functional requirements using simple language",
                ],
                deliverables: ["Functional requirements list"],
                primaryAgent: "Technical Lead",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Functional Requirement 1: The system shall allow users to create an account; Functional Requirement 2: The system shall send a confirmation email upon registration.",
              },
              {
                id: "non_functional_requirements",
                stepNumber: 2,
                step: "Write non-functional requirements",
                objective:
                  "Come up with 5 non-functional requirements that describe how the system should behave. You should talk with the tech lead, she knows all about these.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Writes at least 5 clear non-functional requirements using simple language",
                ],
                deliverables: ["Non-functional requirements list"],
                primaryAgent: "Technical Lead",
                isSubmissionRequired: true,
              },
              {
                id: "user_stories_student",
                stepNumber: 3,
                step: "Create user stories",
                objective:
                  "Write at least 3 user stories that describe features from the student's perspective. You should talk with David, the UX designer, to help you with this. Follow the format: As a [role], I want [goal] so that [benefit].",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Creates at least 3 user stories in the format: As a [role], I want [goal] so that [benefit]",
                ],
                deliverables: ["User stories list"],
                primaryAgent: "UX Designer",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. As a student, I want to access course materials so that I can study effectively.",
              },
              {
                id: "user_stories_teacher",
                stepNumber: 4,
                step: "Create user stories",
                objective:
                  "Write user stories that describe features from the teacher's perspective. As always, you should talk with David, the UX designer, to help you with this. Follow the format: As a [role], I want [goal] so that [benefit].",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Creates at least 3 user stories in the format: As a [role], I want [goal] so that [benefit]",
                ],
                deliverables: ["User stories list"],
                primaryAgent: "UX Designer",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. As a teacher, I want to manage course materials so that I can provide students with up-to-date resources.",
              },
            ],
          },
          {
            id: "prioritize_requirements",
            isCompleted: false,
            subtaskNumber: 2,
            name: "Prioritize Requirements",
            description:
              "Learn to decide which requirements are most important to implement first",
            steps: [
              {
                id: "moscow_method",
                stepNumber: 1,
                step: "Use MoSCoW prioritization",
                objective:
                  "Look back at the requirements you listed in the previous step and categorize at least 6 of them as Must have, Should have, Could have, or Won't have. You can always ask Lisa for help at any time.",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Correctly categorizes at least 6 requirements using MoSCoW method with brief justification",
                ],
                deliverables: ["MoSCoW prioritization"],
                primaryAgent: "Business Analyst",
                isSubmissionRequired: true,
                responseFormatExample: "E.g. Must have: User authentication; Should have: Password reset; Could have: Social media login"
              },
              // {
              //   id: "final_priority_list",
              //   stepNumber: 2,
              //   step: "Create final priority list",
              //   objective:
              //     "Make a final ranked list of the most important requirements to implement",
              //   isCompleted: false,
              //   studentResponse: "",
              //   validationCriteria: [
              //     "Creates a ranked list of top 5 requirements with clear business justification",
              //   ],
              //   deliverables: ["Final priority list"],
              //   primaryAgent: "Product Owner",
              //   isSubmissionRequired: true,
              //   responseFormatExample: "E.g. 1. User authentication - Must have; 2. Password reset - Should have; 3. Social media login - Could have"
              // },
            ],
          },
        ],
      },
      // {
      //   id: "requirements_validation_documentation",
      //   isCompleted: false,
      //   taskNumber: 5,
      //   name: "Requirements Validation & Documentation",
      //   description:
      //     "Learn to validate your requirements with stakeholders and document them clearly",
      //   phase: "Requirements Validation",
      //   objective: "Ensure requirements are correct and properly documented",
      //   subtasks: [
      //     {
      //       id: "validate_requirements",
      //       isCompleted: false,
      //       subtaskNumber: 1,
      //       name: "Validate Requirements",
      //       description:
      //         "Check with stakeholders that your requirements are correct and complete",
      //       steps: [
      //         {
      //           id: "stakeholder_review",
      //           stepNumber: 1,
      //           step: "Get stakeholder feedback",
      //           objective:
      //             "Present your requirements to stakeholders and get their feedback",
      //           isCompleted: false,
      //           studentResponse: "",
      //           validationCriteria: [
      //             "Presents requirements to at least 2 stakeholders and documents their feedback",
      //           ],
      //           deliverables: ["Stakeholder feedback report"],
      //           primaryAgent: "Product Owner",
      //           isSubmissionRequired: true,
      //         },
      //         {
      //           id: "resolve_feedback",
      //           stepNumber: 2,
      //           step: "Resolve stakeholder feedback",
      //           objective: "Update requirements based on stakeholder feedback",
      //           isCompleted: false,
      //           studentResponse: "",
      //           validationCriteria: [
      //             "Updates at least 2 requirements based on stakeholder feedback with clear justification",
      //           ],
      //           deliverables: ["Updated requirements list"],
      //           primaryAgent: "Business Analyst",
      //           isSubmissionRequired: true,
      //         },
      //       ],
      //     },
      //     {
      //       id: "document_requirements",
      //       isCompleted: false,
      //       subtaskNumber: 2,
      //       name: "Document Requirements",
      //       description:
      //         "Create clear documentation that the development team can use",
      //       steps: [
      //         {
      //           id: "requirements_specification",
      //           stepNumber: 1,
      //           step: "Write requirements specification",
      //           objective:
      //             "Create a clear document that describes each requirement in detail",
      //           isCompleted: false,
      //           studentResponse: "",
      //           validationCriteria: [
      //             "Documents at least 5 requirements with clear description, acceptance criteria, and priority",
      //           ],
      //           deliverables: ["Requirements specification document"],
      //           primaryAgent: "Business Analyst",
      //           isSubmissionRequired: true,
      //         },
      //         {
      //           id: "acceptance_criteria",
      //           stepNumber: 2,
      //           step: "Define acceptance criteria",
      //           objective:
      //             "Specify how the team will know when each requirement is complete",
      //           isCompleted: false,
      //           studentResponse: "",
      //           validationCriteria: [
      //             "Creates testable acceptance criteria for at least 3 requirements",
      //           ],
      //           deliverables: ["Acceptance criteria document"],
      //           primaryAgent: "QA Engineer",
      //           isSubmissionRequired: true,
      //         },
      //       ],
      //     },
      //   ],
      // },
    ];
  }

  getTeamMembersList(): TeamMember[] {
    return this.agentFactory.getTeamMembers();
  }

  getLearningTasksList(): LearningTask[] {
    return this.learningTasks;
  }
}
