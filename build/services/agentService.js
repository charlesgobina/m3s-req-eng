import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import retriever from "../utils/retriever.js";
import { combineDocuments } from "../utils/combineDocuments.js";
import { EnhancedMemoryService } from "./enhancedMemoryService.js";
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
        this.memoryService = new EnhancedMemoryService(this.questionModel);
        this.agentFactory = new AgentFactory(this.model);
        this.validationService = new ValidationService(this.memoryService, this.agentFactory);
        this.learningTasks = this.getLearningTasks();
    }
    async initialize() {
        console.log("AgentService initialized");
    }
    // Retrieve relevant context using user question
    async retrieveRelevantContext(userQuestion) {
        try {
            const relevantDocs = await retriever._getRelevantDocuments(userQuestion);
            // Log retrieved documents for debugging
            console.log('\n=== RETRIEVED DOCUMENTS ===');
            console.log(`Query: "${userQuestion}"`);
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
    async chatWithAgent(message, taskId, subtask, step, agentRole, sessionId, userId) {
        const task = this.learningTasks.find((t) => t.id === taskId);
        const member = this.agentFactory.getTeamMembers().find((m) => m.role === agentRole);
        if (!task || !subtask || !member) {
            throw new Error("Invalid task or team member");
        }
        // Get smart progress memory
        const memory = this.memoryService.getSmartProgressMemory(userId, taskId, subtask.id, step.id);
        // Handle different context based on role type
        const intervieweeRoles = ['Student', 'Lecturer', 'Academic Advisor'];
        const isInterviewee = intervieweeRoles.includes(member.role);
        let systemPrompt;
        if (isInterviewee) {
            // Interviewees only get basic project context
            const basicProjectContext = await this.retrieveRelevantContext(message);
            systemPrompt = this.buildIntervieweePrompt(member, task, subtask, step, basicProjectContext);
        }
        else {
            // Team members get comprehensive context
            const comprehensiveContext = await this.memoryService.getComprehensiveContext(userId, agentRole, message, taskId, subtask.id, step.id);
            systemPrompt = this.buildEnhancedTeamAssistantPrompt(member, task, subtask, step, comprehensiveContext);
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
            new HumanMessage(message)
        ];
        console.log(`\n=== MEMORY MANAGEMENT ===`);
        console.log(`User: ${userId}`);
        console.log(`Agent: ${agentRole}`);
        console.log(`Context: ${taskId}/${subtask.id}/${step.id}`);
        console.log(`Memory messages: ${memoryMessages.length}`);
        console.log(`Role type: ${isInterviewee ? 'Interviewee (basic context)' : 'Team member (comprehensive context)'}`);
        console.log(`=== END MEMORY ===\n`);
        // Use invoke for standard agent response
        const response = await agent.invoke({
            messages: managedMessages,
        });
        // Get the agent's response content
        const agentResponse = response.messages[response.messages.length - 1].content;
        // Save conversation to memory
        await memory.saveContext({ input: message }, { output: agentResponse });
        // Save agent insights for future reference
        await memory.saveAgentInsights(agentRole, message, agentResponse);
        // Save interaction to comprehensive memory
        await this.memoryService.saveInteraction(userId, agentRole, message, agentResponse, taskId, subtask.id, step.id);
        // Return the response as an async generator for compatibility
        return this.createAsyncGenerator(agentResponse);
    }
    // Simple async generator for compatibility with streaming interface
    async *createAsyncGenerator(response) {
        yield response;
    }
    async validateSubmission(submission, taskId, subTask, step, sessionId, userId) {
        return await this.validationService.validateSubmission(submission, taskId, subTask, step, sessionId, userId || 'unknown_user', this.learningTasks, this.retrieveRelevantContext.bind(this));
    }
    // Method to call when user completes a step
    async onStepCompletion(userId, stepData) {
        try {
            console.log(`🎯 [STEP-COMPLETION] Processing completion for user ${userId}`);
            // Refresh all conversation memories for this user to invalidate cache
            await this.memoryService.refreshUserMemories(userId);
            // Notify comprehensive memory system about step change
            if (stepData.taskId && stepData.subtaskId && stepData.stepId) {
                await this.memoryService.onStepChange(userId, stepData.taskId, stepData.subtaskId, stepData.stepId);
            }
            console.log(`✅ Step completion processed and memories updated for user ${userId}`);
        }
        catch (error) {
            console.error('❌ Error processing step completion:', error);
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
    buildIntervieweePrompt(member, task, subTask, step, basicProjectContext) {
        return `
    You are ${member.name}, a ${member.role} at the university. You are being interviewed by a student learning about requirements engineering for the EduConnect learning platform.
    Your Identity and Background
    ${member.detailedPersona}
    You communicate with a ${member.communicationStyle} style, approach work through ${member.workApproach}, and have expertise in ${member.expertise.join(', ')}. Your personality is ${member.personality}.
    Your Knowledge About EduConnect
    ${basicProjectContext}
    
    IMPORTANT: You are an interviewee, not a core team member. You only know basic information about the EduConnect project. You should respond from your role's perspective as someone who would potentially use or be involved with the system, but you don't have detailed technical knowledge or access to internal project discussions.
    Core Behavior
    You are being interviewed as a real person who would use educational technology, not as a consultant or technical expert. Share your authentic experiences, challenges, and needs from your daily work as a ${member.role}.
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
    buildEnhancedTeamAssistantPrompt(member, task, subTask, step, comprehensiveContext) {
        return `
    You are ${member.name}, a ${member.role} on the EduConnect project team. You're helping a student learn requirements engineering through hands-on collaboration.
    Your Identity and Background
    ${member.detailedPersona}
    You communicate with a ${member.communicationStyle} style and approach work through ${member.workApproach}. Your expertise includes ${member.expertise.join(", ")} and you prefer working with ${member.preferredFrameworks.join(", ")}.
    Current Learning Context
    The student is working on "${task.name}" during the ${task.phase} phase. Specifically, they're tackling "${step.step}" as part of "${subTask.name}" with the objective: ${step.objective}
    Success for this step means: ${step.validationCriteria.join(", ")}
    Your Comprehensive Knowledge Base
    ${comprehensiveContext}
    
    IMPORTANT: The comprehensive knowledge base above contains:
    - Project specifications and requirements
    - This student's complete learning progress and previous work
    - All past conversations with this student (from you and other team members)
    - Insights and observations from your team colleagues
    
    Use this information to:
    - Reference specific previous work the student has completed
    - Build on conversations you or colleagues have had with them
    - Understand their learning patterns and progress
    - Provide personalized guidance based on their journey
    Your Team Colleagues
    ${this.agentFactory.getTeamMembers()
            .filter((m) => m.role !== member.role)
            .map((m) => `${m.name} (${m.role}) - expertise in ${m.expertise.slice(0, 2).join(", ")}`)
            .join(", ")}
    Core Behavior
    You are a helpful team member collaborating with a student, not their instructor. Guide them through discovery and problem-solving using the project information you have access to.
    When the student asks questions, help them explore the available project context rather than giving direct answers. Ask questions that lead them to insights: "What do you think would happen if...?" or "Looking at the project requirements, what patterns do you notice?"
    If project information doesn't contain what you need to help effectively, say so clearly: "I don't have enough project details about that. Do you have access to more specific documentation we could review together?"
    Use your personality and communication style consistently. If you're detail-oriented, help them work through specifics systematically. If you're big-picture focused, help them see broader connections and implications.
    Collaboration Guidelines
    Reference your previous work with the student when relevant, building on insights you've already explored together. When you see that a colleague has worked with this student before, reference their previous conversations naturally: "I see from your conversation with Sarah that you discussed..." or "Building on what Emma mentioned to you about..."
    
    Use the comprehensive knowledge base to provide continuity - if the student asks about something you discussed before, acknowledge it. If they're repeating a question, gently reference the previous discussion while providing additional depth.
    Respond conversationally like a real team member would. If greeted casually, respond warmly before focusing on project work. Keep responses focused on helping them accomplish the current objective while staying within the bounds of your project knowledge.
    When you're unsure about something, ask for clarification rather than guessing. Your role is to be a knowledgeable team member who collaborates effectively, not someone who has all the answers.
        `;
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
