import type { AgentInput, AgentOutput } from '../base/AgentTypes.js';

// LangGraph state definition
export interface AgentGraphState {
  // User input information
  userId: string;
  sessionId: string;
  originalMessage: string;
  metadata?: any;

  // Messages for agent-to-agent communication
  messages: AgentMessage[];

  // Currently processing agent
  currentAgent?: string;

  // Final result
  finalOutput?: AgentOutput;

  // Context for agent collaboration
  context: {
    intent?: string;
    entities?: Record<string, unknown>;
    sharedData?: Record<string, unknown>;
    collaborationHistory?: AgentCollaboration[];
    multiAgentRequest?: boolean;
    additionalAgents?: string[];
  };

  // Error handling
  error?: string;
  retryCount?: number;

  // Execution timeline (observability)
  timeline?: Array<{
    step: string;
    ms: number;
    intent?: string;
    route?: string;
    usage?: { totalTokens?: number };
  }>;
}

// Agent-to-agent message type
export interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification' | 'query';
  content: any;
  timestamp: Date;
  messageId: string;
}

// Agent collaboration record
export interface AgentCollaboration {
  agents: string[];
  purpose: string;
  result: any;
  timestamp: Date;
}

// Agent node definition
export interface AgentNode {
  name: string;
  agent: any; // BaseAgent instance
  capabilities: string[];
  dependencies?: string[];
}

// Graph edge definition (agent connections)
export interface AgentEdge {
  from: string;
  to: string;
  condition?: (state: AgentGraphState) => boolean;
  transform?: (state: AgentGraphState) => AgentGraphState;
}

// Event types for A2A communication
export type AgentEvent =
  | {
      type: 'AGENT_REQUEST';
      payload: { from: string; to: string; request: any };
    }
  | {
      type: 'AGENT_RESPONSE';
      payload: { from: string; to: string; response: any };
    }
  | {
      type: 'AGENT_NOTIFICATION';
      payload: { from: string; to: string; notification: any };
    }
  | {
      type: 'COLLABORATION_START';
      payload: { agents: string[]; purpose: string };
    }
  | { type: 'COLLABORATION_END'; payload: { agents: string[]; result: any } };
