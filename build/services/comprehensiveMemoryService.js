import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { db } from '../config/adminConfig.js';
import dotenv from 'dotenv';
dotenv.config();
export class ComprehensiveMemoryService {
    embeddings;
    supabaseClient;
    userDataCache = new Map();
    questionModel;
    textSplitter;
    maxTokenLimit = 2000; // Using existing token limit
    constructor(questionModel) {
        this.embeddings = new OpenAIEmbeddings({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
        this.questionModel = questionModel;
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500, // Smaller chunks for better precision
            chunkOverlap: 50,
        });
    }
    // Main method: Get comprehensive context for any agent
    async getComprehensiveContext(userId, agentRole, userQuestion, stepId) {
        console.log(`🧠 [COMPREHENSIVE-MEMORY] Loading context for ${agentRole}`);
        console.log(`   └─ User: ${userId}, Step: ${stepId}`);
        console.log(`   └─ Question: ${userQuestion.substring(0, 100)}...`);
        try {
            // 1. Check if we need to refresh due to step navigation
            await this.checkStepNavigation(userId, stepId);
            // 2. Ensure user data is embedded and cached
            await this.ensureUserDataEmbedded(userId);
            // 2. Get relevant context using RAG
            const relevantMemories = await this.ragSearch(userId, userQuestion);
            // 3. Get project context (existing functionality)
            const projectContext = await this.getProjectContext(userQuestion);
            // 4. Format comprehensive context
            const context = this.formatComprehensiveContext(relevantMemories, projectContext, agentRole);
            console.log(`✅ [COMPREHENSIVE-MEMORY] Context ready: ${context.length} characters`);
            return context;
        }
        catch (error) {
            console.error(`❌ [COMPREHENSIVE-MEMORY] Error loading context:`, error);
            // Fallback to basic project context if comprehensive memory fails
            try {
                console.log(`⚙️ [FALLBACK] Using basic project context only`);
                const projectContext = await this.getProjectContext(userQuestion);
                return this.formatBasicFallbackContext(projectContext);
            }
            catch (fallbackError) {
                console.error(`❌ [FALLBACK-ERROR] Even basic context failed:`, fallbackError);
                return "Error loading context - proceeding with limited information. Please ensure database is properly set up.";
            }
        }
    }
    // Ensure all user data is embedded in Supabase
    async ensureUserDataEmbedded(userId) {
        console.log(`📊 [EMBEDDING-CHECK] Checking embeddings for user ${userId}`);
        try {
            // Check if we need to refresh embeddings
            const shouldRefresh = await this.shouldRefreshEmbeddings(userId);
            if (shouldRefresh) {
                console.log(`🔄 [EMBEDDING-REFRESH] Refreshing embeddings for user ${userId}`);
                await this.refreshUserEmbeddings(userId);
            }
            else {
                console.log(`✅ [EMBEDDING-CACHE] Embeddings up to date for user ${userId}`);
            }
        }
        catch (error) {
            console.error(`❌ [EMBEDDING-ERROR] Error checking embeddings:`, error);
            if (error instanceof Error && error.message && error.message.includes('404')) {
                console.log(`⚠️ [EMBEDDING-ERROR] user_memory_embeddings table not found. Please run: npm run setup-user-memory`);
                console.log(`   Or manually execute the SQL from setup-user-memory-embeddings.sql in Supabase`);
            }
        }
    }
    // Check if embeddings need refresh (when stepId changes)
    async shouldRefreshEmbeddings(userId) {
        try {
            const { data: lastEmbedding } = await this.supabaseClient
                .from('user_memory_embeddings')
                .select('updated_at')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(1);
            if (!lastEmbedding || lastEmbedding.length === 0) {
                console.log(`   └─ No embeddings found for user ${userId} - needs refresh`);
                return true; // No embeddings exist
            }
            // Check if data has changed since last embedding
            const lastEmbeddingTime = new Date(lastEmbedding[0].updated_at);
            const dataChanged = await this.hasDataChangedSince(userId, lastEmbeddingTime);
            if (dataChanged) {
                console.log(`   └─ Data has changed since last embedding - needs refresh`);
            }
            else {
                console.log(`   └─ No data changes detected - embeddings up to date`);
            }
            return dataChanged;
        }
        catch (error) {
            console.error('Error checking if embeddings need refresh:', error);
            return true; // Default to refresh on error
        }
    }
    // Check if user data has changed since last embedding
    async hasDataChangedSince(userId, since) {
        try {
            console.log(`   └─ Checking for data changes since ${since.toISOString()}`);
            // Check if new conversations exist
            const conversationsRef = db.collection('chat_messages').doc(userId).collection('step_chats');
            const recentConversations = await conversationsRef
                .where('lastUpdated', '>', since)
                .limit(1)
                .get();
            if (!recentConversations.empty) {
                console.log(`   └─ Found new conversations since last embedding`);
                return true;
            }
            // Check if progress has changed
            const progressRef = db.collection('user_progress').doc(userId).collection('tasks');
            const recentProgress = await progressRef
                .where('lastUpdated', '>', since)
                .limit(1)
                .get();
            if (!recentProgress.empty) {
                console.log(`   └─ Found new progress since last embedding`);
                return true;
            }
            // Check if agent insights have changed
            const insightsRef = db.collection('agent_insights').doc(userId).collection('agents');
            const recentInsights = await insightsRef
                .where('lastUpdated', '>', since)
                .limit(1)
                .get();
            if (!recentInsights.empty) {
                console.log(`   └─ Found new insights since last embedding`);
                return true;
            }
            console.log(`   └─ No data changes found`);
            return false;
        }
        catch (error) {
            console.error('Error checking data changes:', error);
            return true;
        }
    }
    // Refresh all embeddings for a user
    async refreshUserEmbeddings(userId) {
        console.log(`🔄 [EMBEDDING-REFRESH] Starting refresh for user ${userId}`);
        try {
            // 1. Clear existing embeddings
            await this.clearUserEmbeddings(userId);
            // 2. Load all user data
            const userData = await this.loadAllUserData(userId);
            // 3. Create embeddings for all data
            await this.createUserEmbeddings(userId, userData);
            console.log(`✅ [EMBEDDING-REFRESH] Completed refresh for user ${userId}`);
        }
        catch (error) {
            console.error(`❌ [EMBEDDING-REFRESH] Error refreshing embeddings:`, error);
        }
    }
    // Clear existing embeddings for a user
    async clearUserEmbeddings(userId) {
        await this.supabaseClient
            .from('user_memory_embeddings')
            .delete()
            .eq('user_id', userId);
    }
    // Load all user data (no filtering)
    async loadAllUserData(userId) {
        console.log(`📊 [DATA-LOAD] Loading all data for user ${userId}`);
        const userData = {
            userProgress: [],
            allConversations: [],
            agentInsights: [],
            lastUpdated: new Date()
        };
        try {
            // Load all user progress
            const progressRef = db.collection('user_progress').doc(userId).collection('tasks');
            const progressSnapshot = await progressRef.get();
            progressSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.subtasks) {
                    Object.entries(data.subtasks).forEach(([subtaskKey, subtaskData]) => {
                        if (subtaskData.steps) {
                            Object.entries(subtaskData.steps).forEach(([stepKey, stepData]) => {
                                if (stepData.studentResponse) {
                                    userData.userProgress.push({
                                        taskId: doc.id,
                                        subtaskId: subtaskKey,
                                        stepId: stepKey,
                                        response: stepData.studentResponse,
                                        step: stepData.step,
                                        completed: stepData.isCompleted,
                                        timestamp: stepData.completedAt || new Date()
                                    });
                                }
                            });
                        }
                    });
                }
            });
            // Load all conversations
            const conversationsRef = db.collection('chat_messages').doc(userId).collection('step_chats');
            const conversationsSnapshot = await conversationsRef.get();
            conversationsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.messages) {
                    data.messages.forEach((message) => {
                        userData.allConversations.push({
                            stepChatId: doc.id,
                            role: message.role,
                            content: message.content,
                            agentRole: message.agentRole,
                            timestamp: message.timestamp || new Date(),
                            metadata: {
                                stepId: doc.id,
                                messageId: message.id
                            }
                        });
                    });
                }
            });
            // Load all agent insights
            const insightsRef = db.collection('agent_insights').doc(userId).collection('agents');
            const insightsSnapshot = await insightsRef.get();
            insightsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.insights) {
                    userData.agentInsights.push({
                        agentRole: data.agentRole,
                        insights: data.insights,
                        timestamp: data.lastUpdated || new Date()
                    });
                }
            });
            console.log(`✅ [DATA-LOAD] Loaded ${userData.userProgress.length} progress items, ${userData.allConversations.length} conversations, ${userData.agentInsights.length} insights`);
            return userData;
        }
        catch (error) {
            console.error(`❌ [DATA-LOAD] Error loading user data:`, error);
            return userData;
        }
    }
    // Create embeddings for all user data
    async createUserEmbeddings(userId, userData) {
        console.log(`🔮 [EMBEDDING-CREATE] Creating embeddings for user ${userId}`);
        const memoryContents = [];
        // Process user progress
        userData.userProgress.forEach(progress => {
            memoryContents.push({
                content: `Step: ${progress.step}. Student response: ${progress.response}`,
                contentType: 'progress',
                stepId: `${progress.taskId}_${progress.subtaskId}_${progress.stepId}`,
                metadata: {
                    taskId: progress.taskId,
                    subtaskId: progress.subtaskId,
                    stepId: progress.stepId,
                    completed: progress.completed,
                    timestamp: progress.timestamp
                }
            });
        });
        // Process conversations
        userData.allConversations.forEach(conversation => {
            memoryContents.push({
                content: `${conversation.role === 'user' ? 'Student' : conversation.agentRole || 'Assistant'}: ${conversation.content}`,
                contentType: 'conversation',
                agentRole: conversation.agentRole,
                stepId: conversation.stepChatId,
                metadata: {
                    role: conversation.role,
                    timestamp: conversation.timestamp,
                    messageId: conversation.metadata?.messageId
                }
            });
        });
        // Process agent insights
        userData.agentInsights.forEach(insight => {
            memoryContents.push({
                content: `Agent ${insight.agentRole} insights: ${insight.insights}`,
                contentType: 'insight',
                agentRole: insight.agentRole,
                metadata: {
                    timestamp: insight.timestamp
                }
            });
        });
        // Create embeddings in batches
        const batchSize = 100;
        for (let i = 0; i < memoryContents.length; i += batchSize) {
            const batch = memoryContents.slice(i, i + batchSize);
            await this.createEmbeddingBatch(userId, batch);
        }
        console.log(`✅ [EMBEDDING-CREATE] Created ${memoryContents.length} embeddings for user ${userId}`);
    }
    // Create embeddings for a batch of content
    async createEmbeddingBatch(userId, contents) {
        const embeddings = [];
        for (const content of contents) {
            // Split content into chunks if needed
            const chunks = await this.textSplitter.splitText(content.content);
            for (const chunk of chunks) {
                // Generate embedding for this chunk
                const embedding = await this.embeddings.embedQuery(chunk);
                embeddings.push({
                    content: chunk,
                    embedding: embedding,
                    user_id: userId,
                    content_type: content.contentType,
                    agent_role: content.agentRole,
                    step_id: content.stepId,
                    metadata: content.metadata || {}
                });
            }
        }
        // Insert directly into Supabase table
        const { error } = await this.supabaseClient
            .from('user_memory_embeddings')
            .insert(embeddings);
        if (error) {
            throw new Error(`Error inserting embeddings: ${error.message}`);
        }
        console.log(`   ✅ Inserted ${embeddings.length} embeddings for user ${userId}`);
    }
    // RAG search for relevant memories
    async ragSearch(userId, query) {
        console.log(`🔍 [RAG-SEARCH] Searching user memories for: ${query.substring(0, 100)}...`);
        try {
            const queryEmbedding = await this.embeddings.embedQuery(query);
            const { data: memories } = await this.supabaseClient
                .rpc('match_user_memory_embeddings', {
                query_embedding: queryEmbedding,
                target_user_id: userId,
                match_threshold: 0.3, // Lower threshold for broader recall
                match_count: 20 // Get more results, will filter later
            });
            if (!memories || memories.length === 0) {
                console.log(`⚠️ [RAG-SEARCH] No relevant memories found for user ${userId}`);
                return [];
            }
            console.log(`✅ [RAG-SEARCH] Found ${memories.length} relevant memories`);
            // Log the actual content being retrieved
            console.log(`\n📄 [RAG-CONTENT] Retrieved memories for query: "${query.substring(0, 80)}..."`);
            memories.forEach((memory, index) => {
                console.log(`\n   ${index + 1}. [${memory.content_type.toUpperCase()}] (Similarity: ${memory.similarity.toFixed(3)})`);
                console.log(`      Step: ${memory.step_id || 'N/A'}`);
                console.log(`      Agent: ${memory.agent_role || 'N/A'}`);
                console.log(`      Content: ${memory.content.substring(0, 200)}${memory.content.length > 200 ? '...' : ''}`);
            });
            console.log(`\n📄 [RAG-CONTENT] End of retrieved content\n`);
            return memories.map((memory) => ({
                id: memory.id,
                content: memory.content,
                contentType: memory.content_type,
                agentRole: memory.agent_role,
                stepId: memory.step_id,
                similarity: memory.similarity,
                metadata: memory.metadata
            }));
        }
        catch (error) {
            console.error(`❌ [RAG-SEARCH] Error searching memories:`, error);
            return [];
        }
    }
    // Get project context using existing retriever
    async getProjectContext(query) {
        try {
            const { default: retriever } = await import('../utils/retriever.js');
            const relevantDocs = await retriever._getRelevantDocuments(query);
            return relevantDocs.length > 0
                ? relevantDocs.map(doc => doc.pageContent).join('\n\n')
                : "No relevant project context found.";
        }
        catch (error) {
            console.error('Error getting project context:', error);
            return "Error loading project context.";
        }
    }
    // Format comprehensive context for agent
    formatComprehensiveContext(memories, projectContext, agentRole) {
        const contextParts = [];
        // Add project context
        contextParts.push("📋 PROJECT CONTEXT:");
        contextParts.push(projectContext);
        contextParts.push("--- END PROJECT CONTEXT ---\n");
        // Group memories by type
        const progressMemories = memories.filter(m => m.contentType === 'progress');
        const conversationMemories = memories.filter(m => m.contentType === 'conversation');
        const insightMemories = memories.filter(m => m.contentType === 'insight');
        // Add user progress
        if (progressMemories.length > 0) {
            contextParts.push("📊 STUDENT'S PREVIOUS WORK:");
            progressMemories.slice(0, 10).forEach(memory => {
                contextParts.push(`• ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`);
            });
            contextParts.push("--- END PREVIOUS WORK ---\n");
        }
        // Add relevant conversations
        if (conversationMemories.length > 0) {
            contextParts.push("💬 RELEVANT PAST CONVERSATIONS:");
            conversationMemories.slice(0, 15).forEach(memory => {
                contextParts.push(`• ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`);
            });
            contextParts.push("--- END PAST CONVERSATIONS ---\n");
        }
        // Add agent insights
        if (insightMemories.length > 0) {
            contextParts.push("🧠 RELEVANT AGENT INSIGHTS:");
            insightMemories.slice(0, 5).forEach(memory => {
                contextParts.push(`• ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`);
            });
            contextParts.push("--- END AGENT INSIGHTS ---\n");
        }
        const fullContext = contextParts.join('\n');
        // Log the final formatted context
        console.log(`\n📝 [FORMATTED-CONTEXT] Final context for ${agentRole}:`);
        console.log(`   └─ Length: ${fullContext.length} characters`);
        console.log(`   └─ Progress items: ${progressMemories.length}`);
        console.log(`   └─ Conversation items: ${conversationMemories.length}`);
        console.log(`   └─ Insight items: ${insightMemories.length}`);
        console.log(`\n--- FORMATTED CONTEXT START ---`);
        console.log(fullContext);
        console.log(`--- FORMATTED CONTEXT END ---\n`);
        // Ensure we don't exceed token limit
        if (fullContext.length > this.maxTokenLimit * 4) { // Rough estimate: 4 chars per token
            const truncated = this.truncateContext(fullContext, this.maxTokenLimit * 4);
            console.log(`⚠️ [CONTEXT-TRUNCATED] Context was truncated from ${fullContext.length} to ${truncated.length} characters`);
            return truncated;
        }
        return fullContext;
    }
    // Truncate context if too long
    truncateContext(context, maxLength) {
        if (context.length <= maxLength) {
            return context;
        }
        return context.substring(0, maxLength - 100) + "\n\n... (Context truncated due to length) ...";
    }
    // Fallback context format when comprehensive memory fails
    formatBasicFallbackContext(projectContext) {
        return `📋 PROJECT CONTEXT:
${projectContext}
--- END PROJECT CONTEXT ---

⚠️ NOTE: Comprehensive memory system unavailable. Using basic project context only.
To enable full memory features, please set up the user_memory_embeddings table in Supabase.`;
    }
    // Check if user has navigated to a different step
    async checkStepNavigation(userId, currentStepId) {
        try {
            // Get the last step this user was on from embeddings
            const { data: lastStepData } = await this.supabaseClient
                .from('user_memory_embeddings')
                .select('step_id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);
            if (lastStepData && lastStepData.length > 0) {
                const lastStepId = lastStepData[0].step_id;
                if (lastStepId !== currentStepId) {
                    console.log(`🔄 [STEP-NAVIGATION] User ${userId} navigated from ${lastStepId} to ${currentStepId}`);
                    console.log(`   └─ Triggering embedding refresh for navigation`);
                    // Force refresh when user navigates to different step
                    await this.forceRefreshEmbeddings(userId);
                }
            }
        }
        catch (error) {
            console.error(`❌ [STEP-NAVIGATION] Error checking step navigation:`, error);
        }
    }
    // Force refresh embeddings (used for step navigation)
    async forceRefreshEmbeddings(userId) {
        console.log(`🔄 [FORCE-REFRESH] Forcing embedding refresh for user ${userId}`);
        // Clear cache to force refresh
        this.userDataCache.delete(userId);
        // Trigger immediate refresh
        await this.refreshUserEmbeddings(userId);
    }
    // Method to be called when user moves to new step
    async onStepChange(userId, newStepId) {
        console.log(`🔄 [STEP-CHANGE] User ${userId} completed step ${newStepId}`);
        // Clear cache to force refresh
        this.userDataCache.delete(userId);
        // Refresh embeddings will happen automatically on next request
        console.log(`✅ [STEP-CHANGE] Cache cleared for user ${userId}`);
    }
    // Method to save new user interaction
    async saveInteraction(userId, agentRole, userMessage, agentResponse, stepId) {
        console.log(`💾 [SAVE-INTERACTION] Saving interaction for user ${userId}`);
        try {
            // Save to Firestore (existing functionality)
            // This will be picked up in the next embedding refresh
            // Immediately add to embeddings for real-time updates
            const interactions = [
                {
                    content: `Student: ${userMessage}`,
                    contentType: 'conversation',
                    agentRole: agentRole,
                    stepId: stepId,
                    metadata: {
                        role: 'user',
                        timestamp: new Date()
                    }
                },
                {
                    content: `${agentRole}: ${agentResponse}`,
                    contentType: 'conversation',
                    agentRole: agentRole,
                    stepId: stepId,
                    metadata: {
                        role: 'assistant',
                        timestamp: new Date()
                    }
                }
            ];
            await this.createEmbeddingBatch(userId, interactions);
            console.log(`✅ [SAVE-INTERACTION] Interaction saved and embedded for user ${userId}`);
        }
        catch (error) {
            console.error(`❌ [SAVE-INTERACTION] Error saving interaction:`, error);
        }
    }
}
