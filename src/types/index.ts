export interface ProjectContext {
  title: string;
  description: string;
  domain: string;
  stakeholders: string[];
  businessGoals: string[];
  constraints: string[];
  document: string;
}

export interface Subtask {
  id: string;
  name: string;
  description: string;
  objective: string;
  expectedOutcomes: string[];
  validationCriteria: string[];
  deliverables: string[];
  estimatedTime: string;
  difficulty: string;
  primaryAgent: string;
}

export interface LearningTask {
  id: string;
  name: string;
  description: string;
  phase: string;
  objective: string;
  subtasks: Subtask[];
}

export interface TeamMember {
  role: string;
  name: string;
  personality: string;
  expertise: string[];
  communicationStyle: string;
  workApproach: string;
  preferredFrameworks: string[];
  detailedPersona: string;
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
  subtask?: Subtask;
  sessionId: string;
  agentRole?: string;
  projectContext: ProjectContext;
}

export interface ValidationRequest {
  submission: string;
  taskId: string;
  subtask?: Subtask;
  sessionId: string;
  projectContext: ProjectContext;
}