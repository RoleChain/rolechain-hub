# AI Agent Platform

A scalable platform for managing AI agents across multiple messaging platforms with support for various AI models, task management, and content generation.

## Architecture

### Workers

The platform uses a worker-based architecture for handling agent operations:

#### Bot Worker (`workers/botWorker.js`)
- Manages bot instances across different platforms (Telegram, Discord)
- Handles message processing and AI model interactions
- Supports multiple AI models:
  - DeepInfra Llama
  - OpenAI GPT-4
  - Groq
  - Google Gemini
  - RoleChain
- Features proxy rotation for enhanced reliability
- Implements conversation memory and context management

### Routes

#### Agent Routes (`routes/agentRoutes.js`)
- Agent lifecycle management (create, start, stop, delete)
- Bot process management with active process tracking
- Cryptocurrency price monitoring integration
- Task management and delegation

#### Analyzer Routes (`routes/analyzerRoutes.js`)
- SEO analysis capabilities
- Content optimization recommendations
- Technical site analysis

#### Character Routes (`routes/characterRoutes.js`)
- Character creation and management
- Personality trait handling
- Mood and emotional state tracking

#### News Agent Routes (`routes/newsAgent.js`)
- Cryptocurrency news aggregation
- Smart search functionality with multiple data sources
- Web scraping with proxy support

#### Research Agent Routes (`routes/researchAgent.js`)
- Document analysis (PDF, images)
- Tokenomics analysis
- OCR capabilities for image processing

#### Summary Routes (`routes/summaryRoutes.js`)
- Telegram integration with MTProto
- Channel management
- Message analysis and summarization
- Bot management within channels

#### Task Routes (`routes/taskRoutes.js`)
- Task creation and management
- Schedule handling
- Status tracking

#### Writer Agent Routes (`routes/writterAgentRoutes.js`)
- Blog content generation
- Task status monitoring
- External writer API integration

## Key Features

1. **Multi-Platform Support**
   - Telegram integration
   - Discord integration
   - API endpoints

2. **AI Model Integration**
   - Multiple model support
   - Context management
   - Response generation

3. **Task Management**
   - Scheduled tasks
   - Real-time status tracking
   - Error handling

4. **Content Analysis**
   - SEO optimization
   - Content generation
   - Document processing

5. **Security**
   - Proxy rotation
   - Token-based authentication
   - Rate limiting

## Technical Stack

- Node.js
- Express.js
- MongoDB
- Various AI APIs (OpenAI, Google, etc.)
- Telegram MTProto
- Discord.js

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```env
MONGO_URI=your_mongodb_uri
OPENAI_API_KEY=your_openai_key
DEEPINFRA_API_KEY=your_deepinfra_key
GROQ_API_KEY=your_groq_key
GOOGLE_API_KEY=your_google_key
ROLECHAIN_API_KEY=your_rolechain_key
TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash
FRONTEND_URL=your_frontend_url
JWT_SECRET=your_jwt_secret
YOUTUBE_MCP_KEY=your_youtube_mcp_key
WRITER_API_KEY=your_writer_api_key
```

3. Start the application:
```bash
npm start
```

## API Documentation

Detailed API documentation for each route is available in the respective route files. Key endpoints include:

- `/api/agents` - Agent management
- `/api/analyzer` - Content analysis
- `/api/characters` - Character management
- `/api/news` - News aggregation
- `/api/research` - Document analysis
- `/api/summary` - Channel summarization
- `/api/tasks` - Task management
- `/api/writer` - Content generation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

