# MedicAgent - AI-Powered Medical Assistant

A modern web application with Supabase authentication, featuring sign-in/sign-up functionality, social login integration, and AI-powered medical assistance with vector database, job queue capabilities, and local LLM integration.

## Features

- 🔐 **Authentication System**: Complete sign-in/sign-up with Supabase
- 🌐 **Social Login**: Google OAuth integration
- 🎨 **Modern UI**: Beautiful, responsive design with Tailwind CSS
- 🚀 **Real-time**: Live authentication state management
- 🔒 **Protected Routes**: Secure access control
- 📱 **Mobile Responsive**: Works on all devices
- 🤖 **AI Integration**: Vector database for medical knowledge retrieval
- 📊 **Job Queue**: Background task processing with BullMQ
- 🗄️ **Vector Database**: ChromaDB for semantic search and document storage
- 🔄 **Redis**: Caching and job queue backend
- 🧠 **Local LLM**: Ollama integration for local AI model management
- 🔍 **Service Health Monitoring**: Real-time connection status for all services

## Tech Stack

### Frontend

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase Client** - Authentication and database

### Backend

- **Fastify** - Fast web framework
- **TypeScript** - Type safety
- **Supabase Admin** - Server-side operations
- **Zod** - Schema validation
- **ChromaDB** - Vector database for AI/ML
- **Redis** - Caching and job queue
- **BullMQ** - Job queue management
- **Ollama** - Local LLM model management
- **Docker** - Containerization

## Setup Instructions

### 1. Prerequisites

- **Node.js** (v24.3.0 or higher) - [Download here](https://nodejs.org/)
- **Yarn** (v1.22.0 or higher) - [Install guide](https://classic.yarnpkg.com/en/docs/install/)
- **Docker** and **Docker Compose** - [Install guide](https://docs.docker.com/get-docker/)
- **Supabase** account and project
- **Ollama** - [Install guide](https://ollama.ai/download) (for local LLM capabilities)

### 2. Node.js Version Management

This project uses Node.js v24.3.0. If you're using nvm:

```bash
# Install and use the correct Node.js version
nvm install 24.3.0
nvm use 24.3.0

# Or if you have nvm installed, it will automatically use the version from .nvmrc
nvm use
```

### 3. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Settings > API to get your credentials
3. Enable Authentication providers:
   - Go to Authentication > Providers
   - Enable Email provider
   - Enable Google OAuth (configure with Google Console)

### 4. Environment Variables

Create the following environment files:

#### Backend (.env)
```bash
# supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# chroma
CHROMA_URL=http://localhost:8000
CHROMA_USERNAME=admin
CHROMA_PASSWORD=admin
CHROMA_SERVER_HOST=localhost
CHROMA_SERVER_HTTP_PORT=8000

# redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ollama
OLLAMA_BASE=http://localhost:11434
OLLAMA_MODEL=mistral

# openai: only used when LLM_PROVIDER is openai
OPENAI_API_KEY=your_key

# llm provider: default to ollama. you can switch this to openai with the OPENAI_API_KEY
LLM_PROVIDER=ollama
```

#### Frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 5. Installation

#### Start Infrastructure Services

```bash
cd backend
docker-compose up -d
```

This will start:
- **ChromaDB** on port 8000 (vector database)
- **Redis** on port 6379 (caching and job queue)
- **Bull Board** on port 8888 (job queue monitoring UI)

#### Backend

```bash
cd backend
nvm use
yarn install
yarn build
yarn start
```

The backend will automatically:
- Check connection status for all services (Supabase, ChromaDB, Redis, BullMQ)
- Set up Ollama model if not already available
- Log the status of each service connection
- **You may need to wait a while to pull the LLM model if you don't have it on your docker machine**

#### Frontend

```bash
cd frontend
yarn install
yarn dev
```

## Project Structure

```
medic-agent/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/callback/     # OAuth callback handler
│   │   │   ├── signin/           # Sign-in page
│   │   │   ├── signup/           # Sign-up page
│   │   │   └── chat/             # Protected chat page
│   │   ├── components/
│   │   │   ├── Nav.tsx           # Navigation with auth state
│   │   │   ├── Hero.tsx          # Landing page hero
│   │   │   └── ProtectedRoute.tsx # Route protection
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx   # Authentication state management
│   │   └── lib/
│   │       └── supabase.ts       # Supabase client configuration
│   ├── package.json              # Frontend dependencies
│   ├── yarn.lock                 # Yarn lock file
│   └── .env.local                # Frontend environment variables
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts           # Authentication API routes
│   │   │   └── health.ts         # Health check endpoint
│   │   ├── lib/
│   │   │   ├── supabase.ts       # Supabase admin client with health check
│   │   │   ├── env.ts            # Environment validation
│   │   │   ├── chroma.ts         # ChromaDB vector database service
│   │   │   ├── redis.ts          # Redis connection and utilities
│   │   │   ├── bullmq.ts         # BullMQ job queue setup
│   │   │   └── setup-ollama.ts   # Ollama model management
│   │   └── index.ts              # Fastify server setup with service initialization
│   ├── docker-compose.yml        # Infrastructure services
│   ├── chroma.htpasswd           # ChromaDB authentication
│   ├── .nvmrc                    # Node.js version specification
│   ├── package.json              # Backend dependencies
│   ├── yarn.lock                 # Yarn lock file
│   └── .env                      # Backend environment variables
└── README.md
```

## API Endpoints

### Authentication Routes (`/auth`)

- `POST /auth/signup` - Create new user account
- `POST /auth/signin` - Sign in existing user
- `GET /auth/user/:userId` - Get user by ID
- `GET /auth/users` - List all users (admin)
- `PUT /auth/user/:userId` - Update user
- `DELETE /auth/user/:userId` - Delete user

### Health Check (`/health`)

- `GET /health` - System health status including all service connections

## Infrastructure Services

### ChromaDB (Vector Database)
- **Port**: 8000
- **Purpose**: Store and query medical documents and knowledge
- **Features**: Semantic search, document embeddings, metadata filtering
- **Health Check**: Automatic connection verification on startup

### Redis
- **Port**: 6379
- **Purpose**: Caching and job queue backend
- **Features**: Session storage, API response caching, job queue persistence
- **Health Check**: Connection status monitoring

### BullMQ (Job Queue)
- **Port**: 8888 (Bull Board UI)
- **Purpose**: Background task processing and job management
- **Features**: 
  - Notification queue for user notifications
  - Automatic retry with exponential backoff
  - Job monitoring and management
  - Real-time job status tracking

### Ollama (Local LLM)
- **Port**: 11434 (default)
- **Purpose**: Local AI model management and inference
- **Features**:
  - Automatic model downloading and setup
  - Model health monitoring
  - Configurable model selection
  - Local inference capabilities

## Service Health Monitoring

The application automatically monitors the health of all services on startup:

- **Supabase**: Database connection and authentication service status
- **ChromaDB**: Vector database connection and availability
- **Redis**: Cache and queue backend connectivity
- **BullMQ**: Job queue system status
- **Ollama**: Local LLM model availability and setup

All service statuses are logged during application startup, making it easy to identify and troubleshoot connection issues.

## Authentication Flow

1. **Sign Up**: User creates account with email/password or social login
2. **Email Verification**: (Optional) User confirms email address
3. **Sign In**: User authenticates with credentials or social provider
4. **Session Management**: JWT tokens handled by Supabase
5. **Protected Routes**: Components wrapped with `ProtectedRoute`
6. **Sign Out**: User logs out, session cleared

## Features in Detail

### Frontend Authentication

- **Real-time State**: AuthContext provides live user state
- **Social Login**: Google OAuth integration
- **Form Validation**: Client-side validation with error handling
- **Loading States**: Spinner animations during auth operations
- **Responsive Design**: Mobile-friendly authentication forms

### Backend API

- **Input Validation**: Zod schemas for request validation
- **Error Handling**: Comprehensive error responses
- **Admin Operations**: User management with service role
- **Security**: CORS configuration and proper headers
- **Service Health**: Connection status monitoring for all services
- **Service Initialization**: Automatic setup and verification of all infrastructure services

### AI and Vector Database

- **ChromaDB Integration**: Vector storage for medical knowledge
- **Document Management**: Add, query, and manage medical documents
- **Semantic Search**: Find relevant medical information
- **Collection Management**: Organize documents by categories
- **Health Monitoring**: Real-time connection status

### Job Queue System

- **BullMQ Integration**: Background task processing
- **Notification Queue**: Handle user notifications
- **Retry Logic**: Automatic retry with exponential backoff
- **Job Monitoring**: Real-time job status via Bull Board
- **Connection Health**: Queue system status monitoring

### Local LLM Integration

- **Ollama Integration**: Local AI model management
- **Automatic Setup**: Model downloading and configuration
- **Model Health**: Availability and status monitoring
- **Configurable Models**: Support for different AI models
- **Local Inference**: Privacy-preserving AI capabilities

### Security Features

- **JWT Tokens**: Secure session management
- **Password Strength**: Real-time password validation
- **Protected Routes**: Automatic redirect for unauthenticated users
- **Input Sanitization**: Server-side validation and sanitization
- **Service Authentication**: Secure connections to ChromaDB and Redis
- **Health Monitoring**: Continuous service availability checking

## Development

### Running in Development

```bash
# Terminal 1 - Start infrastructure
cd backend
docker-compose up -d

# Terminal 2 - Backend
cd backend
yarn dev

# Terminal 3 - Frontend
cd frontend
yarn dev
```

### Building for Production

```bash
# Frontend
cd frontend
yarn build
yarn start

# Backend
cd backend
yarn build
yarn start
```

### Available Scripts

#### Backend Scripts
```bash
yarn dev          # Start development server with hot reload
yarn build        # Build for production
yarn start        # Start production server
yarn type-check   # Run TypeScript type checking
```

#### Frontend Scripts
```bash
yarn dev          # Start development server
yarn build        # Build for production
yarn start        # Start production server
yarn lint         # Run ESLint
yarn type-check   # Run TypeScript type checking
```

### Monitoring

- **Bull Board**: http://localhost:8888 - Monitor job queues
- **ChromaDB**: http://localhost:8000 - Vector database API
- **Redis**: localhost:6379 - Cache and queue backend
- **Ollama**: http://localhost:11434 - Local LLM API

## Troubleshooting

### Common Issues

1. **Node.js Version Issues**

   - Ensure you're using Node.js v24.3.0: `node --version`
   - Use nvm to switch versions: `nvm use 24.3.0`
   - Check .nvmrc file in backend directory

2. **Yarn Installation Issues**

   - Install Yarn globally: `npm install -g yarn`
   - Clear Yarn cache: `yarn cache clean`
   - Delete node_modules and reinstall: `rm -rf node_modules && yarn install`

3. **Environment Variables Not Loading**

   - Ensure `.env` files are in correct locations
   - Restart development servers after adding variables

4. **OAuth Not Working**

   - Verify redirect URIs in provider settings
   - Check Supabase provider configuration
   - Ensure callback URL matches exactly

5. **CORS Errors**

   - Verify backend CORS configuration
   - Check frontend URL in backend CORS settings

6. **Authentication State Not Persisting**
   - Check Supabase client configuration
   - Verify session storage settings

7. **Service Connection Issues**

   - Ensure Docker containers are running: `docker-compose ps`
   - Check service logs: `docker-compose logs [service-name]`
   - Verify environment variables match service configurations
   - Check backend startup logs for service connection status

8. **ChromaDB Connection Issues**
   - Check ChromaDB container status
   - Verify authentication credentials in `.env`
   - Ensure port 8000 is available

9. **Redis Connection Issues**
   - Check Redis container status
   - Verify Redis host and port configuration
   - Ensure port 6379 is available

10. **Ollama Connection Issues**
    - Ensure Ollama is installed and running: `ollama serve`
    - Check if model is available: `ollama list`
    - Verify Ollama base URL in environment variables
    - Check backend logs for model setup status

11. **BullMQ Queue Issues**
    - Verify Redis connection for BullMQ
    - Check Bull Board UI for queue status
    - Review job queue configuration in `bullmq.ts`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
