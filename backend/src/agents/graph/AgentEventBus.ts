import { EventEmitter } from 'events';
import type { FastifyBaseLogger } from 'fastify';
import type { AgentEvent, AgentMessage } from './AgentGraphTypes.js';

export class AgentEventBus extends EventEmitter {
  private logger: FastifyBaseLogger;
  private messageHistory: AgentMessage[] = [];
  private maxHistorySize = 1000;

  constructor(logger: FastifyBaseLogger) {
    super();
    this.logger = logger;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // A2A request event handling
    this.on('AGENT_REQUEST', (event: AgentEvent) => {
      if ('from' in event.payload && 'to' in event.payload) {
        this.logger.info(
          `A2A Request: ${event.payload.from} -> ${event.payload.to}`,
          {
            request:
              'request' in event.payload ? event.payload.request : undefined,
          } as any
        );
        this.handleAgentRequest(event.payload);
      }
    });

    // A2A response event handling
    this.on('AGENT_RESPONSE', (event: AgentEvent) => {
      if ('from' in event.payload && 'to' in event.payload) {
        this.logger.info(
          `A2A Response: ${event.payload.from} -> ${event.payload.to}`,
          {
            response:
              'response' in event.payload ? event.payload.response : undefined,
          } as any
        );
        this.handleAgentResponse(event.payload);
      }
    });

    // A2A notification event handling
    this.on('AGENT_NOTIFICATION', (event: AgentEvent) => {
      if ('from' in event.payload && 'to' in event.payload) {
        this.logger.info(
          `A2A Notification: ${event.payload.from} -> ${event.payload.to}`,
          {
            notification:
              'notification' in event.payload
                ? event.payload.notification
                : undefined,
          } as any
        );
        this.handleAgentNotification(event.payload);
      }
    });

    // Collaboration start event handling
    this.on('COLLABORATION_START', (event: AgentEvent) => {
      if ('agents' in event.payload) {
        this.logger.info(
          `Collaboration started between agents: ${event.payload.agents.join(
            ', '
          )}`,
          {
            purpose:
              'purpose' in event.payload ? event.payload.purpose : undefined,
          } as any
        );
      }
    });

    // Collaboration end event handling
    this.on('COLLABORATION_END', (event: AgentEvent) => {
      if ('agents' in event.payload) {
        this.logger.info(
          `Collaboration ended between agents: ${event.payload.agents.join(
            ', '
          )}`,
          {
            result:
              'result' in event.payload ? event.payload.result : undefined,
          } as any
        );
      }
    });
  }

  private async handleAgentRequest(payload: any) {
    try {
      // Send request to target agent
      const targetAgent = payload.to;
      const request = payload.request;

      // In actual implementation, the target agent is found through the agent registry and processing is delegated
      this.emit(`request:${targetAgent}`, {
        from: payload.from,
        request,
      });
    } catch (error) {
      this.logger.error('Error handling agent request:', error as any);
    }
  }

  private async handleAgentResponse(payload: any) {
    try {
      // Send response to requesting agent
      const requestingAgent = payload.to;
      const response = payload.response;

      this.emit(`response:${requestingAgent}`, {
        from: payload.from,
        response,
      });
    } catch (error) {
      this.logger.error('Error handling agent response:', error as any);
    }
  }

  private async handleAgentNotification(payload: any) {
    try {
      // Forward notification to target agent
      const targetAgent = payload.to;
      const notification = payload.notification;

      this.emit(`notification:${targetAgent}`, {
        from: payload.from,
        notification,
      });
    } catch (error) {
      this.logger.error('Error handling agent notification:', error as any);
    }
  }

  // A2A message send
  sendMessage(
    from: string,
    to: string,
    type: 'request' | 'response' | 'notification',
    content: any
  ) {
    const message: AgentMessage = {
      from,
      to,
      type,
      content,
      timestamp: new Date(),
      messageId: this.generateMessageId(),
    };

    // Add to message history
    this.addToHistory(message);

    // Emit event
    this.emit(`AGENT_${type.toUpperCase()}`, {
      type: `AGENT_${type.toUpperCase()}`,
      payload: { from, to, [type]: content },
    });
  }

  // Collaboration start notification
  startCollaboration(agents: string[], purpose: string) {
    this.emit('COLLABORATION_START', {
      type: 'COLLABORATION_START',
      payload: { agents, purpose },
    });
  }

  // Collaboration end notification
  endCollaboration(agents: string[], result: any) {
    this.emit('COLLABORATION_END', {
      type: 'COLLABORATION_END',
      payload: { agents, result },
    });
  }

  // Message history management
  private addToHistory(message: AgentMessage) {
    this.messageHistory.push(message);

    // Limit history size
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  // Message history query
  getMessageHistory(agent?: string, limit?: number): AgentMessage[] {
    let history = this.messageHistory;

    if (agent) {
      history = history.filter((msg) => msg.from === agent || msg.to === agent);
    }

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  // Subscribe to agent messages
  subscribeToAgent(agentName: string, callback: (message: any) => void) {
    this.on(`request:${agentName}`, callback);
    this.on(`response:${agentName}`, callback);
    this.on(`notification:${agentName}`, callback);
  }

  // Unsubscribe from agent messages
  unsubscribeFromAgent(agentName: string, callback: (message: any) => void) {
    this.off(`request:${agentName}`, callback);
    this.off(`response:${agentName}`, callback);
    this.off(`notification:${agentName}`, callback);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Agent conversation session management
  createSession(sessionId: string, participants: string[]) {
    this.logger.info(`Creating A2A session: ${sessionId}`, {
      participants,
    } as any);

    this.emit('SESSION_CREATED', {
      type: 'SESSION_CREATED',
      payload: { sessionId, participants },
    });
  }

  endSession(sessionId: string) {
    this.logger.info(`Ending A2A session: ${sessionId}`);

    this.emit('SESSION_ENDED', {
      type: 'SESSION_ENDED',
      payload: { sessionId },
    });
  }
}
