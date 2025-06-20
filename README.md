# M3Req - Requirements Engineering Learning System

[An AI-powered learning platform for requirements engineering education, featuring intelligent agent routing, real-time streaming conversations, and comprehensive stakeholder analysis workflows.]

## 🎯 Project Overview

This system provides an interactive learning environment where students can engage with AI-powered team members (Product Owner, Business Analyst, Technical Lead, UX Designer, QA Lead) to learn requirements engineering through practical scenarios. The platform uses LangGraph for intelligent agent orchestration and supports real-time streaming conversations.

### Key Features

- **Multi-Agent System**: Five specialized AI agents representing different roles in a requirements engineering team
- **Real-time Streaming**: Server-sent events (SSE) for live conversation streaming
- **Intelligent Routing**: Automatic agent selection based on conversation context and learning objectives
- **Structured Learning Path**: Progressive tasks from stakeholder identification to requirements elicitation
- **Conversation Memory**: Persistent conversation context and summaries across sessions
- **Validation System**: Automated assessment of student submissions with detailed feedback

## 🏗️ Architecture

### Tech Stack

- **Backend**: Node.js + Express.js + TypeScript
- **AI Framework**: LangGraph (LangChain ecosystem)
- **LLM Providers**: 
  - Groq (primary - Gemma2-9B-IT)
  - OpenAI (GPT-4o)
  - Google Generative AI (Gemini 2.0 Flash)
  - HuggingFace (DialoGPT-medium for testing)
- **Database**: PostgreSQL with LangGraph checkpointing support
- **Memory**: In-memory conversation summaries and agent state management

### Project Structure

```
src/
├── controller/           # Request handlers
│   ├── chatController.ts      # Streaming chat endpoints
│   ├── taskController.ts      # Learning task management
│   └── validationController.ts # Submission validation
├── middleware/          # Express middleware
│   ├── errorHandler.ts        # Global error handling
│   └── requestLogger.ts       # Request logging
├── routes/             # API route definitions
│   ├── chatRoutes.ts         # Chat streaming routes
│   ├── taskRoutes.ts         # Task and team member routes
│   ├── validationRoutes.ts   # Validation endpoints
│   └── contextRoutes.ts      # Project context management
├── services/           # Business logic
│   └── agentService.ts       # Core agent orchestration
├── types/              # TypeScript definitions
│   └── index.ts              # Interface definitions
├── utils/              # Utility functions
│   └── chatHistoryUtil.ts    # Chat history management
└── server.ts           # Application entry point
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- API keys for your chosen LLM provider(s)

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd langgraph-agent
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/dbname
   
   # LLM API Keys (choose your provider)
   GROQ_API_KEY=your_groq_api_key
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_API_KEY=your_google_api_key
   HUGGINGFACE_API_KEY=your_hf_api_key
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

3. **Build and Run**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production build
   npm run build
   npm start
   
   # Watch TypeScript compilation
   npm run watch
   ```

The server will start on `http://localhost:3000` (or your configured PORT).

## 📡 API Endpoints

### Chat Streaming
- **POST** `/api/chat/stream` - Start streaming chat with agents
- **GET** `/api/chat/history/:sessionId/:taskId` - Retrieve chat history

### Task Management  
- **GET** `/api/tasks` - Get available learning tasks
- **GET** `/api/tasks/team-members` - Get team member information

### Validation
- **POST** `/api/validation/validate` - Validate student submissions

### Context Management
- **POST** `/api/context/update` - Update project context

### Request/Response Examples

#### Starting a Chat Stream
```javascript
// POST /api/chat/stream
{
  "message": "I need help identifying stakeholders for our dining system",
  "taskId": "stakeholder_identification_analysis", 
  "subtask": {
    "id": "stakeholder_identification",
    "name": "Stakeholder Identification",
    // ... subtask details
  },
  "sessionId": "user_session_123",
  "agentRole": "Business Analyst", // optional - will auto-route if not provided
  "projectContext": {
    "title": "Campus Smart Dining System",
    "description": "A comprehensive dining management system",
    "domain": "Education Technology",
    // ... project details
  }
}
```

#### Server-Sent Events Response
```
data: {"type": "agent_selected", "agent": "Business Analyst"}

data: {"type": "response_start", "agent": "Business Analyst"}

data: {"type": "content", "content": "Hi there! I'm Michael, and I'd be happy to help you with stakeholder identification...", "agent": "Business Analyst"}

data: {"type": "response_end"}
```

#### Validation Request
```javascript
// POST /api/validation/validate
{
  "submission": "Primary stakeholders include students, dining staff, administrators...",
  "taskId": "stakeholder_identification_analysis",
  "subtask": { /* subtask object */ },
  "sessionId": "user_session_123", 
  "projectContext": { /* project context */ }
}
```

## 🤖 Agent System

### Available Agents

1. **Sarah Chen - Product Owner**
   - Focus: Business strategy, user value, stakeholder alignment
   - Expertise: Business analysis, UX, product strategy
   - Style: Direct, results-oriented, user-centric

2. **Michael Rodriguez - Business Analyst** 
   - Focus: Requirements analysis, process modeling, documentation
   - Expertise: BABOK techniques, stakeholder management, gap analysis
   - Style: Methodical, thorough, collaborative

3. **Emma Thompson - Technical Lead**
   - Focus: System architecture, technical constraints, feasibility
   - Expertise: Architecture, risk assessment, performance requirements  
   - Style: Pragmatic, solution-oriented, quality-focused

4. **David Park - UX Designer**
   - Focus: User research, interaction design, usability
   - Expertise: Design thinking, user journey mapping, accessibility
   - Style: Creative, visual, user-empathetic

5. **Lisa Wang - QA Lead**
   - Focus: Testing strategy, quality metrics, requirements validation
   - Expertise: Test design, quality assurance, defect management
   - Style: Detail-oriented, risk-aware, prevention-focused

### Agent Routing Logic

The system automatically routes conversations to the most appropriate agent based on:
- Message content analysis
- Current learning task phase
- Required expertise area
- Previous conversation context

Manual agent selection is also supported via the `agentRole` parameter.

## 📚 Learning Tasks Structure

### Current Learning Modules

1. **Stakeholder Identification & Analysis**
   - Stakeholder Identification
   - Stakeholder Analysis & Prioritization  
   - User Persona Development

2. **Requirements Elicitation**
   - Interview Planning & Execution
   - Workshop Facilitation

Each task includes:
- **Subtasks**: Granular learning objectives
- **Expected Outcomes**: Clear deliverable expectations
- **Validation Criteria**: Assessment rubrics
- **Difficulty Levels**: Beginner to Advanced progression
- **Time Estimates**: Planning guidance

### Adding New Tasks

To add new learning tasks, extend the `getLearningTasks()` method in `agentService.ts`:

```typescript
{
  id: "new_task_id",
  name: "Task Name", 
  description: "Detailed task description",
  phase: "Requirements Discovery", // or other phase
  objective: "Learning objective",
  subtasks: [
    {
      id: "subtask_id",
      name: "Subtask Name",
      description: "What students will do",
      objective: "Learning goal", 
      expectedOutcomes: ["Outcome 1", "Outcome 2"],
      validationCriteria: ["Criteria 1", "Criteria 2"],
      deliverables: ["Document 1", "Artifact 2"],
      estimatedTime: "2-3 hours",
      difficulty: "Intermediate",
      primaryAgent: "Business Analyst"
    }
  ]
}
```

## 🔧 Configuration

### LLM Provider Selection

Switch between LLM providers by uncommenting the desired model in `agentService.ts`:

```typescript
// Groq (recommended for speed)
this.model = new ChatGroq({
  model: "gemma2-9b-it",
  temperature: 0,
  apiKey: process.env.GROQ_API_KEY,
  streaming: true,
});

// OpenAI (recommended for quality)
// this.model = new ChatOpenAI({
//   model: "gpt-4o", 
//   temperature: 0.7,
//   streaming: true,
//   openAIApiKey: process.env.OPENAI_API_KEY,
// });
```

### Database Configuration

The system supports both PostgreSQL and in-memory storage:

```typescript
// PostgreSQL (recommended for production)
const checkpointer = new PostgresSaver({
  connectionString: process.env.DATABASE_URL
});

// In-memory (for development/testing)
const checkpointer = new MemorySaver();
```

### Conversation Memory Settings

Adjust conversation summary parameters in the `updateConversationSummary` method:

```typescript
// Keep only last N key points
if (summary.keyPoints.length > 5) {
  summary.keyPoints = summary.keyPoints.slice(-5);
}
```

## 🧪 Development

### Code Style & Standards

- **TypeScript**: Strict mode enabled with comprehensive type checking
- **ES Modules**: Modern import/export syntax
- **Error Handling**: Centralized error middleware with detailed logging
- **Logging**: Request logging middleware for debugging

### Development Scripts

```bash
# Start development server with auto-reload
npm run dev

# Build TypeScript to JavaScript
npm run build  

# Watch mode for TypeScript compilation
npm run watch

# Run the built application
node ./build/server.js
```

### Debugging

Enable detailed logging by setting:
```env
NODE_ENV=development
```

This provides:
- Detailed error stack traces
- Request/response logging
- Agent conversation flow logs
- Stream processing debug information

### Testing New Agents

To test new agent personalities:

1. Add the agent to the `getTeamMembers()` array
2. Define their `detailedPersona`, `expertise`, and `communicationStyle`
3. Update the routing logic if needed
4. Test with various conversation scenarios

### Custom Validation Logic

Extend the validation system by modifying `buildValidationPrompt()`:

```typescript
private buildValidationPrompt(task: LearningTask, subTask: Subtask, projectContext: ProjectContext): string {
  return `Your custom validation prompt...
  
  Additional criteria:
  - Custom requirement 1
  - Custom requirement 2
  
  Scoring rubric:
  - Innovation (20%)
  - Practicality (30%) 
  - Documentation Quality (50%)`;
}
```

## 🚀 Deployment

### Production Checklist

1. **Environment Variables**
   - Set all required API keys
   - Configure production database URL
   - Set `NODE_ENV=production`

2. **Database Setup**
   - Run PostgreSQL migrations
   - Configure connection pooling
   - Set up backup procedures

3. **Security**
   - Enable CORS for specific domains
   - Add rate limiting middleware
   - Implement authentication if needed

4. **Monitoring**
   - Set up logging aggregation
   - Configure health check endpoints
   - Monitor LLM API usage and costs

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY build/ ./build/
COPY .env ./

EXPOSE 3000
CMD ["node", "./build/server.js"]
```

### Performance Optimization

- **Caching**: Implement Redis for conversation summaries
- **Load Balancing**: Use multiple instances behind a load balancer
- **Database**: Optimize PostgreSQL queries and indexing
- **Streaming**: Consider WebSocket alternatives for high-concurrency scenarios

## 🛠️ Troubleshooting

### Common Issues

**Streaming Not Working**
- Verify SSE headers are properly set
- Check client-side EventSource implementation
- Ensure no buffering middleware is interfering

**Agent Responses Empty/Incorrect**
- Verify API keys are set correctly
- Check LLM provider rate limits
- Review agent prompt templates

**Database Connection Errors**
- Verify PostgreSQL is running and accessible
- Check connection string format
- Ensure database exists and user has permissions

**TypeScript Compilation Errors**
- Run `npm run build` to see detailed errors
- Check import paths use `.js` extensions for ES modules
- Verify all dependencies are properly typed

### Performance Issues

**Slow Response Times**
- Monitor LLM provider response times
- Consider switching to faster models (e.g., Groq)
- Implement response caching for common queries

**Memory Usage**
- Monitor conversation summary storage
- Implement cleanup for old sessions
- Consider Redis for distributed memory

## 📈 Future Enhancements

### Planned Features

- **Web Interface**: React-based frontend for complete user experience
- **Authentication**: User accounts and progress tracking
- **Advanced Analytics**: Learning progress insights and recommendations
- **Multi-Project Support**: Handle multiple concurrent learning projects
- **Export Capabilities**: Generate reports and documentation from conversations
- **Integration**: Connect with existing LMS platforms

### Architecture Improvements

- **Microservices**: Split agents into separate services
- **Message Queue**: Implement async processing for complex tasks
- **Real-time Collaboration**: Multi-user sessions and peer learning
- **Advanced Memory**: Vector-based conversation search and retrieval

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/new-feature`
3. **Follow TypeScript best practices**
4. **Add tests for new functionality** 
5. **Update documentation**
6. **Submit a pull request**

### Development Guidelines

- Use descriptive commit messages
- Follow existing code structure and naming conventions
- Add JSDoc comments for public methods
- Test with multiple LLM providers
- Update this README for significant changes

## 📄 License

ISC License - see package.json for details.

## 🆘 Support

For issues and questions:

1. Check this README and troubleshooting section
2. Review the codebase comments and type definitions
3. Open an issue with:
   - Environment details (Node.js version, OS)
   - Error messages and stack traces
   - Steps to reproduce
   - Expected vs actual behavior

---

*Built with LangGraph and powered by advanced language models for next-generation requirements engineering education.*