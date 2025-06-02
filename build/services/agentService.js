import { ChatGroq } from "@langchain/groq";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import dotenv from "dotenv";
dotenv.config();
export class AgentService {
    checkpointer;
    model;
    teamAgents;
    validationAgent;
    routingAgent;
    teamMembers;
    learningTasks;
    constructor() {
        const DB_URI = process.env.DATABASE_URL ||
            "postgresql://postgres:rtx2080ti.@db.honqcsubhfxhcxexhane.supabase.co:5432/postgres";
        this.checkpointer = new MemorySaver();
        this.model = new ChatGroq({
            model: "gemma2-9b-it",
            temperature: 0.7,
            apiKey: process.env.GROQ_API_KEY,
            streaming: true,
        });
        this.teamMembers = this.getTeamMembers();
        this.learningTasks = this.getLearningTasks();
        this.initializeAgents();
    }
    async initialize() {
        // await this.checkpointer.setup();
        console.log("AgentService initialized");
    }
    initializeAgents() {
        this.teamAgents = new Map();
        // Create team member agents
        this.teamMembers.forEach((member) => {
            const agent = createReactAgent({
                llm: this.model,
                tools: [],
                checkpointSaver: this.checkpointer,
            });
            this.teamAgents.set(member.role, agent);
        });
        // Create validation agent
        this.validationAgent = createReactAgent({
            llm: this.model,
            tools: [],
            checkpointSaver: this.checkpointer,
        });
        // Create routing agent
        this.routingAgent = createReactAgent({
            llm: this.model,
            tools: [],
            checkpointSaver: this.checkpointer,
        });
    }
    async routeToAgent(message, taskId, projectContext, preferredAgent) {
        if (preferredAgent && this.teamAgents.has(preferredAgent)) {
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
${this.teamMembers
            .map((m) => `- ${m.role} (${m.name}): ${m.expertise.join(", ")}`)
            .join("\n")}

Based on the student's message and current task, which team member would be MOST helpful to respond?
Consider:
1. The team member's expertise alignment with the question
2. The current learning phase
3. The type of guidance needed

Respond with ONLY the role name (e.g., "Product Owner", "Business Analyst", etc.)`;
        // Generate a unique thread ID for routing
        const routingThreadId = `routing_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const response = await this.routingAgent.invoke({
            messages: [new SystemMessage(routingPrompt), new HumanMessage(message)],
        }, {
            configurable: {
                thread_id: routingThreadId,
            },
        });
        const suggestedRole = response.messages[response.messages.length - 1].content.trim();
        // Validate the suggested role exists
        const validRole = this.teamMembers.find((m) => m.role.toLowerCase() === suggestedRole.toLowerCase());
        return validRole ? validRole.role : "Business Analyst"; // Default fallback
    }
    async chatWithAgent(message, taskId, agentRole, sessionId, projectContext) {
        const task = this.learningTasks.find((t) => t.id === taskId);
        const member = this.teamMembers.find((m) => m.role === agentRole);
        if (!task || !member) {
            throw new Error("Invalid task or team member");
        }
        const agent = this.teamAgents.get(member.role);
        const systemPrompt = this.buildTeamMemberPrompt(member, task, projectContext);
        // Ensure thread_id is properly formatted and not null
        const threadId = `${sessionId}_${agentRole.replace(/\s+/g, "_")}_${taskId}`;
        const response = await agent.stream({
            messages: [new SystemMessage(systemPrompt), new HumanMessage(message)],
        }, {
            configurable: {
                thread_id: threadId,
            },
        });
        return this.streamResponse(response);
    }
    async validateSubmission(submission, taskId, sessionId, projectContext) {
        const task = this.learningTasks.find((t) => t.id === taskId);
        if (!task)
            throw new Error("Invalid task");
        const systemPrompt = this.buildValidationPrompt(task, projectContext);
        // Ensure thread_id is properly formatted and not null
        const threadId = `${sessionId}_validation_${taskId}`;
        const response = await this.validationAgent.invoke({
            messages: [
                new SystemMessage(systemPrompt),
                new HumanMessage(`Please evaluate this student submission:\n\n${submission}`),
            ],
        }, {
            configurable: {
                thread_id: threadId,
            },
        });
        const result = response.messages[response.messages.length - 1].content;
        const scoreMatch = result.match(/SCORE:\s*(\d+)/);
        const feedbackMatch = result.match(/FEEDBACK:\s*(.*?)(?=RECOMMENDATIONS:|$)/s);
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
    async *streamResponse(response) {
        try {
            for await (const event of response) {
                // Handle both LangChain and direct LLM streaming formats
                const content = event?.content ||
                    event?.data?.content ||
                    event?.messages?.[0]?.content ||
                    JSON.stringify(event);
                console.log("Yielding chunk:", content); // Debug logging
                yield content;
            }
        }
        catch (error) {
            console.error("Stream error:", error);
            yield `[ERROR] ${error.message}`;
        }
    }
    buildTeamMemberPrompt(member, task, projectContext) {
        return `You are ${member.name}, a ${member.role} working on the following project:

PROJECT CONTEXT:
${projectContext.title}
${projectContext.description}

Domain: ${projectContext.domain}
Key Stakeholders: ${projectContext.stakeholders.join(", ")}
Business Goals: ${projectContext.businessGoals.join(", ")}
Constraints: ${projectContext.constraints.join(", ")}

CURRENT TASK: ${task.name}
Task Description: ${task.description}
Phase: ${task.phase}
Objective: ${task.objective}

YOUR ROLE CHARACTERISTICS:
- Personality: ${member.personality}
- Expertise: ${member.expertise.join(", ")}
- Communication Style: ${member.communicationStyle}

INSTRUCTIONS:
1. You are participating in a learning session where a student is working on requirements engineering
2. Respond as ${member.name} would in a real team meeting
3. Provide insights and perspectives based on your role and expertise
4. Guide the student through questions and suggestions, but don't give direct answers
5. Draw from the project context to make your responses realistic and relevant
6. Stay in character and maintain your professional persona
7. Be helpful but let the student discover solutions through guided exploration
8. Keep responses conversational and engaging
9. Reference the project context when relevant

Remember: You're helping a student LEARN, not doing their work for them.`;
    }
    buildValidationPrompt(task, projectContext) {
        return `You are an expert Requirements Engineering instructor evaluating student submissions.

CURRENT TASK: ${task.name}
Task Description: ${task.description}
Expected Outcomes: ${task.expectedOutcomes.join(", ")}
Validation Criteria: ${task.validationCriteria.join(", ")}

PROJECT CONTEXT:
${projectContext.title}
${projectContext.description}

EVALUATION INSTRUCTIONS:
1. Assess the student's submission against the validation criteria
2. Provide a score from 0-100 based on:
   - Completeness (30%)
   - Accuracy (30%)
   - Quality (25%)
   - Understanding demonstrated (15%)
3. Give constructive feedback highlighting strengths and areas for improvement
4. If score is below 70, suggest specific improvements
5. If score is 70 or above, acknowledge good work and suggest optional enhancements
6. Be encouraging and educational in your feedback

FORMAT YOUR RESPONSE AS:
SCORE: [0-100]
FEEDBACK: [Your detailed feedback]
RECOMMENDATIONS: [Specific suggestions for improvement or next steps]`;
    }
    getTeamMembers() {
        return [
            {
                role: "Product Owner",
                name: "Sarah Chen",
                personality: "Business-focused, decisive, user-centric",
                expertise: ["Business Analysis", "User Experience", "Product Strategy"],
                communicationStyle: "Direct, focuses on business value and user needs",
            },
            {
                role: "Business Analyst",
                name: "Michael Rodriguez",
                personality: "Detail-oriented, methodical, collaborative",
                expertise: [
                    "Requirements Analysis",
                    "Process Modeling",
                    "Stakeholder Management",
                ],
                communicationStyle: "Analytical, asks probing questions, focuses on clarity",
            },
            {
                role: "Technical Lead",
                name: "Emma Thompson",
                personality: "Pragmatic, solution-oriented, quality-focused",
                expertise: [
                    "System Architecture",
                    "Technical Constraints",
                    "Risk Assessment",
                ],
                communicationStyle: "Technical but accessible, focuses on feasibility and risks",
            },
            {
                role: "UX Designer",
                name: "David Park",
                personality: "Creative, user-empathetic, collaborative",
                expertise: ["User Research", "Interaction Design", "Usability"],
                communicationStyle: "User-focused, visual thinker, emphasizes user experience",
            },
            {
                role: "Quality Assurance Lead",
                name: "Lisa Wang",
                personality: "Thorough, quality-focused, risk-aware",
                expertise: [
                    "Testing Strategy",
                    "Quality Metrics",
                    "Requirements Validation",
                ],
                communicationStyle: "Detail-oriented, focuses on testability and quality",
            },
        ];
    }
    getLearningTasks() {
        return [
            {
                id: "user_stories",
                name: "User Story Identification",
                description: "Identify and write user stories for the project",
                phase: "Requirements Elicitation",
                objective: "Learn to extract user stories from project requirements",
                expectedOutcomes: [
                    "List of well-formed user stories",
                    "User story priorities",
                ],
                validationCriteria: [
                    "Follows 'As a... I want... So that...' format",
                    "Covers main user scenarios",
                    "Includes acceptance criteria",
                ],
            },
            {
                id: "stakeholder_analysis",
                name: "Stakeholder Identification & Analysis",
                description: "Identify all stakeholders and analyze their interests",
                phase: "Stakeholder Analysis",
                objective: "Learn to identify and categorize project stakeholders",
                expectedOutcomes: [
                    "Stakeholder list",
                    "Stakeholder influence/interest matrix",
                ],
                validationCriteria: [
                    "Comprehensive stakeholder coverage",
                    "Proper categorization",
                    "Interest/influence assessment",
                ],
            },
            {
                id: "functional_requirements",
                name: "Functional Requirements Specification",
                description: "Define detailed functional requirements",
                phase: "Requirements Specification",
                objective: "Learn to specify detailed functional requirements",
                expectedOutcomes: [
                    "Detailed functional requirements",
                    "Requirements traceability",
                ],
                validationCriteria: [
                    "Clear and unambiguous",
                    "Testable",
                    "Complete coverage",
                ],
            },
            {
                id: "non_functional_requirements",
                name: "Non-Functional Requirements",
                description: "Identify performance, security, and quality requirements",
                phase: "Requirements Specification",
                objective: "Learn to identify quality attributes and constraints",
                expectedOutcomes: ["NFR categories", "Specific quality metrics"],
                validationCriteria: [
                    "Covers key quality attributes",
                    "Measurable criteria",
                    "Realistic constraints",
                ],
            },
            {
                id: "requirements_validation",
                name: "Requirements Validation",
                description: "Review and validate requirements for completeness and consistency",
                phase: "Requirements Validation",
                objective: "Learn validation techniques and quality checks",
                expectedOutcomes: ["Validation checklist", "Issues identified"],
                validationCriteria: [
                    "Systematic validation approach",
                    "Issue identification",
                    "Resolution suggestions",
                ],
            },
        ];
    }
    getTeamMembersList() {
        return this.teamMembers;
    }
    getLearningTasksList() {
        return this.learningTasks;
    }
}
