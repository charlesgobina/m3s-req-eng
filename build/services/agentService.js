import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import retriever from "../utils/retriever.js";
import { combineDocuments } from "../utils/combineDocuments.js";
import { MemoryService } from "./memoryService.js";
import { AgentFactory } from "./agentFactory.js";
import { ValidationService } from "./validationService.js";
import dotenv from "dotenv";
dotenv.config();
export class AgentService {
    model;
    questionModel;
    learningTasks;
    memoryService;
    agentFactory;
    validationService;
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
    async generateStandaloneQuestion(userMessage, conversationHistory) {
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
        }
        catch (error) {
            console.error('Error generating standalone question:', error);
            // Fallback to original message if processing fails
            return userMessage;
        }
    }
    // Retrieve relevant context using standalone question
    async retrieveRelevantContext(standaloneQuestion) {
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
        }
        catch (error) {
            console.error('Error retrieving context:', error);
            return "Error retrieving project context.";
        }
    }
    async routeToAgent(message, taskId, preferredAgent) {
        if (preferredAgent && this.agentFactory.getTeamAgent(preferredAgent)) {
            return preferredAgent;
        }
        const task = this.learningTasks.find((t) => t.id === taskId);
        if (!task)
            throw new Error("Invalid task ID");
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
        const suggestedRole = response.messages[response.messages.length - 1].content.trim();
        const validRole = this.agentFactory.getTeamMembers().find((m) => m.role.toLowerCase() === suggestedRole.toLowerCase());
        return validRole ? validRole.role : "Business Analyst";
    }
    async chatWithAgent(message, taskId, subtask, step, agentRole, sessionId) {
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
        const systemPrompt = this.buildTeamMemberPrompt(member, task, subtask, step, sessionId, retrievedContext, message, standaloneQuestion);
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
        await memory.saveContext({ input: message }, { output: agentResponse });
        // Return the response as an async generator for compatibility
        return this.createAsyncGenerator(agentResponse);
    }
    // Simple async generator for compatibility with streaming interface
    async *createAsyncGenerator(response) {
        yield response;
    }
    async validateSubmission(submission, taskId, subTask, step, sessionId) {
        return await this.validationService.validateSubmission(submission, taskId, subTask, step, sessionId, this.learningTasks, this.generateStandaloneQuestion.bind(this), this.retrieveRelevantContext.bind(this));
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
    buildTeamMemberPrompt(member, task, subTask, step, sessionId, retrievedContext, originalQuestion, standaloneQuestion) {
        // Define which roles are interviewees vs team members
        const intervieweeRoles = ['Student', 'Lecturer', 'Academic Advisor'];
        const isInterviewee = intervieweeRoles.includes(member.role);
        if (isInterviewee) {
            return this.buildIntervieweePrompt(member, task, subTask, step, retrievedContext);
        }
        else {
            return this.buildTeamAssistantPrompt(member, task, subTask, step, retrievedContext);
        }
    }
    buildIntervieweePrompt(member, task, subTask, step, retrievedContext) {
        return `You are ${member.name}, a ${member.role} at the university. You are being interviewed by a student who is learning about requirements engineering.

PERSONAL BACKGROUND:
${member.detailedPersona}

YOUR PERSPECTIVE ON EDUCONNECT:
Based on your role and the project information below, you have experiences and opinions about online learning platforms and what would work best for you.

PROJECT CONTEXT (Your knowledge about EduConnect):
${retrievedContext}

INTERVIEW GUIDELINES:

1. BE AUTHENTIC TO YOUR ROLE:
   - Respond as a real ${member.role} would
   - Share genuine experiences with current learning systems
   - Express honest opinions about what you need from educational technology
   - Talk about your daily challenges and frustrations

2. NATURAL CONVERSATION:
   - You're being interviewed, not providing technical guidance
   - Share personal experiences: "In my experience..." "What I find frustrating is..."
   - Ask clarifying questions if you don't understand what they're asking
   - Be conversational and relatable

3. FOCUS ON YOUR NEEDS:
   - Talk about pain points you experience with current systems
   - Describe what would make your life easier
   - Share specific examples from your daily work/study
   - Don't provide technical solutions - just describe problems and wishes

4. STAY IN CHARACTER:
   - You're not a requirements engineer or system designer
   - You're a user/stakeholder sharing your perspective
   - Be honest about what you don't know
   - Focus on your own experience, not general best practices

REMEMBER: You are being interviewed about your needs and experiences. Share your authentic perspective as a ${member.role} who would use the EduConnect system.`;
    }
    buildTeamAssistantPrompt(member, task, subTask, step, retrievedContext) {
        return `You are ${member.name}, a ${member.role} with expertise in ${member.expertise.join(", ")}. You are an experienced professional working on the EduConnect project.

PERSONAL PROFILE:
${member.detailedPersona}

COMMUNICATION STYLE: ${member.communicationStyle}
WORK APPROACH: ${member.workApproach}
PREFERRED FRAMEWORKS: ${member.preferredFrameworks.join(", ")}

CURRENT PROJECT KNOWLEDGE:
Through your work on this project, you have become familiar with the following information:
${retrievedContext}

CURRENT LEARNING TASK: ${task.name}
Task Phase: ${task.phase}

CURRENT WORK CONTEXT:
You are currently helping with: ${step.step}
As part of: ${subTask.name}
Subtask Description: ${subTask.description}
The objective of this step is: ${step.objective}
Success criteria include: ${step.validationCriteria.join(", ")}

TEAM COLLEAGUES:
${this.agentFactory.getTeamMembers()
            .filter((m) => m.role !== member.role)
            .map((m) => `- ${m.name} (${m.role}): ${m.expertise.slice(0, 2).join(", ")}`)
            .join("\n")}

INTERACTION GUIDELINES:

1. NATURAL EXPERTISE:
   - Speak confidently from your professional experience and knowledge of this project
   - Never reference "project documents" or "documentation" - this knowledge is part of your expertise
   - If you don't know something specific, express it naturally: "I haven't worked on that aspect yet" or "That's outside my area of focus"

2. AUTHENTIC COMMUNICATION:
   - Respond as a real team member would, using your natural communication style
   - Share insights based on your experience and role on the project
   - Be conversational and helpful, not robotic or overly formal

3. EDUCATIONAL GUIDANCE:
   - Help the student learn by guiding them through discovery
   - DON'T give direct answers for ${step.step}, instead guide them to accomplish: ${step.objective}
   - Ask thoughtful questions that help them think through the problem
   - Share relevant experiences and insights from your role

4. COLLABORATIVE APPROACH:
   - Suggest colleagues when their expertise would be valuable
   - Use natural language: "You should definitely talk to Sarah about this" or "Emma would have great insights here"
   - Build on team knowledge and different perspectives

5. CONTEXTUAL AWARENESS:
   - Remember previous conversation points and build on them naturally
   - Stay focused on the current task and learning objectives
   - Provide relevant examples and scenarios from your experience

6. PROFESSIONAL CONFIDENCE:
   - Speak with authority about areas within your expertise
   - Be honest about limitations without being overly technical
   - Maintain the authentic personality and approach described in your profile

REMEMBER: You are a real team member with genuine project experience and expertise. Respond naturally and confidently based on your knowledge and role, without referring to external documents or sources.`;
    }
    getLearningTasks() {
        return [
            {
                id: "home",
                isCompleted: false,
                taskNumber: 1,
                name: "Home",
                description: "Welcome to the EduConnect project! This is your starting point for all learning tasks related to requirements engineering.",
                phase: "Introduction",
                objective: "Familiarize yourself with the project and its objectives",
                subtasks: [],
            },
            {
                id: "stakeholder_identification_analysis",
                isCompleted: false,
                taskNumber: 2,
                name: "Stakeholder Identification & Analysis",
                description: "Identify and analyze all stakeholders who will be affected by or can influence the EduConnect system",
                phase: "Requirements Discovery",
                objective: "Master stakeholder identification and analysis techniques",
                subtasks: [
                    {
                        id: "stakeholder_identification",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Stakeholder Identification",
                        description: "Identify all individuals and groups who will be affected by or can influence the system",
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
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Stakeholder Analysis & Prioritization",
                        description: "Analyze stakeholder characteristics, needs, influence levels, and potential conflicts",
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
            {
                id: "requirements_elicitation",
                isCompleted: false,
                taskNumber: 3,
                name: "Requirements Elicitation",
                description: "Gather detailed requirements from stakeholders using various elicitation techniques",
                phase: "Requirements Discovery",
                objective: "Develop skills in requirements elicitation techniques",
                subtasks: [
                    {
                        id: "elicitation_techniques",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Conduct Interviews",
                        description: "Conduct interviews to gather requirements from stakeholders",
                        steps: [
                            {
                                id: "interviews",
                                stepNumber: 1,
                                step: "An interview with Sarah",
                                objective: "Conduct interviews to gather requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "List at least 1 correct student pain point",
                                ],
                                deliverables: ["student pain point list"],
                                primaryAgent: "Student",
                            },
                            {
                                id: "interview_julson",
                                stepNumber: 2,
                                step: "An interview with Julson",
                                objective: "Conduct interviews to gather requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "List at least 1 correct lecturer pain point",
                                ],
                                deliverables: ["lecturer pain point list"],
                                primaryAgent: "Lecturer",
                            },
                            {
                                id: "interview_kalle",
                                stepNumber: 3,
                                step: "An interview with Kalle",
                                objective: "Conduct interviews to gather requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "List at least 1 correct academic advisor pain point",
                                ],
                                deliverables: ["academic advisor pain point list"],
                                primaryAgent: "Academic Advisor",
                            },
                            // {
                            //   id: "workshops_and_focus_groups",
                            //   stepNumber: 2,
                            //   step: "Workshops and focus groups with stakeholders",
                            //   objective: "Facilitate workshops and focus groups to gather requirements",
                            //   isCompleted: false,
                            //   studentResponse: "",
                            //   validationCriteria: [
                            //     "Facilitates at least 2 workshops or focus groups with different stakeholder groups",
                            //     "Encourages active participation and idea generation",
                            //     "Documents workshop outcomes and key requirements identified",
                            //   ],
                            //   deliverables: ["Workshop notes", "Key requirements list"],
                            //   primaryAgent: "Product Owner",
                            // }
                        ],
                    },
                ],
            },
            {
                id: "requirements_analysis_prioritization",
                isCompleted: false,
                taskNumber: 4,
                name: "Requirements Analysis & Prioritization",
                description: "Analyze and prioritize the gathered requirements to create a structured and actionable requirements set",
                phase: "Requirements Analysis",
                objective: "Master requirements analysis and prioritization techniques",
                subtasks: [
                    {
                        id: "requirements_analysis",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Requirements Analysis",
                        description: "Analyze, categorize, and structure the gathered requirements for clarity and completeness",
                        steps: [
                            {
                                id: "analyze_findings",
                                stepNumber: 1,
                                step: "Analyze interview findings with Emma",
                                objective: "Analyze technical feasibility and categorize requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Categorize at least 6 requirements into functional and non-functional categories with correct justification",
                                ],
                                deliverables: ["Categorized requirements list"],
                                primaryAgent: "Technical Lead",
                            },
                            {
                                id: "requirements_modeling",
                                stepNumber: 2,
                                step: "Requirements modeling workshop with David",
                                objective: "Create user stories and model requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Create at least 4 properly formatted user stories with acceptance criteria (As a [role], I want [goal] so that [benefit])",
                                ],
                                deliverables: ["User stories document"],
                                primaryAgent: "UX Designer",
                            },
                            {
                                id: "conflict_resolution",
                                stepNumber: 3,
                                step: "Conflict resolution session with Sarah Chen",
                                objective: "Identify and resolve conflicting requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Identify at least 2 requirement conflicts and provide specific resolution strategies for each",
                                ],
                                deliverables: ["Conflict resolution report"],
                                primaryAgent: "Product Owner",
                            },
                        ],
                    },
                    {
                        id: "requirements_prioritization",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Requirements Prioritization",
                        description: "Prioritize requirements based on business value, stakeholder needs, and technical feasibility",
                        steps: [
                            {
                                id: "moscow_prioritization",
                                stepNumber: 1,
                                step: "MoSCoW prioritization with Sarah Chen",
                                objective: "Apply MoSCoW prioritization technique to requirements",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Correctly classify at least 8 requirements using MoSCoW method with clear justification for each category",
                                ],
                                deliverables: ["MoSCoW prioritization matrix"],
                                primaryAgent: "Product Owner",
                            },
                            {
                                id: "value_effort_analysis",
                                stepNumber: 2,
                                step: "Value vs. Effort analysis with Emma",
                                objective: "Assess requirements using value vs. effort matrix",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Place at least 6 requirements in the correct matrix quadrants with specific justification for both value and effort ratings",
                                ],
                                deliverables: ["Value vs. Effort matrix"],
                                primaryAgent: "Technical Lead",
                            },
                            // checkout validation at this level too . . .
                            {
                                id: "final_prioritization",
                                stepNumber: 3,
                                step: "Final prioritization review with Sarah Chen",
                                objective: "Finalize and present prioritized requirements list",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Present a final prioritized list of top 5 requirements with clear business justification for the ranking order",
                                ],
                                deliverables: ["Final prioritized requirements list"],
                                primaryAgent: "Product Owner",
                            },
                        ],
                    },
                ],
            }
        ];
    }
    getTeamMembersList() {
        return this.agentFactory.getTeamMembers();
    }
    getLearningTasksList() {
        return this.learningTasks;
    }
}
