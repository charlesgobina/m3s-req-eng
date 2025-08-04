import { SystemMessage, HumanMessage } from "@langchain/core/messages";
export class ValidationService {
    memoryService;
    agentFactory;
    constructor(memoryService, agentFactory) {
        this.memoryService = memoryService;
        this.agentFactory = agentFactory;
    }
    async validateSubmission(submission, taskId, subTask, step, sessionId, userId, learningTasks, retrieveRelevantContext) {
        const task = learningTasks.find((t) => t.id === taskId);
        if (!task)
            throw new Error("Invalid task");
        // Retrieve context for validation using the original submission
        const retrievedContext = await retrieveRelevantContext(submission);
        const systemPrompt = this.buildValidationPrompt(task, subTask, step, retrievedContext);
        const threadId = `${sessionId}_validation_${taskId}`;
        // Get progress-aware memory for validation thread (now async due to Redis)
        const validationMemory = await this.memoryService.getStepMemory(userId, taskId, subTask.id, step.id);
        const memoryMessages = await validationMemory.chatHistory.getMessages();
        const managedMessages = [
            new SystemMessage(systemPrompt),
            ...memoryMessages.slice(-2), // Keep fewer messages for validation
            new HumanMessage(`Please evaluate this student submission:\n\n${submission}`)
        ];
        const validationAgent = this.agentFactory.getValidationAgent();
        const response = await validationAgent.invoke({
            messages: managedMessages,
        });
        const result = response.messages[response.messages.length - 1].content;
        const scoreMatch = result.match(/SCORE:\s*(\d+)/);
        const feedbackMatch = result.match(/FEEDBACK:\s*(.*?)(?=RECOMMENDATIONS:|$)/s);
        const recommendationsMatch = result.match(/RECOMMENDATIONS:\s*(.*?)$/s);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
        const validationResult = {
            score,
            feedback: feedbackMatch
                ? feedbackMatch[1].trim()
                : "No feedback provided",
            recommendations: recommendationsMatch
                ? recommendationsMatch[1].trim()
                : "No recommendations provided",
            passed: score >= 70,
        };
        return validationResult;
    }
    buildValidationPrompt(task, subTask, step, retrievedContext) {
        return `You are an expert Requirements Engineering instructor evaluating student submissions of ${step.step}.

CRITICAL CONSTRAINT: You MUST base your evaluation ONLY on the RELEVANT PROJECT CONTEXT provided below and the specific validation criteria. DO NOT use general knowledge or external information beyond what is provided.

CURRENT TASK: ${task.name}
Task Description: ${task.description}
Subtask Name: ${subTask.name}
Subtask Description: ${subTask.description}

VALIDATION CRITERIA (THE ONLY CRITERIA TO evaluate the student's submission): 
${step.validationCriteria.join(", ")}

RELEVANT PROJECT CONTEXT (YOUR ONLY KNOWLEDGE SOURCE):
${retrievedContext}

EVALUATION INSTRUCTIONS:
1. Evaluate the submission ONLY against the provided validation criteria
2. Base your feedback ONLY on the project context provided above
3. If the project context lacks sufficient information for evaluation, note this in your feedback
4. Do not apply general requirements engineering knowledge beyond what's in the project context

FORMAT YOUR RESPONSE AS:
SCORE: [0-100]
FEEDBACK: [Your SHORT AND CONCISE detailed feedback based solely on project context]
RECOMMENDATIONS: [Specific suggestions for improvement based on project context, IF YOU HAVE ANY, or next steps]`;
    }
}
