import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { chromaService } from '../../lib/chroma';
import type { AgentInput, AgentOutput } from './AgentTypes';
import type { AgentEventBus } from '../graph/AgentEventBus';

export abstract class BaseAgent {
  protected readonly llm: LLMService;
  protected readonly logger: FastifyBaseLogger;
  protected eventBus?: AgentEventBus;
  protected agentName: string;

  constructor(llm: LLMService, logger: FastifyBaseLogger, agentName: string) {
    this.llm = llm;
    this.logger = logger;
    this.agentName = agentName;
  }

  // Set event bus for A2A communication
  setEventBus(eventBus: AgentEventBus) {
    this.eventBus = eventBus;
    this.setupA2AHandlers();
  }

  // Set up A2A message handlers
  private setupA2AHandlers() {
    if (!this.eventBus) return;

    // Handle requests from other agents
    this.eventBus.subscribeToAgent(this.agentName, (message) => {
      this.handleA2AMessage(message);
    });
  }

  // Handle A2A messages
  protected async handleA2AMessage(message: any) {
    this.logger.info(`${this.agentName} received A2A message:`, message);

    try {
      switch (message.type) {
        case 'request':
          await this.handleA2ARequest(message);
          break;
        case 'response':
          await this.handleA2AResponse(message);
          break;
        case 'notification':
          await this.handleA2ANotification(message);
          break;
      }
    } catch (error) {
      this.logger.error(
        `${this.agentName} A2A message handling error:`,
        error as any
      );
    }
  }

  // Handle A2A requests (implemented by subclasses)
  protected async handleA2ARequest(message: any): Promise<void> {
    this.logger.info(`${this.agentName} handling A2A request:`, message);
  }

  // Handle A2A responses (implemented by subclasses)
  protected async handleA2AResponse(message: any): Promise<void> {
    this.logger.info(`${this.agentName} handling A2A response:`, message);
  }

  // Handle A2A notifications (implemented by subclasses)
  protected async handleA2ANotification(message: any): Promise<void> {
    this.logger.info(`${this.agentName} handling A2A notification:`, message);
  }

  // Send message to other agents
  protected async sendA2AMessage(
    to: string,
    type: 'request' | 'response' | 'notification',
    content: any
  ) {
    if (!this.eventBus) {
      this.logger.warn(
        `${this.agentName} attempted to send A2A message but no event bus available`
      );
      return;
    }

    this.eventBus.sendMessage(this.agentName, to, type, content);
  }

  // Start collaboration
  protected async startCollaboration(agents: string[], purpose: string) {
    if (!this.eventBus) return;

    this.eventBus.startCollaboration(agents, purpose);
  }

  // End collaboration
  protected async endCollaboration(agents: string[], result: any) {
    if (!this.eventBus) return;

    this.eventBus.endCollaboration(agents, result);
  }

  // Default vector DB accessor for RAG-capable agents
  protected get vector() {
    return chromaService;
  }

  abstract process(input: AgentInput): Promise<AgentOutput>;

  abstract getCapabilities(): string[];

  // Check if A2A collaboration is possible
  canCollaborateWith(otherAgent: string): boolean {
    return true; // By default, can collaborate with all agents
  }

  // Return agent name
  getName(): string {
    return this.agentName;
  }
}
