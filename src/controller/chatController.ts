import { Request, Response } from "express";
import { AgentService } from "../services/agentService.js";
import { ChatRequest } from "../types/index.js";

export class ChatController {
  private agentService: AgentService;

  constructor(agentService: AgentService) {
    this.agentService = agentService;
  }

  async streamChat(req: Request, res: Response) {
    try {
      const {
        message,
        taskId,
        subtask,
        step,
        sessionId,
        agentRole,
        projectContext,
      }: ChatRequest = req.body;

      if (!message || !taskId || !sessionId || !projectContext || !step) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Set up SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });

      // Route to appropriate agent if not specified
      let selectedAgent = agentRole;
      if (!selectedAgent) {
        selectedAgent = await this.agentService.routeToAgent(
          message,
          taskId,
          projectContext
        );
        res.write(
          `data: {"type": "agent_selected", "agent": "${selectedAgent}"}\n\n`
        );
      }

      // Start streaming chat response
      res.write(
        `data: {"type": "response_start", "agent": "${selectedAgent}"}\n\n`
      );

      // Get the stream
      const responseStream = await this.agentService.chatWithAgent(
        message,
        taskId,
        subtask!,
        step,
        selectedAgent,
        sessionId,
        projectContext
      );

      console.log("Starting stream consumption..."); // Debug log

      // Process the stream
      for await (const chunk of responseStream) {
        console.log("Controller received chunk:", chunk); // Debug log
        res.write(
          `data: ${JSON.stringify({
            type: "content",
            content: chunk,
            agent: selectedAgent,
          })}\n\n`
        );

        // Ensure data is sent immediately
      }

      res.write(`data: {"type": "response_end"}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat streaming error:", error);
      res.write(`data: {"type": "error", "message": "${error.message}"}\n\n`);
      res.end();
    }
  }

  async getChatHistory(req: Request, res: Response) {
    try {
      const { sessionId, taskId } = req.params;
      // In a real implementation, you'd fetch chat history from database
      res.json({ chatHistory: [], sessionId, taskId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
