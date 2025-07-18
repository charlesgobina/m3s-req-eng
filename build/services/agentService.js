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
        const basicProjectContext = await this.retrieveRelevantContext(message);
        let systemPrompt;
        if (isInterviewee) {
            // Interviewees only get basic project context
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
    buildEnhancedTeamAssistantPrompt(member, task, subTask, step, 
    // basicProjectContext: string,
    comprehensiveContext) {
        return `
    You are ${member.name}, a ${member.role} on the EduConnect project team. You're helping a student learn requirements engineering through hands-on collaboration.
    Your Identity and Background
    ${member.detailedPersona}
    You communicate with a ${member.communicationStyle} style and approach work through ${member.workApproach}. Your expertise includes ${member.expertise?.join(", ") || 'general requirements engineering'} and you prefer working with ${member.preferredFrameworks?.join(", ") || 'collaborative learning approaches'}.
    Current Learning Context
    The student is working on "${task.name}" during the ${task.phase} phase. Specifically, they're tackling "${step.step}" as part of "${subTask.name}" with the objective: ${step.objective}
    Success for this step means: ${step.validationCriteria?.join(", ") || 'completing the objective'}

   

    Here is the comprehensive knowledge base of the project context and student's learning journey, mostly about their progress, previous work.
    ${comprehensiveContext}
    
    IMPORTANT: The comprehensive knowledge base contains:
    - The EduConnect project context
    - This student's complete learning progress and previous work
    - Insights and observations from your team colleagues
    
    Use this information to:
    - Reference specific previous work the student has completed
    - Build on conversations you or colleagues have had with them
    - Understand their learning patterns and progress
    - Provide personalized guidance based on their journey
    Your Team Colleagues
    ${this.agentFactory.getTeamMembers()
            .filter((m) => m.role !== member.role)
            .map((m) => `${m.name} (${m.role}) - expertise in ${m.expertise?.slice(0, 2).join(", ") || 'requirements engineering'}`)
            .join(", ")}
    Core Behavior
    You are a helpful team member collaborating with a student, not their instructor. Guide them through discovery and problem-solving using the project information you have access to.
    When the student asks RELEVANT questions, act like an encyclopedia of the project, exploring it to find relevant information.
    If they are just fooling around, just go on with the vibe but remain within the context of the project.
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
        return `You are ${member.name}, a ${member.role} with expertise in ${member.expertise?.join(", ") || 'requirements engineering'}. You are an experienced professional working on the EduConnect project.

PERSONAL PROFILE:
${member.detailedPersona}

COMMUNICATION STYLE: ${member.communicationStyle}
WORK APPROACH: ${member.workApproach}
PREFERRED FRAMEWORKS: ${member.preferredFrameworks?.join(", ") || 'collaborative approaches'}

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
                name: "Welcome to EduConnect",
                description: "Get introduced to the EduConnect project and meet your learning team",
                phase: "Introduction",
                objective: "Get oriented with the project and understand your learning journey",
                subtasks: [
                    {
                        id: "getting_to_know_you",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Getting to Know You",
                        description: "Let's start by getting to know each other and setting up your learning experience",
                        steps: [
                            {
                                id: "personal_introduction",
                                stepNumber: 1,
                                step: "Personal Introduction",
                                objective: "Share your name and background so we can personalize your learning experience",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Provides name and brief background information",
                                ],
                                deliverables: ["Personal introduction"],
                                primaryAgent: "Project Guide",
                                isSubmissionRequired: true,
                                agentInstruction: "As the student to introduce themselves and share their background to personalize the learning experience.",
                            }
                        ],
                    },
                    {
                        id: "project_overview",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Project Overview & Team Introduction",
                        description: "Learn about the EduConnect project and meet the team you'll be working with",
                        steps: [
                            {
                                id: "learn_about_educonnect",
                                stepNumber: 1,
                                step: "Learn About EduConnect",
                                objective: "Understand what the EduConnect project is, why it matters, and what problems it solves",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Demonstrates understanding of the project's main goals and importance",
                                ],
                                deliverables: ["Project understanding summary"],
                                primaryAgent: "Project Guide",
                                isSubmissionRequired: false,
                                agentInstruction: "Explain the project's goals and importance to the student. Go as far as giving a brief summary of the stakeholders involves, their names, and their roles in the project.",
                            },
                            {
                                id: "meet_your_team",
                                stepNumber: 2,
                                step: "Meet Your Team",
                                objective: "Get to know the different experts you'll collaborate with and understand your learning journey",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Shows understanding of team roles and the collaborative learning approach",
                                ],
                                deliverables: ["Team roles understanding"],
                                primaryAgent: "Project Guide",
                                isSubmissionRequired: false,
                                agentInstruction: "Introduce the team members, their roles, and how they will support the student's learning journey.",
                            }
                        ],
                    },
                ],
            },
            {
                id: "stakeholder_identification_analysis",
                isCompleted: false,
                taskNumber: 2,
                name: "Stakeholder Identification & Analysis",
                description: "Learn how to identify and analyze stakeholders for the EduConnect system",
                phase: "Requirements Discovery",
                objective: "Understand who your stakeholders are and how they influence the project",
                subtasks: [
                    {
                        id: "stakeholder_identification",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Stakeholder Identification",
                        description: "Learn to identify all the people and groups who will use or be affected by the system",
                        steps: [
                            {
                                id: "list_stakeholders",
                                stepNumber: 1,
                                step: "List all stakeholders",
                                objective: "Create a simple list of all people and groups who will interact with or be affected by the EduConnect system",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Lists at least 6 different stakeholder types (students, lecturers, administrators, etc.)",
                                ],
                                deliverables: ["Stakeholder list"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "categorize_stakeholders",
                                stepNumber: 2,
                                step: "Categorize stakeholders as primary or secondary",
                                objective: "Sort your stakeholders into primary (direct users) and secondary (indirect users) groups",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Correctly categorizes stakeholders into primary and secondary groups with brief explanation",
                                ],
                                deliverables: ["Categorized stakeholder list"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                    {
                        id: "stakeholder_analysis",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Stakeholder Analysis",
                        description: "Understand your stakeholders' needs and how much influence they have on the project",
                        steps: [
                            {
                                id: "stakeholder_needs",
                                stepNumber: 1,
                                step: "Identify stakeholder needs",
                                objective: "List the main needs and concerns of each stakeholder group",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Identifies at least one specific need for each stakeholder group",
                                ],
                                deliverables: ["Stakeholder needs list"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "influence_interest_matrix",
                                stepNumber: 2,
                                step: "Create influence-interest matrix",
                                objective: "Map stakeholders based on their influence and interest in the project",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Places stakeholders in correct quadrants of influence-interest matrix with justification",
                                ],
                                deliverables: ["Influence-interest matrix"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
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
                description: "Learn to gather requirements by talking to stakeholders and understanding their problems",
                phase: "Requirements Discovery",
                objective: "Practice interviewing skills and problem identification",
                subtasks: [
                    {
                        id: "conduct_interviews",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Conduct Stakeholder Interviews",
                        description: "Interview different stakeholders to understand their problems and needs",
                        steps: [
                            {
                                id: "interview_student",
                                stepNumber: 1,
                                step: "Interview a student",
                                objective: "Talk to Sarah (student) to understand student problems with current learning systems",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Identifies at least 2 specific problems students face with current systems",
                                ],
                                deliverables: ["Student problems list"],
                                primaryAgent: "Student",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "interview_lecturer",
                                stepNumber: 2,
                                step: "Interview a lecturer",
                                objective: "Talk to Julson (lecturer) to understand lecturer challenges in teaching",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Identifies at least 2 specific challenges lecturers face in their teaching work",
                                ],
                                deliverables: ["Lecturer problems list"],
                                primaryAgent: "Lecturer",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                    {
                        id: "analyze_problems",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Analyze Problems",
                        description: "Look at the problems you found and understand what they mean for the system",
                        steps: [
                            {
                                id: "common_themes",
                                stepNumber: 1,
                                step: "Find common themes",
                                objective: "Look for patterns and common problems across different stakeholder groups",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Identifies at least 2 common themes or problems that affect multiple stakeholder groups",
                                ],
                                deliverables: ["Common themes list"],
                                primaryAgent: "Business Analyst",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "problem_impact",
                                stepNumber: 2,
                                step: "Assess problem impact",
                                objective: "Understand which problems are most important to solve",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Ranks problems by impact and explains why certain problems are more critical",
                                ],
                                deliverables: ["Problem priority list"],
                                primaryAgent: "Business Analyst",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                ],
            },
            {
                id: "requirements_analysis_prioritization",
                isCompleted: false,
                taskNumber: 4,
                name: "Requirements Analysis & Prioritization",
                description: "Learn to turn problems into clear requirements and decide which ones to work on first",
                phase: "Requirements Analysis",
                objective: "Practice creating and prioritizing requirements",
                subtasks: [
                    {
                        id: "create_requirements",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Create Requirements",
                        description: "Turn the problems you found into clear, specific requirements",
                        steps: [
                            {
                                id: "functional_requirements",
                                stepNumber: 1,
                                step: "Write functional requirements",
                                objective: "Create requirements that describe what the system should do",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Writes at least 4 clear functional requirements using simple language",
                                ],
                                deliverables: ["Functional requirements list"],
                                primaryAgent: "Business Analyst",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "user_stories",
                                stepNumber: 2,
                                step: "Create user stories",
                                objective: "Write user stories that describe features from the user's perspective",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Creates at least 3 user stories in the format: As a [role], I want [goal] so that [benefit]",
                                ],
                                deliverables: ["User stories list"],
                                primaryAgent: "UX Designer",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                    {
                        id: "prioritize_requirements",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Prioritize Requirements",
                        description: "Learn to decide which requirements are most important to implement first",
                        steps: [
                            {
                                id: "moscow_method",
                                stepNumber: 1,
                                step: "Use MoSCoW prioritization",
                                objective: "Categorize requirements as Must have, Should have, Could have, or Won't have",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Correctly categorizes at least 6 requirements using MoSCoW method with brief justification",
                                ],
                                deliverables: ["MoSCoW prioritization"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "final_priority_list",
                                stepNumber: 2,
                                step: "Create final priority list",
                                objective: "Make a final ranked list of the most important requirements to implement",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Creates a ranked list of top 5 requirements with clear business justification",
                                ],
                                deliverables: ["Final priority list"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                ],
            },
            {
                id: "requirements_validation_documentation",
                isCompleted: false,
                taskNumber: 5,
                name: "Requirements Validation & Documentation",
                description: "Learn to validate your requirements with stakeholders and document them clearly",
                phase: "Requirements Validation",
                objective: "Ensure requirements are correct and properly documented",
                subtasks: [
                    {
                        id: "validate_requirements",
                        isCompleted: false,
                        subtaskNumber: 1,
                        name: "Validate Requirements",
                        description: "Check with stakeholders that your requirements are correct and complete",
                        steps: [
                            {
                                id: "stakeholder_review",
                                stepNumber: 1,
                                step: "Get stakeholder feedback",
                                objective: "Present your requirements to stakeholders and get their feedback",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Presents requirements to at least 2 stakeholders and documents their feedback",
                                ],
                                deliverables: ["Stakeholder feedback report"],
                                primaryAgent: "Product Owner",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "resolve_feedback",
                                stepNumber: 2,
                                step: "Resolve stakeholder feedback",
                                objective: "Update requirements based on stakeholder feedback",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Updates at least 2 requirements based on stakeholder feedback with clear justification",
                                ],
                                deliverables: ["Updated requirements list"],
                                primaryAgent: "Business Analyst",
                                isSubmissionRequired: true,
                            }
                        ],
                    },
                    {
                        id: "document_requirements",
                        isCompleted: false,
                        subtaskNumber: 2,
                        name: "Document Requirements",
                        description: "Create clear documentation that the development team can use",
                        steps: [
                            {
                                id: "requirements_specification",
                                stepNumber: 1,
                                step: "Write requirements specification",
                                objective: "Create a clear document that describes each requirement in detail",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Documents at least 5 requirements with clear description, acceptance criteria, and priority",
                                ],
                                deliverables: ["Requirements specification document"],
                                primaryAgent: "Business Analyst",
                                isSubmissionRequired: true,
                            },
                            {
                                id: "acceptance_criteria",
                                stepNumber: 2,
                                step: "Define acceptance criteria",
                                objective: "Specify how the team will know when each requirement is complete",
                                isCompleted: false,
                                studentResponse: "",
                                validationCriteria: [
                                    "Creates testable acceptance criteria for at least 3 requirements",
                                ],
                                deliverables: ["Acceptance criteria document"],
                                primaryAgent: "QA Engineer",
                                isSubmissionRequired: true,
                            }
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
