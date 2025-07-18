import { ConversationSummaryBufferMemory } from "langchain/memory";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { db } from '../config/adminConfig.js';

export class SmartProgressMemory extends ConversationSummaryBufferMemory {
  private userId: string;
  private taskId: string;
  private subtaskId: string;
  private stepId: string;
  private contextCache: Map<string, any> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private sessionId: string;
  private memoryId: string;

  constructor(
    userId: string,
    taskId: string,
    subtaskId: string,
    stepId: string,
    sessionId: string,
    llm: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference,
    options?: any
  ) {
    super({
      llm,
      maxTokenLimit: 2000,
      returnMessages: true,
      ...options,
    });
    
    this.userId = userId;
    this.taskId = taskId;
    this.subtaskId = subtaskId;
    this.stepId = stepId;
    this.sessionId = sessionId;
    this.memoryId = `${userId}_${taskId}_${subtaskId}_${stepId}`;

    console.log(`🧠 [MEMORY-INIT] Created SmartProgressMemory`);
    console.log(`   └─ Memory ID: ${this.memoryId}`);
    console.log(`   └─ Session ID: ${sessionId}`);
    console.log(`   └─ User: ${userId}`);
    console.log(`   └─ Context: ${taskId}/${subtaskId}/${stepId}`);
  }

  // Main method: Get relevant context for specific agent
  async getRelevantContextForAgent(agentRole: string, userQuestion: string): Promise<string> {
    const startTime = Date.now();
    const cacheKey = `${this.userId}_${agentRole}_${this.taskId}_context`;
    
    console.log(`🔍 [CONTEXT-REQUEST] Loading context for ${agentRole}`);
    console.log(`   └─ Cache Key: ${cacheKey}`);
    console.log(`   └─ Question: ${userQuestion.substring(0, 100)}...`);
    
    const cached = this.contextCache.get(cacheKey);
    
    // Return cached context if still valid
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      const cacheAge = Math.round((Date.now() - cached.timestamp) / 1000);
      console.log(`📋 [CACHE-HIT] Using cached context (${cacheAge}s old)`);
      console.log(`   └─ Context size: ${cached.context.length} characters`);
      
      const filteredContext = this.filterContextByQuestion(cached.context, userQuestion);
      const loadTime = Date.now() - startTime;
      
      console.log(`✅ [CONTEXT-READY] Context loaded in ${loadTime}ms (cached)`);
      return filteredContext;
    }

    console.log(`🔄 [CACHE-MISS] Loading fresh context from Firestore`);
    const context = await this.loadAgentSpecificContext(agentRole, userQuestion);
    
    // Cache the context
    this.contextCache.set(cacheKey, {
      context,
      timestamp: Date.now()
    });

    const loadTime = Date.now() - startTime;
    console.log(`✅ [CONTEXT-READY] Fresh context loaded in ${loadTime}ms`);
    console.log(`   └─ Context size: ${context.length} characters`);
    console.log(`   └─ Cached for future requests`);

    return context;
  }

  // Load context specifically relevant to the agent and question
  private async loadAgentSpecificContext(agentRole: string, userQuestion: string): Promise<string> {
    try {
      console.log(`🔍 [CONTEXT-LOADING] Building context for ${agentRole}`);
      const contextParts: string[] = [];
      const loadingSteps: string[] = [];
      
      // 1. Load user's completed progress
      console.log(`   📊 Loading user progress...`);
      const progressStartTime = Date.now();
      const progressContext = await this.loadUserProgress();
      const progressTime = Date.now() - progressStartTime;
      
      if (progressContext) {
        contextParts.push("📊 ACTUAL COMPLETED STUDENT PROGRESS (only reference this for past work):");
        contextParts.push(progressContext);
        contextParts.push("--- END OF ACTUAL COMPLETED PROGRESS ---");
        loadingSteps.push(`Progress: ${progressTime}ms`);
        console.log(`   ✅ Progress loaded (${progressTime}ms) - ${progressContext.split('\n').length} items`);
      } else {
        contextParts.push("📊 ACTUAL COMPLETED STUDENT PROGRESS: None - this is a new student");
        console.log(`   ⚠️  No previous progress found`);
      }

      // 2. Load relevant conversations based on agent expertise and question
      console.log(`   💬 Loading relevant conversations...`);
      const conversationsStartTime = Date.now();
      const relevantConversations = await this.loadRelevantConversations(agentRole, userQuestion);
      const conversationsTime = Date.now() - conversationsStartTime;
      
      if (relevantConversations.length > 0) {
        contextParts.push("\n💬 ACTUAL PREVIOUS CONVERSATIONS (only reference these if they exist):");
        contextParts.push(...relevantConversations);
        contextParts.push("--- END OF ACTUAL CONVERSATIONS ---");
        loadingSteps.push(`Conversations: ${conversationsTime}ms`);
        console.log(`   ✅ Conversations loaded (${conversationsTime}ms) - ${relevantConversations.length} relevant chats`);
      } else {
        contextParts.push("\n💬 ACTUAL PREVIOUS CONVERSATIONS: None found");
        console.log(`   ⚠️  No relevant conversations found`);
      }

      // 3. Load agent-specific insights
      console.log(`   🧠 Loading agent insights...`);
      const insightsStartTime = Date.now();
      const agentInsights = await this.loadAgentInsights(agentRole);
      const insightsTime = Date.now() - insightsStartTime;
      
      if (agentInsights) {
        contextParts.push("\n🧠 YOUR ACTUAL PREVIOUS INSIGHTS WITH THIS STUDENT:");
        contextParts.push(agentInsights);
        contextParts.push("--- END OF YOUR ACTUAL INSIGHTS ---");
        loadingSteps.push(`Insights: ${insightsTime}ms`);
        console.log(`   ✅ Agent insights loaded (${insightsTime}ms) - ${agentInsights.length} characters`);
      } else {
        contextParts.push("\n🧠 YOUR ACTUAL PREVIOUS INSIGHTS WITH THIS STUDENT: None");
        console.log(`   ⚠️  No previous insights found for ${agentRole}`);
      }

      // 4. Load cross-agent insights
      console.log(`   🤝 Loading cross-agent insights...`);
      const crossInsightsStartTime = Date.now();
      const crossAgentInsights = await this.loadCrossAgentInsights(agentRole);
      const crossInsightsTime = Date.now() - crossInsightsStartTime;
      
      if (crossAgentInsights.length > 0) {
        contextParts.push("\n🤝 ACTUAL INSIGHTS FROM TEAM COLLEAGUES:");
        contextParts.push(...crossAgentInsights);
        contextParts.push("--- END OF COLLEAGUE INSIGHTS ---");
        loadingSteps.push(`Cross-insights: ${crossInsightsTime}ms`);
        console.log(`   ✅ Cross-agent insights loaded (${crossInsightsTime}ms) - ${crossAgentInsights.length} insights`);
      } else {
        contextParts.push("\n🤝 ACTUAL INSIGHTS FROM TEAM COLLEAGUES: None");
        console.log(`   ⚠️  No cross-agent insights found`);
      }

      const totalContext = contextParts.join('\n');
      console.log(`📋 [CONTEXT-SUMMARY] Context building complete`);
      console.log(`   └─ Components: ${loadingSteps.join(', ')}`);
      console.log(`   └─ Total size: ${totalContext.length} characters`);
      
      return totalContext;
      
    } catch (error) {
      console.error(`❌ [CONTEXT-ERROR] Error loading agent context for ${agentRole}:`, error);
      console.error(`   └─ User: ${this.userId}, Task: ${this.taskId}`);
      return "Context loading failed - proceeding with current conversation only.";
    }
  }

  // Enhanced conversation loading with detailed logging
  private async loadRelevantConversations(agentRole: string, userQuestion: string): Promise<string[]> {
    try {
      console.log(`   🔍 [CONV-SEARCH] Searching conversations for ${agentRole}`);
      
      const agentExpertiseMap: Record<string, string[]> = {
        'Product Owner': ['stakeholder', 'business', 'requirement', 'priority', 'value', 'goal', 'objective'],
        'Technical Lead': ['technical', 'architecture', 'feasibility', 'system', 'implementation', 'technology'],
        'UX Designer': ['user', 'interface', 'usability', 'design', 'experience', 'interaction'],
        'QA Lead': ['testing', 'validation', 'quality', 'criteria', 'acceptance', 'verification'],
        'Student': ['learning', 'education', 'course', 'assignment', 'study'],
        'Lecturer': ['teaching', 'curriculum', 'education', 'learning', 'academic'],
        'Academic Advisor': ['student', 'support', 'guidance', 'academic', 'planning']
      };

      const questionKeywords = this.extractKeywords(userQuestion);
      const agentKeywords = agentExpertiseMap[agentRole] || [];
      
      console.log(`   └─ Agent keywords: [${agentKeywords.slice(0, 3).join(', ')}...]`);
      console.log(`   └─ Question keywords: [${questionKeywords.slice(0, 3).join(', ')}...]`);
      
      // Get all user's step chats
      const stepChatsRef = db.collection('chat_messages')
        .doc(this.userId)
        .collection('step_chats');
      
      const stepChatsSnapshot = await stepChatsRef.get();
      console.log(`   └─ Found ${stepChatsSnapshot.docs.length} total conversations`);
      
      const relevantConversations: Array<{summary: string, relevanceScore: number, timestamp: any, stepId: string}> = [];
      let processedConversations = 0;
      let skippedCurrent = 0;
      let scoredConversations = 0;

      for (const doc of stepChatsSnapshot.docs) {
        processedConversations++;
        const chatData = doc.data();
        const stepChatId = doc.id;
        
        // Skip current conversation
        if (stepChatId === `${this.taskId}_${this.subtaskId}_${this.stepId}`) {
          skippedCurrent++;
          continue;
        }

        // Check if this conversation is relevant
        const conversationText = chatData.messages
          ?.map((msg: any) => msg.content)
          .join(' ')
          .toLowerCase() || '';

        const agentRelevance = agentKeywords.filter(keyword => 
          conversationText.includes(keyword.toLowerCase())
        ).length;

        const questionRelevance = questionKeywords.filter(keyword => 
          conversationText.includes(keyword.toLowerCase())
        ).length;

        const relevanceScore = agentRelevance + (questionRelevance * 2);

        if (relevanceScore > 0 && chatData.messages?.length > 2) {
          scoredConversations++;
          const summary = this.createConversationSummary(stepChatId, chatData.messages, agentRole);
          relevantConversations.push({
            summary,
            relevanceScore,
            timestamp: chatData.lastUpdated,
            stepId: stepChatId
          });
        }
      }

      console.log(`   └─ Processed: ${processedConversations}, Skipped current: ${skippedCurrent}, Scored: ${scoredConversations}`);

      // Sort and filter
      const sortedConversations = relevantConversations
        .sort((a, b) => {
          if (b.relevanceScore !== a.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
          }
          const timeA = a.timestamp?.toDate?.() || new Date(0);
          const timeB = b.timestamp?.toDate?.() || new Date(0);
          return timeB.getTime() - timeA.getTime();
        })
        .slice(0, 3);

      if (sortedConversations.length > 0) {
        console.log(`   ✅ Selected ${sortedConversations.length} most relevant conversations:`);
        sortedConversations.forEach((conv, i) => {
          console.log(`      ${i + 1}. ${conv.stepId} (score: ${conv.relevanceScore})`);
        });
      }

      return sortedConversations.map(conv => conv.summary);
      
    } catch (error) {
      console.error(`   ❌ Error loading relevant conversations:`, error);
      return [];
    }
  }

  // Enhanced insight saving with logging
  async saveAgentInsights(agentRole: string, userQuestion: string, agentResponse: string): Promise<void> {
    try {
      console.log(`💡 [INSIGHTS-SAVE] Saving insights for ${agentRole}`);
      console.log(`   └─ Question length: ${userQuestion.length} chars`);
      console.log(`   └─ Response length: ${agentResponse.length} chars`);
      
      const insightsRef = db.collection('agent_insights')
        .doc(this.userId)
        .collection('agents')
        .doc(agentRole.replace(/\s+/g, '_').toLowerCase());
      
      const newInsight = `Q: ${userQuestion.substring(0, 100)} | A: ${agentResponse.substring(0, 150)}`;
      
      // Get existing insights
      const existingDoc = await insightsRef.get();
      let allInsights = newInsight;
      let isNewAgent = !existingDoc.exists;
      
      if (existingDoc.exists) {
        const existingInsights = existingDoc.data()?.insights || '';
        const truncatedExisting = existingInsights.length > 800 
          ? existingInsights.substring(existingInsights.length - 800)
          : existingInsights;
        
        allInsights = `${truncatedExisting}\n${newInsight}`;
        console.log(`   └─ Existing insights: ${existingInsights.length} chars, keeping: ${truncatedExisting.length} chars`);
      }
      
      await insightsRef.set({
        insights: allInsights,
        lastUpdated: new Date(),
        userId: this.userId,
        agentRole: agentRole
      }, { merge: true });
      
      console.log(`   ✅ Insights saved (${isNewAgent ? 'new agent' : 'updated'})`);
      console.log(`   └─ Total insights now: ${allInsights.length} chars`);
      
    } catch (error) {
      console.error(`   ❌ Error saving agent insights for ${agentRole}:`, error);
    }
  }

  // Cache invalidation with logging
  async invalidateCache(): Promise<void> {
    const cacheSize = this.contextCache.size;
    this.contextCache.clear();
    console.log(`🗑️ [CACHE-CLEAR] Memory cache invalidated`);
    console.log(`   └─ Cleared ${cacheSize} cached entries`);
    console.log(`   └─ Memory ID: ${this.memoryId}`);
  }

  // Progress loading with detailed logging
  private async loadUserProgress(): Promise<string | null> {
    try {
      // Read from the correct Firestore structure: user_progress/{userId}/tasks
      const userProgressTasksRef = db.collection('user_progress').doc(this.userId).collection('tasks');
      const tasksSnapshot = await userProgressTasksRef.get();
      
      if (tasksSnapshot.empty) {
        console.log(`   ⚠️  No progress tasks found for user ${this.userId} in user_progress/{userId}/tasks`);
        return null;
      }

      const progressParts: string[] = [];
      let taskCount = 0;
      let subtaskCount = 0;
      let stepCount = 0;
      
      console.log(`   📋 Found ${tasksSnapshot.docs.length} task documents in progress collection`);
      
      tasksSnapshot.docs.forEach(taskDoc => {
        const taskKey = taskDoc.id;
        const taskData = taskDoc.data();
        
        console.log(`📋 Processing task: ${taskKey} - Completed: ${taskData?.isCompleted}`);
        
        // Only process actually completed tasks
        if (!taskData || !taskData.isCompleted) {
          console.log(`   └─ Task ${taskKey} not completed, skipping`);
          return;
        }
        
        if (taskData.isCompleted) {
          taskCount++;
          progressParts.push(`✅ Completed Task: ${taskData.name || taskKey}`);
          
          if (taskData.subtasks) {
            Object.entries(taskData.subtasks).forEach(([subtaskKey, subtaskData]: [string, any]) => {
              if (subtaskData.isCompleted) {
                subtaskCount++;
                progressParts.push(`  ✅ Completed Subtask: ${subtaskData.name || subtaskKey}`);
                
                if (subtaskData.steps) {
                  Object.entries(subtaskData.steps).forEach(([stepKey, stepData]: [string, any]) => {
                    if (stepData.isCompleted && stepData.studentResponse) {
                      stepCount++;
                      const response = stepData.studentResponse.substring(0, 150);
                      progressParts.push(`    ✅ Step "${stepData.step || stepKey}": ${response}...`);
                    }
                  });
                }
              }
            });
          }
        }
      });

      console.log(`   └─ Progress stats: ${taskCount} tasks, ${subtaskCount} subtasks, ${stepCount} steps completed`);
      return progressParts.length > 0 ? progressParts.join('\n') : null;
      
    } catch (error) {
      console.error(`   ❌ Error loading user progress:`, error);
      return null;
    }
  }

  // Add performance monitoring to other methods...
  private async loadAgentInsights(agentRole: string): Promise<string | null> {
    try {
      const insightsRef = db.collection('agent_insights')
        .doc(this.userId)
        .collection('agents')
        .doc(agentRole.replace(/\s+/g, '_').toLowerCase());
      
      const insightsDoc = await insightsRef.get();
      
      if (insightsDoc.exists) {
        const data = insightsDoc.data();
        const insights = data?.insights || null;
        if (insights) {
          console.log(`   └─ Found ${insights.length} chars of insights for ${agentRole}`);
        }
        return insights;
      }
      
      return null;
    } catch (error) {
      console.error(`   ❌ Error loading agent insights for ${agentRole}:`, error);
      return null;
    }
  }

  private async loadCrossAgentInsights(currentAgentRole: string): Promise<string[]> {
    try {
      const insightsRef = db.collection('agent_insights')
        .doc(this.userId)
        .collection('agents');
      
      const agentsSnapshot = await insightsRef.get();
      const crossInsights: string[] = [];

      agentsSnapshot.docs.forEach(doc => {
        const agentRole = doc.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        if (agentRole.toLowerCase() === currentAgentRole.toLowerCase()) {
          return;
        }

        const data = doc.data();
        if (data?.insights && data.insights.length > 50) {
          const summary = data.insights.substring(0, 120);
          crossInsights.push(`${agentRole}: ${summary}...`);
        }
      });

      if (crossInsights.length > 0) {
        console.log(`   └─ Found cross-agent insights from ${crossInsights.length} other agents`);
      }

      return crossInsights.slice(0, 2);
      
    } catch (error) {
      console.error(`   ❌ Error loading cross-agent insights:`, error);
      return [];
    }
  }

  // Method to get detailed conversation history from specific previous steps
  async getDetailedConversationHistory(
    targetTaskIds: string[] = [],
    targetStepIds: string[] = [],
    maxMessages: number = 20
  ): Promise<string> {
    try {
      console.log('🔍 Loading detailed conversation history for user:', this.userId);
      
      const conversationParts: string[] = [];
      
      // Get all step chats for this user
      const stepChatsRef = db.collection('chat_messages')
        .doc(this.userId)
        .collection('step_chats');
      
      const stepChatsSnapshot = await stepChatsRef.get();
      
      if (stepChatsSnapshot.empty) {
        return "No previous conversations found.";
      }
      
      // Filter chats based on criteria
      const relevantChats: Array<{id: string, messages: any[], lastUpdated: any}> = [];
      
      stepChatsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const stepChatId = doc.id; // Format: taskId_subtaskId_stepId
        
        // Check if this chat matches our criteria
        const shouldInclude = 
          targetTaskIds.length === 0 || 
          targetTaskIds.some(taskId => stepChatId.startsWith(taskId + '_')) ||
          targetStepIds.some(stepId => stepChatId.endsWith('_' + stepId));
        
        if (shouldInclude && data.messages && data.messages.length > 0) {
          relevantChats.push({
            id: stepChatId,
            messages: data.messages,
            lastUpdated: data.lastUpdated
          });
        }
      });
      
      // Sort by last updated and get detailed conversations
      relevantChats
        .sort((a, b) => {
          const timeA = a.lastUpdated?.toDate?.() || new Date(0);
          const timeB = b.lastUpdated?.toDate?.() || new Date(0);
          return timeB.getTime() - timeA.getTime();
        })
        .forEach(chat => {
          const stepDetails = this.parseStepIdDetails(chat.id);
          conversationParts.push(`\n📞 CONVERSATION: ${stepDetails}`);
          
          // Get meaningful messages from this conversation
          const meaningfulMessages = chat.messages
            .filter(msg => msg.content && msg.content.length > 10)
            .slice(-maxMessages); // Get recent messages
          
          meaningfulMessages.forEach(msg => {
            const role = msg.role === 'user' ? '👤 Student' : `🤖 ${msg.agentRole || 'Assistant'}`;
            const content = msg.content.length > 300 
              ? msg.content.substring(0, 300) + '...'
              : msg.content;
            conversationParts.push(`${role}: ${content}`);
          });
        });
      
      return conversationParts.length > 0 
        ? conversationParts.join('\n')
        : "No relevant detailed conversations found.";
        
    } catch (error) {
      console.error('❌ Error loading detailed conversation history:', error);
      return "Error loading detailed conversation history.";
    }
  }

  // Existing helper methods remain the same but with added logging where appropriate...
  private extractKeywords(text: string): string[] {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'what', 'how', 'why', 'when', 'where', 'can', 'could', 'should',
      'would', 'will', 'do', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these', 'those'
    ];
    
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !commonWords.includes(word))
      .slice(0, 8);
  }

  private createConversationSummary(stepId: string, messages: any[], agentRole: string): string {
    const stepDetails = this.parseStepIdDetails(stepId);
    
    const meaningfulMessages = messages.filter(msg => 
      msg.content && msg.content.length > 20
    );

    if (meaningfulMessages.length === 0) {
      return `${stepDetails}: Brief conversation with no substantial content.`;
    }

    const userMessages = meaningfulMessages.filter(msg => msg.role === 'user').slice(-2);
    const assistantMessages = meaningfulMessages.filter(msg => msg.role === 'assistant').slice(-2);
    
    const userTopics = userMessages
      .map(msg => msg.content.substring(0, 100))
      .join(' | ');

    const agentGuidance = assistantMessages.length > 0 
      ? assistantMessages[assistantMessages.length - 1].content.substring(0, 120)
      : 'No significant guidance provided';

    return `${stepDetails}: Student asked about: ${userTopics}. Key guidance given: ${agentGuidance}...`;
  }

  private filterContextByQuestion(context: string, userQuestion: string): string {
    return context;
  }

  private parseStepIdDetails(stepChatId: string): string {
    try {
      const parts = stepChatId.split('_');
      if (parts.length >= 3) {
        return `Task: ${parts[0]}, Subtask: ${parts[1]}, Step: ${parts.slice(2).join('_')}`;
      }
      return stepChatId;
    } catch {
      return stepChatId;
    }
  }

  async predictNewSummary(messages: BaseMessage[], existingSummary: string): Promise<string> {
    try {
      console.log(`📝 [SUMMARY-GEN] Generating enhanced summary`);
      console.log(`   └─ Messages: ${messages.length}, Existing summary: ${existingSummary.length} chars`);
      
      const basicProgress = await this.loadUserProgress();
      
      const enhancedPrompt = `You are summarizing a conversation in a requirements engineering learning system.

STUDENT'S CURRENT PROGRESS:
${basicProgress || 'No previous progress available'}

PREVIOUS SUMMARY: ${existingSummary}

RECENT MESSAGES:
${messages.map(msg => `${msg._getType()}: ${msg.content}`).join('\n')}

Create a concise summary that:
1. Maintains important conversation details
2. References relevant completed work when applicable  
3. Highlights key learning progress and decisions
4. Keeps context for future conversations

Focus on what's most relevant for continuing this student's learning journey.`;

      const response = await this.llm.invoke([new HumanMessage(enhancedPrompt)]);
      
      let summary = '';
      if (typeof response === 'object' && response !== null && 'content' in response) {
        summary = response.content.toString().trim();
      } else {
        summary = typeof response === 'string' ? response.trim() : String(response).trim();
      }

      console.log(`   ✅ Summary generated: ${summary.length} chars`);
      return summary || existingSummary;
      
    } catch (error) {
      console.error(`   ❌ Error generating enhanced summary:`, error);
      return super.predictNewSummary(messages, existingSummary);
    }
  }
}