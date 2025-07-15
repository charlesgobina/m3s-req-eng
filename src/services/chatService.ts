import { db, fbAdmin } from '../config/adminConfig.js';
import { 
  ChatMessage, 
  FirestoreChatMessage, 
  ChatDocument, 
  ChatSummary 
} from '../types/index.js';
import { AgentService } from "./agentService.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * ChatService - Handles chat message persistence using Firebase Admin SDK
 * 
 * This service manages chat messages independently from task data to:
 * - Prevent document size limits on main task documents
 * - Enable better performance for chat operations
 * - Allow unlimited message history per step
 * 
 * Collection Structure:
 * chat_messages/{userId}/step_chats/{taskId}_{subtaskId}_{stepId}
 * ├── messages: Array<ChatMessage>
 * ├── messageCount: number
 * └── lastUpdated: Timestamp
 */
export class ChatService {
  private agentService: AgentService;

  constructor() {
    // Initialize AgentService for accessing team members
    this.agentService = new AgentService();
  }

  /**
   * Creates a document ID for chat messages
   * Format: {taskId}_{subtaskId}_{stepId}
   */
  private createChatDocumentId(taskId: string, subtaskId: string, stepId: string): string {
    return `${taskId}_${subtaskId}_${stepId}`;
  }

  /**
   * Creates a Firestore document reference for chat messages
   */
  private getChatDocumentRef(userId: string, taskId: string, subtaskId: string, stepId: string) {
    const chatDocId = this.createChatDocumentId(taskId, subtaskId, stepId);
    
    console.log('🔗 Creating document reference:', {
      userId,
      taskId,
      subtaskId,
      stepId,
      chatDocId,
      fullPath: `chat_messages/${userId}/step_chats/${chatDocId}`
    });
    
    return db.collection('chat_messages').doc(userId).collection('step_chats').doc(chatDocId);
  }

  /**
   * Retrieves all chat messages for a specific step
   */
  async getChatMessages(
    userId: string, 
    taskId: string, 
    subtaskId: string, 
    stepId: string
  ): Promise<ChatMessage[]> {
    try {
      console.log('💬 ChatService: Loading messages for', { userId, taskId, subtaskId, stepId });
      
      // Log the exact Firestore path being queried
      const chatDocId = this.createChatDocumentId(taskId, subtaskId, stepId);
      const firestorePath = `chat_messages/${userId}/step_chats/${chatDocId}`;
      console.log('🔍 EXACT FIRESTORE PATH:', firestorePath);
      
      const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
      console.log('🔍 FIRESTORE DOC REF PATH:', chatDocRef.path);
      
      const chatDoc = await chatDocRef.get();
      
      if (!chatDoc.exists) {
        console.log('📭 ChatService: No chat document found, returning empty array');
        return [];
      }
      
      const chatData = chatDoc.data() as ChatDocument;
      const messages = chatData.messages || [];
      
      // Log what we actually retrieved
      console.log('🔍 FIRESTORE DATA RETRIEVED:', {
        messageCount: messages.length,
        documentId: chatDoc.id,
        documentPath: chatDoc.ref.path,
        firstMessageSample: messages.length > 0 ? {
          id: messages[0].id,
          role: messages[0].role,
          content: messages[0].content.substring(0, 50) + '...',
          timestamp: messages[0].timestamp
        } : null
      });
      
      // Convert Firestore timestamps to Date objects for UI
      const uiMessages: ChatMessage[] = messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : msg.timestamp.toDate(),
        agentRole: msg.agentRole
      }));
      
      console.log(`✅ ChatService: Loaded ${uiMessages.length} messages`);
      return uiMessages;
      
    } catch (error) {
      console.error('❌ ChatService: Failed to load messages:', error);
      throw new Error(`Failed to load chat messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Adds a new chat message to the step's chat collection
   */
  async addChatMessage(
    userId: string,
    taskId: string, 
    subtaskId: string,
    stepId: string,
    message: Omit<FirestoreChatMessage, 'timestamp'> & { timestamp?: any }
  ): Promise<void> {
    try {
      console.log('💬 ChatService: Adding message', { 
        userId, 
        taskId, 
        subtaskId, 
        stepId, 
        messageRole: message.role,
        messageLength: message.content.length 
      });
      
      // Validate required fields
      if (!message.id || !message.role || !message.content) {
        throw new Error('Message missing required fields: id, role, or content');
      }
      
      // Clean the message object and ensure timestamp
      // Note: Cannot use serverTimestamp() inside arrayUnion, use actual timestamp
      const cleanMessage: FirestoreChatMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || new Date(),
        ...(message.agentRole && { agentRole: message.agentRole })
      };
      
      const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
      
      // Check if document exists
      const chatDoc = await chatDocRef.get();
      
      if (!chatDoc.exists) {
        // Create new chat document
        const newChatDocument: ChatDocument = {
          messages: [cleanMessage],
          messageCount: 1,
          lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
        };
        
        await chatDocRef.set(newChatDocument);
        console.log('✅ ChatService: Created new chat document with first message');
      } else {
        // Update existing document
        await chatDocRef.update({
          messages: fbAdmin.firestore.FieldValue.arrayUnion(cleanMessage),
          messageCount: fbAdmin.firestore.FieldValue.increment(1),
          lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ ChatService: Added message to existing chat document');
      }
      
    } catch (error) {
      console.error('❌ ChatService: Failed to add message:', error);
      throw new Error(`Failed to add chat message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets chat summary statistics for a step
   */
  async getChatSummary(
    userId: string,
    taskId: string,
    subtaskId: string, 
    stepId: string
  ): Promise<ChatSummary | null> {
    try {
      console.log('📊 ChatService: Getting chat summary for', { userId, taskId, subtaskId, stepId });
      
      const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
      const chatDoc = await chatDocRef.get();
      
      if (!chatDoc.exists) {
        console.log('📭 ChatService: No chat document found for summary');
        return null;
      }
      
      const chatData = chatDoc.data() as ChatDocument;
      
      const summary: ChatSummary = {
        chatMessageCount: chatData.messageCount || 0,
        lastChatAt: chatData.lastUpdated
      };
      
      console.log('✅ ChatService: Retrieved chat summary:', summary);
      return summary;
      
    } catch (error) {
      console.error('❌ ChatService: Failed to get chat summary:', error);
      throw new Error(`Failed to get chat summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates a simple welcome message based on agent role
   */
  async createInitialWelcomeMessage(
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): Promise<ChatMessage> {
    try {
      console.log(`🎯 [WELCOME-MSG] Creating welcome message for user ${userId}`);
      console.log(`   └─ Context: ${taskId}/${subtaskId}/${stepId}`);
      
      // Get the primary agent for this step
      const primaryAgent = await this.getPrimaryAgentForStep(taskId, subtaskId, stepId);
      
      // Generate simple welcome message
      const welcomeMessage = this.generateSimpleWelcomeMessage(
        primaryAgent,
        taskId,
        subtaskId,
        stepId,
        userId
      );

      console.log(`✅ [WELCOME-MSG] Simple welcome message generated`);
      console.log(`   └─ Agent: ${primaryAgent.role}`);
      console.log(`   └─ Message length: ${welcomeMessage.content.length} chars`);

      // Add the message to chat history
      await this.addChatMessage(userId, taskId, subtaskId, stepId, {
        id: welcomeMessage.id,
        role: welcomeMessage.role,
        content: welcomeMessage.content,
        agentRole: welcomeMessage.agentRole
      });

      return welcomeMessage;

    } catch (error) {
      console.error(`❌ [WELCOME-MSG] Error creating welcome message:`, error);
      
      // Fallback to generic welcome message
      return this.createFallbackWelcomeMessage(taskId, subtaskId, stepId, userId);
    }
  }


  /**
   * Get current step information for context
   */
  private async getCurrentStepInfo(taskId: string, subtaskId: string, stepId: string): Promise<any> {
    try {
      // Define step mappings based on your task structure
      const stepMappings: Record<string, any> = {
        'stakeholder_identification_analysis': {
          taskName: 'Stakeholder Identification & Analysis',
          subtasks: {
            'stakeholder_identification': {
              name: 'Stakeholder Identification',
              steps: {
                'comprehensive_stakeholder_list': { stepName: 'Comprehensive Stakeholder List', primaryAgent: 'Product Owner' },
                'stakeholder_categorization': { stepName: 'Stakeholder Categorization', primaryAgent: 'Product Owner' },
                'direct_and_indirect_stakeholders': { stepName: 'Direct and Indirect Stakeholders', primaryAgent: 'Product Owner' }
              }
            },
            'stakeholder_analysis': {
              name: 'Stakeholder Analysis & Prioritization',
              steps: {
                'stakeholder_power_dynamics': { stepName: 'Stakeholder Power Dynamics', primaryAgent: 'Product Owner' },
                'engagement_strategies': { stepName: 'Engagement Strategies', primaryAgent: 'Product Owner' }
              }
            }
          }
        },
        'requirements_elicitation': {
          taskName: 'Requirements Elicitation',
          subtasks: {
            'elicitation_techniques': {
              name: 'Conduct Interviews',
              steps: {
                'interviews': { stepName: 'Interview with Sarah', primaryAgent: 'Student' },
                'interview_julson': { stepName: 'Interview with Julson', primaryAgent: 'Lecturer' },
                'interview_kalle': { stepName: 'Interview with Kalle', primaryAgent: 'Academic Advisor' }
              }
            }
          }
        },
        'requirements_analysis_prioritization': {
          taskName: 'Requirements Analysis & Prioritization',
          subtasks: {
            'requirements_analysis': {
              name: 'Requirements Analysis',
              steps: {
                'analyze_findings': { stepName: 'Analyze Interview Findings', primaryAgent: 'Technical Lead' },
                'requirements_modeling': { stepName: 'Requirements Modeling Workshop', primaryAgent: 'UX Designer' },
                'conflict_resolution': { stepName: 'Conflict Resolution Session', primaryAgent: 'Product Owner' }
              }
            },
            'requirements_prioritization': {
              name: 'Requirements Prioritization',
              steps: {
                'moscow_prioritization': { stepName: 'MoSCoW Prioritization', primaryAgent: 'Product Owner' },
                'value_effort_analysis': { stepName: 'Value vs. Effort Analysis', primaryAgent: 'Technical Lead' },
                'final_prioritization': { stepName: 'Final Prioritization Review', primaryAgent: 'Product Owner' }
              }
            }
          }
        }
      };

      const taskInfo = stepMappings[taskId];
      const subtaskInfo = taskInfo?.subtasks?.[subtaskId];
      const stepInfo = subtaskInfo?.steps?.[stepId];

      return {
        taskName: taskInfo?.taskName || taskId,
        subtaskName: subtaskInfo?.name || subtaskId,
        stepName: stepInfo?.stepName || stepId,
        primaryAgent: stepInfo?.primaryAgent || 'Product Owner'
      };

    } catch (error) {
      console.error(`❌ Error getting current step info:`, error);
      return {
        taskName: taskId,
        subtaskName: subtaskId,
        stepName: stepId,
        primaryAgent: 'Product Owner'
      };
    }
  }

  /**
   * Get primary agent information for this step
   */
  private async getPrimaryAgentForStep(taskId: string, subtaskId: string, stepId: string): Promise<any> {
    const stepInfo = await this.getCurrentStepInfo(taskId, subtaskId, stepId);
    
    // Agent information mapping
    const agentMappings: Record<string, any> = {
      'Product Owner': {
        role: 'Product Owner',
        name: 'Sarah Chen',
        personality: 'experienced and strategic',
        greeting: 'Hello there!',
        isStakeholder: false
      },
      'Technical Lead': {
        role: 'Technical Lead',
        name: 'Emma Thompson',
        personality: 'analytical and thorough',
        greeting: 'Hi!',
        isStakeholder: false
      },
      'UX Designer': {
        role: 'UX Designer',
        name: 'David Park',
        personality: 'creative and user-focused',
        greeting: 'Hey!',
        isStakeholder: false
      },
      'QA Lead': {
        role: 'QA Lead',
        name: 'Lisa Wang',
        personality: 'detail-oriented and methodical',
        greeting: 'Good to see you!',
        isStakeholder: false
      },
      'Student': {
        role: 'Student',
        name: 'Sarah',
        personality: 'curious and eager to learn',
        greeting: 'Hi there!',
        isStakeholder: true
      },
      'Lecturer': {
        role: 'Lecturer',
        name: 'Julson',
        personality: 'knowledgeable and pedagogical',
        greeting: 'Good day!',
        isStakeholder: true
      },
      'Academic Advisor': {
        role: 'Academic Advisor',
        name: 'Kalle',
        personality: 'supportive and organized',
        greeting: 'Hello!',
        isStakeholder: true
      }
    };

    return agentMappings[stepInfo.primaryAgent] || agentMappings['Product Owner'];
  }

  /**
   * Generate simple welcome message based on agent type
   */
  private generateSimpleWelcomeMessage(
    primaryAgent: any,
    taskId: string,
    subtaskId: string,
    stepId: string,
    userId: string
  ): any {
    let content = '';
    
    if (primaryAgent.isStakeholder) {
      // Stakeholder interview message - focus on introduction and interview readiness
      content = `${primaryAgent.greeting} I'm ${primaryAgent.name}, a ${primaryAgent.role} here at the university. I understand you'll be interviewing me for your project - I'm ready to answer your questions and share my perspective!`;
    } else {
      // Core team member message - simple guidance message
      content = `${primaryAgent.greeting} I'm ${primaryAgent.name}, your ${primaryAgent.role}. I'm here to guide you through this step of your requirements engineering journey. Let's get started!`;
    }

    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content,
      timestamp: new Date(),
      role: 'assistant',
      agentRole: primaryAgent.role,
      agentName: primaryAgent.name,
      isWelcomeMessage: true
    };
  }


  /**
   * Fallback welcome message for error cases
   */
  private createFallbackWelcomeMessage(taskId: string, subtaskId: string, stepId: string, userId: string): any {
    console.log(`🔄 [WELCOME-FALLBACK] Creating fallback welcome message`);
    
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: "Hello! Welcome to this step of your requirements engineering journey. I'm here to help guide you through the process. How can I assist you today?",
      timestamp: new Date(),
      role: 'assistant',
      agentRole: 'Product Owner',
      agentName: 'Sarah Chen',
      isWelcomeMessage: true
    };
  }

  /**
   * Gets step information from the task list
   */
  private async getStepInformation(taskId: string, subtaskId: string, stepId: string): Promise<any> {
    try {
      await this.agentService.initialize();
      const tasks = this.agentService.getLearningTasksList();
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) return null;
      
      const subtask = task.subtasks.find(st => st.id === subtaskId);
      if (!subtask) return null;
      
      const step = subtask.steps.find(s => s.id === stepId);
      if (!step) return null;
      
      return {
        task,
        subtask,
        step
      };
    } catch (error) {
      console.error('❌ ChatService: Error getting step information:', error);
      return null;
    }
  }

  /**
   * Gets user name from Firebase Auth
   */
  private async getUserName(userId: string): Promise<string> {
    try {
      const userRecord = await fbAdmin.auth().getUser(userId);
      return userRecord.displayName || userRecord.email?.split('@')[0] || 'Student';
    } catch (error) {
      console.error('❌ ChatService: Error getting user name:', error);
      return 'Student';
    }
  }



  /**
   * Deletes all chat messages for a specific step
   */
  async deleteChatHistory(
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string
  ): Promise<void> {
    try {
      console.log('🗑️ ChatService: Deleting chat history for', { userId, taskId, subtaskId, stepId });
      
      const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
      
      // Reset the document instead of deleting to maintain structure
      const emptyChatDocument: ChatDocument = {
        messages: [],
        messageCount: 0,
        lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
      };
      
      await chatDocRef.set(emptyChatDocument);
      console.log('✅ ChatService: Chat history deleted');
      
    } catch (error) {
      console.error('❌ ChatService: Failed to delete chat history:', error);
      throw new Error(`Failed to delete chat history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Tests connection to Firestore for chat operations
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔌 ChatService: Testing Firestore connection...');
      
      // Create a test document reference
      const testDoc = db.collection('chat_messages').doc('test').collection('step_chats').doc('connection_test');
      
      // Try to write a test document
      await testDoc.set({ 
        test: true, 
        timestamp: fbAdmin.firestore.FieldValue.serverTimestamp(),
        service: 'ChatService'
      });
      
      console.log('✅ ChatService: Connection test successful');
      return true;
      
    } catch (error) {
      console.error('❌ ChatService: Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const chatService = new ChatService();