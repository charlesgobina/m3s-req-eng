import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import { HuggingFaceInference } from "@langchain/community/llms/hf";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ProjectContext,
  LearningTask,
  TeamMember,
  Subtask,
  Steps,
} from "../types/index.js";
import dotenv from "dotenv";
dotenv.config();

interface ConversationSummary {
  keyPoints: string[];
  currentFocus: string;
  mentionedColleagues: string[];
  lastUpdated: Date;
}

export class AgentService {
  private checkpointer: MemorySaver;
  private model: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;
  private teamAgents!: Map<string, any>;
  private validationAgent: any;
  private routingAgent: any;
  private teamMembers: TeamMember[];
  private learningTasks: LearningTask[];
  private conversationSummaries: Map<string, ConversationSummary>;

  constructor() {
    const DB_URI = process.env.DATABASE_URL;

    this.checkpointer = new MemorySaver();
    this.conversationSummaries = new Map();

    // HF model for testing purposes
    // this.model = new HuggingFaceInference({
    //   model: "microsoft/DialoGPT-medium",
    //   temperature: 0.7,
    //   apiKey: process.env.HUGGINGFACE_API_KEY,
    // });

    this.model = new ChatGroq({
      model: "gemma2-9b-it",
      temperature: 0,
      apiKey: process.env.GROQ_API_KEY,
      streaming: true,
    });

    // this.model = new ChatOpenAI({
    //   model: "gpt-4o",
    //   temperature: 0.7,
    //   streaming: true,
    //   openAIApiKey: process.env.OPENAI_API_KEY,
    // });

    // this.model = new ChatGoogleGenerativeAI({
    //   model: "gemini-2.0-flash",
    //   temperature: 0,
    //   streaming: true,
    //   apiKey: process.env.GOOGLE_API_KEY,
    // });

    this.teamMembers = this.getTeamMembers();
    this.learningTasks = this.getLearningTasks();
    this.initializeAgents();
  }

  async initialize() {
    console.log("AgentService initialized");
  }

  private initializeAgents() {
    this.teamAgents = new Map();

    this.teamMembers.forEach((member) => {
      const agent = createReactAgent({
        llm: this.model,
        tools: [],
        checkpointSaver: this.checkpointer,
      });
      this.teamAgents.set(member.role, agent);
    });

    this.validationAgent = createReactAgent({
      llm: this.model,
      tools: [],
      checkpointSaver: this.checkpointer,
    });

    this.routingAgent = createReactAgent({
      llm: this.model,
      tools: [],
      checkpointSaver: this.checkpointer,
    });
  }

  private updateConversationSummary(
    sessionId: string,
    message: string,
    agentRole: string
  ) {
    const summary = this.conversationSummaries.get(sessionId) || {
      keyPoints: [],
      currentFocus: "",
      mentionedColleagues: [],
      lastUpdated: new Date(),
    };

    // Simple key point extraction (in production, you might want more sophisticated NLP)
    if (message.length > 50) {
      const truncated =
        message.substring(0, 100) + (message.length > 100 ? "..." : "");
      summary.keyPoints.push(`${agentRole}: ${truncated}`);

      // Keep only last 5 key points
      if (summary.keyPoints.length > 5) {
        summary.keyPoints = summary.keyPoints.slice(-5);
      }
    }

    // Extract colleague mentions
    this.teamMembers.forEach((member) => {
      if (
        message.toLowerCase().includes(member.name.toLowerCase()) &&
        !summary.mentionedColleagues.includes(member.name)
      ) {
        summary.mentionedColleagues.push(member.name);
      }
    });

    summary.lastUpdated = new Date();
    this.conversationSummaries.set(sessionId, summary);
  }

  private getConversationContext(sessionId: string): string {
    const summary = this.conversationSummaries.get(sessionId);
    if (!summary || summary.keyPoints.length === 0) {
      return "This is the beginning of our conversation.";
    }

    return `CONVERSATION CONTEXT:
Recent discussion points:
${summary.keyPoints.map((point) => `- ${point}`).join("\n")}

${
  summary.mentionedColleagues.length > 0
    ? `Colleagues mentioned: ${summary.mentionedColleagues.join(", ")}`
    : ""
}
`;
  }

  async routeToAgent(
    message: string,
    taskId: string,
    projectContext: ProjectContext,
    preferredAgent?: string
  ): Promise<string> {
    if (preferredAgent && this.teamAgents.has(preferredAgent)) {
      return preferredAgent;
    }

    const task = this.learningTasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Invalid task ID");

    const routingPrompt = `You are an intelligent routing agent for a requirements engineering learning system.

CURRENT TASK: ${task.name} (${task.phase})
TASK DESCRIPTION: ${task.description}
STUDENT MESSAGE: "${message}"

AVAILABLE TEAM MEMBERS:
${this.teamMembers
  .map((m) => `- ${m.role} (${m.name}): ${m.expertise.join(", ")}`)
  .join("\n")}

Based on the student's message and current task, which team member would be MOST helpful to respond?
Consider:
1. The team member's expertise alignment with the question
2. The current learning phase
3. The type of guidance needed

Respond with ONLY the role name (e.g., "Product Owner", "Business Analyst", etc.)`;

    const routingThreadId = `routing_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const response = await this.routingAgent.invoke(
      {
        messages: [new SystemMessage(routingPrompt), new HumanMessage(message)],
      },
      {
        configurable: {
          thread_id: routingThreadId,
        },
      }
    );

    const suggestedRole =
      response.messages[response.messages.length - 1].content.trim();

    const validRole = this.teamMembers.find(
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
    projectContext: ProjectContext
  ): Promise<AsyncIterable<string>> {
    const task = this.learningTasks.find((t) => t.id === taskId);
    const member = this.teamMembers.find((m) => m.role === agentRole);

    if (!task || !subtask || !member) {
      throw new Error("Invalid task or team member");
    }

    // Update conversation summary
    this.updateConversationSummary(sessionId, message, "Student");

    const systemPrompt = this.buildTeamMemberPrompt(
      member,
      task,
      subtask,
      step,
      projectContext,
      sessionId
    );

    const agent = this.teamAgents.get(agentRole);
    if (!agent) {
      throw new Error(`Agent not found for role: ${agentRole}`);
    }

    // Use streamEvents for proper streaming with LangGraph agents
    const stream = agent.streamEvents(
      {
        messages: [new SystemMessage(systemPrompt), new HumanMessage(message)],
      },
      {
        configurable: {
          thread_id: sessionId,
        },
        version: "v2", // Important for streamEvents
      }
    );

    return this.streamAgentResponse(stream, sessionId, agentRole);
  }

  // New method specifically for handling LangGraph agent streaming
  private async *streamAgentResponse(
    stream: any,
    sessionId: string,
    agentRole: string
  ): AsyncIterable<string> {
    let fullResponse = "";

    try {
      for await (const event of stream) {
        // LangGraph agents emit different event types
        if (
          event.event === "on_chat_model_stream" &&
          event.data?.chunk?.content
        ) {
          const content = event.data.chunk.content;
          if (content && content.trim()) {
            fullResponse += content;
            yield content;
          }
        }
      }

      // Update conversation summary with agent's response
      if (fullResponse.trim()) {
        this.updateConversationSummary(sessionId, fullResponse, agentRole);
      }
    } catch (error: any) {
      console.error("Agent stream error:", error);
      yield `[ERROR] ${error.message}`;
    }
  }

  async validateSubmission(
    submission: string,
    taskId: string,
    subTask: Subtask,
    step: Steps,
    sessionId: string,
    projectContext: ProjectContext
  ): Promise<{
    score: number;
    feedback: string;
    recommendations: string;
    passed: boolean;
  }> {
    const task = this.learningTasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Invalid task");

    const systemPrompt = this.buildValidationPrompt(
      task,
      subTask,
      step,
      projectContext
    );
    const threadId = `${sessionId}_validation_${taskId}`;

    // check if chat history exists
    // const

    const response = await this.validationAgent.invoke(
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `Please evaluate this student submission:\n\n${submission}`
          ),
        ],
      },
      {
        configurable: {
          thread_id: threadId,
        },
      }
    );

    const result = response.messages[response.messages.length - 1].content;

    const scoreMatch = result.match(/SCORE:\s*(\d+)/);
    const feedbackMatch = result.match(
      /FEEDBACK:\s*(.*?)(?=RECOMMENDATIONS:|$)/s
    );
    const recommendationsMatch = result.match(/RECOMMENDATIONS:\s*(.*?)$/s);

    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    return {
      score,
      feedback: feedbackMatch
        ? feedbackMatch[1].trim()
        : "No feedback provided",
      recommendations: recommendationsMatch
        ? recommendationsMatch[1].trim()
        : "No recommendations provided",
      passed: score >= 70,
    };
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

  private buildHomePrompt(
    projectContext: ProjectContext,
    teamMembers: TeamMember[],
    task: LearningTask,
    subTask: Subtask,
    sessionId: string
  ): string {
    return `Welcome to the Campus Smart Dining project! This is your starting point for all learning tasks related to requirements engineering. Here, you will find an overview of the project, its goals, and the team members you will be working with. Let's get started!`;
  }

  private buildTeamMemberPrompt(
    member: TeamMember,
    task: LearningTask,
    subTask: Subtask,
    step: Steps,
    projectContext: ProjectContext,
    sessionId: string
  ): string {
    const conversationContext = this.getConversationContext(sessionId);

    return `You are a helpful and knowledgeable assistant in the field of requirement engineering. You follow the INTERACTION GUIDELINES given to you to respond to user queries. You are ${
      member.name
    }, a ${member.role} with the following characteristics:

PERSONAL PROFILE:
${member.detailedPersona}

PROFESSIONAL EXPERTISE:
${member.expertise.map((exp) => `- ${exp}`).join("\n")}

COMMUNICATION STYLE: ${member.communicationStyle}
WORK APPROACH: ${member.workApproach}
PREFERRED FRAMEWORKS: ${member.preferredFrameworks.join(", ")}

${conversationContext}

CURRENT PROJECT CONTEXT:
Project: ${projectContext.title}
Description: ${projectContext.description}
Domain: ${projectContext.domain}
Stakeholders: ${projectContext.stakeholders.join(", ")}
Business Goals: ${projectContext.businessGoals.join(", ")}
Constraints: ${projectContext.constraints.join(", ")}

CURRENT LEARNING TASK: ${task.name}
Task Phase: ${task.phase}

AND YOU ARE CURRENTLY WORKING ON:
STEP: ${step.step} found in the
SUBTASK: ${subTask.name} with
Subtask Description: ${subTask.description} the objective of this step is ${step.objective} and validation criteria are ${step.validationCriteria.join(", ")}

TEAM COLLEAGUES:
${this.teamMembers
  .filter((m) => m.role !== member.role)
  .map((m) => `- ${m.name} (${m.role}): ${m.expertise.slice(0, 2).join(", ")}`)
  .join("\n")}

INTERACTION GUIDELINES:

1. NATURAL CONVERSATION FLOW:
   - Respond naturally like a real colleague would
   - Don't immediately jump into work topics unless contextually appropriate
   - If greeted casually, respond casually first
   - Only bring up project/task matters when the conversation naturally leads there

2. COLLABORATIVE BRAINSTORMING:
   - Guide the student through discovery, DON'T GIVE DIRECT ANSWERS for ${step.step} but guide them to accomplish the following objective: ${step.objective}

3. COLLEAGUE REFERRALS:
   - When appropriate, explicitly suggest speaking with specific colleagues
   - Use their names: "You should definitely run this by Sarah" or "Michael would have great insights on this"
   - Explain why that colleague would be helpful

4. PROFESSIONAL AUTHENTICITY:
   - Stay true to your personality and work style
   - Reference your preferred methodologies and frameworks when relevant
   - Show your expertise through questions and guidance, not lectures
   - Be encouraging but honest about challenges

5. CONTEXT AWARENESS:
   - Be aware of what's been discussed previously in this conversation
   - Build on previous points naturally
   - Don't repeat information already covered unless clarification is needed

6. Focus on generating new insights rather than rephrasing previous statements.

7. Be concise and vary your conversational openings.

8. Avoid repeating phrases or information.

Remember: You're a real professional helping a colleague learn through collaboration, not an AI giving instructions. Be human, be helpful, and guide through discovery.`;
  }

  private buildValidationPrompt(
    task: LearningTask,
    subTask: Subtask,
    step: Steps,
    projectContext: ProjectContext
  ): string {
    return `You are an expert Requirements Engineering instructor evaluating student submissions of ${step.step} found in 

CURRENT TASK: ${task.name}
Task Description: ${task.description}
Subtask Name: ${subTask.name}
Subtask Description: ${subTask.description}

Here is THE ONLY CRITERIA TO evaluate the student's submission: ${step.validationCriteria.join(", ")}. NOTHING MORE, NOTHING LESS.

PROJECT CONTEXT:
${projectContext.title}
${projectContext.description}

FORMAT YOUR RESPONSE AS:
SCORE: [0-100]
FEEDBACK: [Your SHORT AND CONCISE detailed feedback]
RECOMMENDATIONS: [Specific suggestions for improvement IF YOU HAVE ANY or next steps]`;
  }

  private getTeamMembers(): TeamMember[] {
    return [
      {
        role: "Product Owner",
        name: "Sarah Chen",
        personality: "Business-focused, decisive, user-centric",
        expertise: [
          "Business Analysis",
          "User Experience",
          "Product Strategy",
          "Stakeholder Communication",
        ],
        communicationStyle:
          "Direct and results-oriented, but approachable. Uses business language and focuses on value delivery.",
        workApproach:
          "Strategic thinker who always connects requirements back to business objectives and user value.",
        preferredFrameworks: [
          "User Story Mapping",
          "Impact Mapping",
          "Kano Model",
          "Business Model Canvas",
        ],
        detailedPersona: `A seasoned product professional with 8 years of experience in fintech and e-commerce. Sarah has an MBA from UC Berkeley and started her career as a business analyst before moving into product management. She's passionate about creating products that solve real user problems and has a knack for translating complex business needs into clear, actionable requirements.

Sarah tends to be optimistic and energetic, often starting conversations with enthusiasm about the project's potential impact. She's collaborative but decisive when needed, and she has a habit of asking "but why does the user care about this?" when evaluating features. She's particularly good at facilitating stakeholder discussions and keeping teams focused on outcomes rather than outputs.

When not talking about work, Sarah might mention her weekend hiking trips or her latest cooking experiments. She has a dry sense of humor and isn't afraid to challenge assumptions respectfully.`,
      },
      {
        role: "Business Analyst",
        name: "Michael Rodriguez",
        personality: "Detail-oriented, methodical, collaborative",
        expertise: [
          "Requirements Analysis",
          "Process Modeling",
          "Stakeholder Management",
          "Documentation Standards",
          "Gap Analysis",
        ],
        communicationStyle:
          "Thoughtful and thorough. Asks clarifying questions and ensures everyone is aligned before moving forward.",
        workApproach:
          "Systematic and process-driven. Believes in proper documentation and clear requirements before development begins.",
        preferredFrameworks: [
          "BABOK Techniques",
          "Use Case Analysis",
          "BPMN",
          "Requirements Traceability Matrix",
          "MoSCoW Prioritization",
        ],
        detailedPersona: `Michael has 10 years of experience as a Business Analyst across healthcare, finance, and retail industries. He holds a PMP certification and is working toward his CBAP. Michael is the person team members go to when they need to untangle complex business processes or when stakeholders have conflicting requirements.

He's naturally curious and has a talent for asking the right questions to uncover hidden requirements. Michael is patient and diplomatic, making him excellent at managing difficult stakeholder conversations. He believes that most project problems stem from unclear or misunderstood requirements, so he's meticulous about documentation and validation.

Michael is a family man with two kids and coaches his daughter's soccer team on weekends. He's calm under pressure and has a gentle way of redirecting conversations when they go off track. He often uses sports analogies to explain complex concepts and believes strongly in team collaboration.`,
      },
      {
        role: "Technical Lead",
        name: "Emma Thompson",
        personality: "Pragmatic, solution-oriented, quality-focused",
        expertise: [
          "System Architecture",
          "Technical Constraints",
          "Risk Assessment",
          "Performance Requirements",
          "Integration Patterns",
        ],
        communicationStyle:
          "Direct and practical. Translates technical concepts into business language and vice versa.",
        workApproach:
          "Focuses on feasibility and maintainability. Always considers long-term implications of technical decisions.",
        preferredFrameworks: [
          "TOGAF",
          "Risk Assessment Matrix",
          "Technical Debt Quadrant",
          "Architecture Decision Records",
          "Quality Attribute Scenarios",
        ],
        detailedPersona: `Emma has 12 years of software development experience, with the last 5 years in technical leadership roles. She started as a backend developer, moved into architecture, and now leads technical teams. Emma has a Computer Science degree from MIT and holds several AWS certifications.

She's known for her ability to spot potential technical issues early in the requirements phase and for asking tough questions about scalability, security, and maintainability. Emma is straightforward and doesn't sugarcoat technical challenges, but she's also creative in finding solutions. She believes in building systems that are robust and elegant, not just functional.

Emma is passionate about mentoring junior developers and is often found explaining complex technical concepts in simple terms. She's a bit of a perfectionist but pragmatic about trade-offs. In her spare time, she contributes to open-source projects and enjoys rock climbing, which she says teaches her about calculated risks - a skill that translates well to technical decision-making.`,
      },
      {
        role: "UX Designer",
        name: "David Park",
        personality: "Creative, user-empathetic, collaborative",
        expertise: [
          "User Research",
          "Interaction Design",
          "Usability",
          "Design Thinking",
          "Accessibility",
        ],
        communicationStyle:
          "Visual and story-driven. Often sketches ideas while talking and uses user scenarios to illustrate points.",
        workApproach:
          "User-centered design approach. Always advocates for the end user and believes good design solves real problems.",
        preferredFrameworks: [
          "Design Thinking",
          "User Journey Mapping",
          "Jobs-to-be-Done",
          "Usability Heuristics",
          "Accessibility Guidelines (WCAG)",
        ],
        detailedPersona: `David has 7 years of UX design experience across B2B and B2C products. He has a background in psychology and graphic design, which gives him a unique perspective on how users interact with systems. David is certified in Design Thinking and regularly conducts user research sessions.

He's the team's advocate for user experience and isn't shy about pushing back when requirements don't consider usability. David has a talent for visualizing abstract concepts and often creates quick sketches or wireframes during meetings to help everyone understand complex user flows. He believes that good requirements should always include the user's context and emotional journey.

David is artistic and often references design principles from other fields - architecture, industrial design, even music - to explain UX concepts. He's energetic and collaborative, often suggesting quick user testing sessions to validate assumptions. Outside of work, he enjoys photography and volunteers teaching design skills to underserved communities.`,
      },
      {
        role: "Quality Assurance Lead",
        name: "Lisa Wang",
        personality: "Thorough, quality-focused, risk-aware",
        expertise: [
          "Testing Strategy",
          "Quality Metrics",
          "Requirements Validation",
          "Test Case Design",
          "Defect Management",
        ],
        communicationStyle:
          "Precise and analytical. Focuses on edge cases and potential failure scenarios.",
        workApproach:
          "Prevention-focused approach. Believes quality should be built in from the requirements phase, not tested in later.",
        preferredFrameworks: [
          "ISTQB Testing Principles",
          "Risk-Based Testing",
          "Boundary Value Analysis",
          "Requirements Testability Checklist",
          "Acceptance Criteria Templates",
        ],
        detailedPersona: `Lisa has 9 years of experience in quality assurance, with expertise in both manual and automated testing. She holds ISTQB Advanced certifications and has worked in regulated industries including healthcare and finance, where quality is absolutely critical.

Lisa has a keen eye for detail and a talent for thinking about what could go wrong. She's often the one who asks "but what happens if...?" during requirements discussions. While some might see her as pessimistic, the team appreciates her ability to identify potential issues before they become expensive problems. Lisa believes that clear, testable requirements are the foundation of quality software.

She's methodical and organized, often creating detailed test scenarios and checklists. Lisa is collaborative and enjoys working with developers to prevent defects rather than just finding them. She's also passionate about accessibility testing and often educates the team about inclusive design. Outside of work, Lisa enjoys puzzles and strategy games, which she says help her think through complex testing scenarios.`,
      },
    ];
  }

  private getLearningTasks(): LearningTask[] {
    return [
      {
        id: "home",
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
        name: "Stakeholder Identification & Analysis",
        description:
          "Identify and analyze all stakeholders who will be affected by or can influence the Campus Smart Dining system",
        phase: "Requirements Discovery",
        objective: "Master stakeholder identification and analysis techniques",
        subtasks: [
          {
            id: "stakeholder_identification",
            name: "Stakeholder Identification",
            description:
              "Identify all individuals and groups who will be affected by or can influence the system",
            
            steps: [
              {
                id: "comprehensive_stakeholder_list",
                step: "Comprehensive stakeholder list",
                objective: "Provide a complete list of all identified stakeholders",
                isCompleted: false,
                studentResponse: "",
                validationCriteria: [
                  "Identifies at least 8 different stakeholder types",
                ],
                deliverables: ["Stakeholder register", "Stakeholder map"],
                primaryAgent: "Stakeholder Analyst",
              },
              {
                id: "stakeholder_categorization",
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
                primaryAgent: "Stakeholder Analyst",  
              },
              {
                id: "direct_and_indirect_stakeholders",
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
                primaryAgent: "Stakeholder Analyst",
              }
            ],
            
          },
          {
            id: "stakeholder_analysis",
            name: "Stakeholder Analysis & Prioritization",
            description:
              "Analyze stakeholder characteristics, needs, influence levels, and potential conflicts",
            
            steps: [
              {
                id: "stakeholder_power_dynamics",
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
                primaryAgent: "Stakeholder Analyst",
              },
              {
                id: "engagement_strategies",
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
                primaryAgent: "Stakeholder Analyst",
              }
            ],
            
          },
          
        ],
      },
    ];
  }

  getTeamMembersList(): TeamMember[] {
    return this.teamMembers;
  }

  getLearningTasksList(): LearningTask[] {
    return this.learningTasks;
  }
}
