export interface ProjectContext {
  title: string;
  description: string;
  domain: string;
  stakeholders: string[];
  businessGoals: string[];
  constraints: string[];
  document: string;
}

export interface LearningTask {
  id: string;
  name: string;
  description: string;
  phase: string;
  objective: string;
  expectedOutcomes: string[];
  validationCriteria: string[];
}

export interface TeamMember {
  role: string;
  name: string;
  personality: string;
  expertise: string[];
  communicationStyle: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentRole?: string;
}

export interface ValidationResult {
  score: number;
  feedback: string;
  recommendations: string;
  passed: boolean;
}

export interface ChatRequest {
  message: string;
  taskId: string;
  sessionId: string;
  agentRole?: string;
  projectContext: ProjectContext;
}

export interface ValidationRequest {
  submission: string;
  taskId: string;
  sessionId: string;
  projectContext: ProjectContext;
}