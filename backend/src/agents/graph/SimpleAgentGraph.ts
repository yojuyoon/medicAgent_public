import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { validateContext } from './StateSchema';
import { RouterAgent } from '../router/RouterAgent';
import { AppointmentAgent } from '../specialized/AppointmentAgent';
import { GPAgent } from '../specialized/GPAgent';
import { NotificationAgent } from '../specialized/NotificationAgent';
import { ReportAgent } from '../specialized/ReportAgent';
import type { AgentGraphState, AgentMessage } from './AgentGraphTypes';
import type {
  CollaborationRule,
  SharedData,
  ExecutionStrategy,
  CollaborationResult,
  ParallelExecutionResult,
  TimelineEntry,
  UsageInfo,
  AgentResult,
  RouterResult,
  AgentInput,
  CollaborationContext,
} from './CollaborationTypes';
import {
  SEMAPHORE_CONFIG,
  COLLABORATION_PRIORITY,
  EXECUTION_STRATEGY,
} from './CollaborationTypes';
import { v4 as uuidv4 } from 'uuid';
import { saveInteractionTool } from '../tools/report';
import { saveToChromaTool } from '../tools/chroma';

// Simple Semaphore implementation for concurrency control
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

export class SimpleAgentGraph {
  private readonly agents: Map<string, any> = new Map();
  private readonly logger: FastifyBaseLogger;
  private readonly llm: LLMService;

  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    this.llm = llm;
    this.logger = logger;
    this.initializeAgents();
  }

  private initializeAgents() {
    // Create agent instances
    const routerAgent = new RouterAgent(this.llm, this.logger);
    const appointmentAgent = new AppointmentAgent(this.llm, this.logger);
    const gpAgent = new GPAgent(this.llm, this.logger);
    const notificationAgent = new NotificationAgent(this.llm, this.logger);
    const reportAgent = new ReportAgent(this.llm, this.logger);

    // Register agents
    this.agents.set('router', routerAgent);
    this.agents.set('appointment', appointmentAgent);
    this.agents.set('gp', gpAgent);
    this.agents.set('notification', notificationAgent);
    this.agents.set('report', reportAgent);

    // Register other agents with RouterAgent
    routerAgent.register('appointment', appointmentAgent);
    routerAgent.register('gp', gpAgent);
    routerAgent.register('notification', notificationAgent);
    routerAgent.register('report', reportAgent);
  }

  /**
   * Main graph execution method
   * Executes in order: Router -> Specialized Agent -> Collaboration System
   */
  async process(input: AgentInput): Promise<AgentGraphState> {
    const initialState = this.createInitialState(input);

    try {
      this.logger.info(`Processing A2A request: ${input.message}`);

      // 1. Router stage
      const routerResult = await this.executeRouterStage(initialState);
      if (routerResult.error) {
        return routerResult;
      }

      // 2. Specialized agent execution
      const agentResult = await this.executeSpecializedAgentStage(routerResult);
      if (agentResult.error) {
        return agentResult;
      }

      // 3. Collaboration system execution
      const finalResult = await this.executeCollaborationStage(agentResult);

      this.logger.info('A2A processing completed successfully');
      return finalResult;
    } catch (error) {
      return this.handleProcessingError(error, initialState);
    }
  }

  /**
   * Create initial state
   */
  private createInitialState(input: AgentInput): AgentGraphState {
    return {
      userId: input.userId,
      sessionId: input.sessionId,
      originalMessage: input.message,
      metadata: input.metadata,
      messages: [],
      context: validateContext({
        sharedData: {},
      }) as AgentGraphState['context'],
    };
  }

  /**
   * Execute router stage
   */
  private async executeRouterStage(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    const startTime = Date.now();
    const routerResult = await this.executeRouter(state);
    // Opportunistic ingestion for report criteria on user message (idempotent per run)
    await this.saveIfReportCandidateOnce(routerResult);
    const endTime = Date.now();

    const timelineEntry = this.createTimelineEntry(
      'router',
      endTime - startTime,
      routerResult.context?.intent,
      routerResult.currentAgent,
      this.extractUsageFromResult(routerResult)
    );

    return {
      ...routerResult,
      timeline: [...(routerResult.timeline || []), timelineEntry],
    };
  }

  /**
   * Execute specialized agent stage
   */
  private async executeSpecializedAgentStage(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    const startTime = Date.now();
    const agentResult = await this.executeSpecializedAgent(state);
    const endTime = Date.now();

    const timelineEntry = this.createTimelineEntry(
      `agent:${agentResult.currentAgent || 'chat'}`,
      endTime - startTime,
      undefined,
      undefined,
      this.extractUsageFromResult(agentResult)
    );

    return {
      ...agentResult,
      timeline: [
        ...(agentResult.timeline || state.timeline || []),
        timelineEntry,
      ],
    };
  }

  /**
   * Execute collaboration stage
   */
  private async executeCollaborationStage(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    const startTime = Date.now();
    // Also opportunistically ingest before collaboration begins (idempotent per run)
    await this.saveIfReportCandidateOnce(state);
    const collaborationResult = await this.executeGenericCollaboration(state);
    const endTime = Date.now();

    const timelineEntry = this.createTimelineEntry(
      'collaboration',
      endTime - startTime
    );

    return {
      ...collaborationResult,
      timeline: [
        ...(collaborationResult.timeline || state.timeline || []),
        timelineEntry,
      ],
    };
  }

  /**
   * Create timeline entry
   */
  private createTimelineEntry(
    step: string,
    ms: number,
    intent?: string,
    route?: string,
    usage?: UsageInfo
  ): TimelineEntry {
    const entry: TimelineEntry = { step, ms };

    if (intent) entry.intent = intent;
    if (route) entry.route = route;
    if (usage) entry.usage = usage;

    return entry;
  }

  /**
   * Extract usage information from result
   */
  private extractUsageFromResult(
    result: AgentGraphState
  ): UsageInfo | undefined {
    const usageTotal = (result.finalOutput as AgentResult)?.usageTotalTokens;
    return typeof usageTotal === 'number'
      ? { totalTokens: usageTotal }
      : undefined;
  }

  /**
   * Handle processing errors
   */
  private handleProcessingError(
    error: unknown,
    initialState: AgentGraphState
  ): AgentGraphState {
    this.logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: initialState.userId,
        sessionId: initialState.sessionId,
        originalMessage: initialState.originalMessage,
        metadata: initialState.metadata,
      },
      'A2A processing error:'
    );

    return {
      ...initialState,
      error: `Processing error: ${error}`,
      finalOutput: {
        reply: "I'm sorry, I encountered an error. Please try again.",
        actions: [{ type: 'error', status: 'failed' }],
      },
    };
  }

  /**
   * Execute router
   */
  private async executeRouter(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    try {
      const routerAgent = this.agents.get('router');
      if (!routerAgent) {
        throw new Error('Router agent not found');
      }

      const result = await routerAgent.process({
        userId: state.userId,
        sessionId: state.sessionId,
        message: state.originalMessage,
        metadata: state.metadata,
      });

      const routerResult = result as RouterResult;
      const message = this.createRouterMessage(
        routerResult,
        state.originalMessage
      );

      return {
        ...state,
        currentAgent: routerResult.route || 'chat',
        context: {
          ...state.context,
          intent: routerResult.intent,
          entities: routerResult.entities,
          // Store multi-agent information from RouterAgent
          multiAgentRequest: (routerResult as any).multiAgentRequest,
          additionalAgents: (routerResult as any).additionalAgents,
        },
        messages: [...(state.messages || []), message],
        finalOutput: result,
      };
    } catch (error) {
      return this.handleRouterError(error, state);
    }
  }

  /**
   * Create router message
   */
  private createRouterMessage(
    result: RouterResult,
    originalMessage: string
  ): AgentMessage {
    return {
      from: 'router',
      to: result.route || 'chat',
      type: 'request',
      content: {
        intent: result.intent,
        entities: result.entities,
        originalMessage,
      },
      timestamp: new Date(),
      messageId: uuidv4(),
    };
  }

  /**
   * Handle router errors
   */
  private handleRouterError(
    error: unknown,
    state: AgentGraphState
  ): AgentGraphState {
    this.logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: state.userId,
        sessionId: state.sessionId,
        originalMessage: state.originalMessage,
        metadata: state.metadata,
      },
      'Router execution error:'
    );

    return {
      ...state,
      error: `Router error: ${error}`,
      currentAgent: 'error_handler',
    };
  }

  /**
   * Execute specialized agent
   */
  private async executeSpecializedAgent(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    try {
      const agentName = state.currentAgent || 'chat';
      const agent = this.getAgent(agentName);

      this.logger.info(`Executing ${agentName} agent`);

      const result = await agent.process({
        userId: state.userId,
        sessionId: state.sessionId,
        message: state.originalMessage,
        metadata: state.metadata,
        intent: state.context?.intent,
        entities: state.context?.entities,
      });

      const responseMessage = this.createAgentResponseMessage(
        agentName,
        result
      );

      return {
        ...state,
        messages: [...(state.messages || []), responseMessage],
        finalOutput: result,
      };
    } catch (error) {
      return this.handleSpecializedAgentError(error, state);
    }
  }

  /**
   * Get agent
   */
  private getAgent(agentName: string): any {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }
    return agent;
  }

  /**
   * Create agent response message
   */
  private createAgentResponseMessage(
    agentName: string,
    result: AgentResult
  ): AgentMessage {
    return {
      from: agentName,
      to: 'router',
      type: 'response',
      content: result,
      timestamp: new Date(),
      messageId: uuidv4(),
    };
  }

  /**
   * Handle specialized agent errors
   */
  private handleSpecializedAgentError(
    error: unknown,
    state: AgentGraphState
  ): AgentGraphState {
    const agentName = state.currentAgent || 'chat';

    this.logger.error(
      {
        agentName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: state.userId,
        sessionId: state.sessionId,
        originalMessage: state.originalMessage,
        context: state.context,
      },
      `Specialized agent execution error in ${agentName} agent:`
    );

    return {
      ...state,
      error: `Agent execution error in ${agentName}: ${error}`,
      currentAgent: 'error_handler',
    };
  }

  /**
   * Generic collaboration system (with parallel execution support)
   */
  private async executeGenericCollaboration(
    state: AgentGraphState
  ): Promise<AgentGraphState> {
    // Skip collaboration for multi-agent requests to prevent duplicate execution
    if (state.context?.multiAgentRequest) {
      this.logger.info(
        {
          multiAgentRequest: state.context.multiAgentRequest,
          additionalAgents: state.context.additionalAgents,
        },
        'Skipping collaboration for multi-agent request to prevent duplicate execution'
      );
      return state;
    }

    const sharedData = this.extractSharedData(state);
    if (!sharedData) {
      return state;
    }

    const applicableRules = this.getApplicableRules(sharedData, state);
    if (applicableRules.length === 0) {
      return state;
    }

    this.logCollaborationStart(sharedData, state, applicableRules);

    const executionStrategy = this.determineExecutionStrategy(
      applicableRules,
      state
    );
    return await this.executeCollaborationStrategy(
      state,
      applicableRules,
      executionStrategy
    );
  }

  /**
   * Extract shared data
   */
  private extractSharedData(state: AgentGraphState): SharedData | null {
    const finalOutput = state.finalOutput as AgentResult;
    return finalOutput?.sharedData || null;
  }

  /**
   * Filter applicable collaboration rules
   */
  private getApplicableRules(
    sharedData: SharedData,
    state: AgentGraphState
  ): CollaborationRule[] {
    const collaborationRules = this.getCollaborationRules();
    return collaborationRules.filter(rule =>
      rule.shouldExecute(sharedData, state.context?.intent, state.currentAgent)
    );
  }

  /**
   * Log collaboration start
   */
  private logCollaborationStart(
    sharedData: SharedData,
    state: AgentGraphState,
    applicableRules: CollaborationRule[]
  ): void {
    this.logger.info(
      {
        collaboration: 'Generic collaboration started',
        sharedData,
        currentAgent: state.currentAgent,
        intent: state.context?.intent,
        applicableRules: applicableRules.map(r => r.name),
      },
      'Executing generic collaboration with parallel support'
    );
  }

  /**
   * Execute collaboration strategy
   */
  private async executeCollaborationStrategy(
    state: AgentGraphState,
    rules: CollaborationRule[],
    strategy: ExecutionStrategy
  ): Promise<AgentGraphState> {
    switch (strategy.type) {
      case EXECUTION_STRATEGY.SEQUENTIAL:
        return await this.executeSequentialCollaboration(state, rules);
      case EXECUTION_STRATEGY.PARALLEL:
        return await this.executeParallelCollaboration(state, rules);
      case EXECUTION_STRATEGY.WINNER_TAKE_ALL:
        return await this.executeWinnerTakeAllCollaboration(state, rules);
      case EXECUTION_STRATEGY.ALL_FINISH_MERGE:
        return await this.executeAllFinishMergeCollaboration(state, rules);
      default:
        return await this.executeSequentialCollaboration(state, rules);
    }
  }

  /**
   * Determine execution strategy
   */
  private determineExecutionStrategy(
    rules: CollaborationRule[],
    state: AgentGraphState
  ): ExecutionStrategy {
    // Single rule -> sequential execution
    if (rules.length === 1) {
      return {
        type: EXECUTION_STRATEGY.SEQUENTIAL,
        reason: 'Single rule execution',
      };
    }

    // Mixed priorities -> winner-take-all
    if (this.hasMixedPriorities(rules)) {
      return {
        type: EXECUTION_STRATEGY.WINNER_TAKE_ALL,
        reason: 'Mixed priority rules',
      };
    }

    // Same priorities -> all-finish-merge
    if (this.hasSamePriority(rules)) {
      return {
        type: EXECUTION_STRATEGY.ALL_FINISH_MERGE,
        reason: 'Same priority rules',
      };
    }

    // Default: sequential execution
    return {
      type: EXECUTION_STRATEGY.SEQUENTIAL,
      reason: 'Default sequential execution',
    };
  }

  /**
   * Check for mixed priorities
   */
  private hasMixedPriorities(rules: CollaborationRule[]): boolean {
    const priorities = new Set(rules.map(r => r.priority));
    return priorities.size > 1;
  }

  /**
   * Check for same priorities
   */
  private hasSamePriority(rules: CollaborationRule[]): boolean {
    if (rules.length <= 1) return false;
    const firstPriority = rules[0]?.priority;
    return rules.every(r => r.priority === firstPriority);
  }

  /**
   * Sequential execution (original behavior)
   */
  private async executeSequentialCollaboration(
    state: AgentGraphState,
    rules: CollaborationRule[]
  ): Promise<AgentGraphState> {
    let currentState = state;
    const executedCollaborations: string[] = [];

    for (const rule of rules) {
      try {
        const result = await this.executeCollaborationRule(currentState, rule);
        currentState = result;
        executedCollaborations.push(
          `${state.currentAgent} -> ${rule.targetAgent}`
        );
      } catch (error) {
        this.logCollaborationRuleError(error, state, rule);
      }
    }

    this.logSequentialCollaborationCompletion(
      executedCollaborations,
      rules.length
    );
    return currentState;
  }

  /**
   * Log collaboration rule error
   */
  private logCollaborationRuleError(
    error: unknown,
    state: AgentGraphState,
    rule: CollaborationRule
  ): void {
    this.logger.warn(
      {
        collaboration: `${state.currentAgent} -> ${rule.targetAgent}`,
        error: error instanceof Error ? error.message : String(error),
        rule: rule.name,
      },
      `Collaboration rule failed: ${rule.name}, continuing with other rules`
    );
  }

  /**
   * Log sequential collaboration completion
   */
  private logSequentialCollaborationCompletion(
    executedCollaborations: string[],
    totalRules: number
  ): void {
    this.logger.info(
      {
        collaboration: 'Sequential collaboration completed',
        executedCollaborations,
        totalRules,
      },
      'Sequential collaboration completed'
    );
  }

  /**
   * Parallel execution (with semaphore control)
   */
  private async executeParallelCollaboration(
    state: AgentGraphState,
    rules: CollaborationRule[]
  ): Promise<AgentGraphState> {
    const semaphore = new Semaphore(SEMAPHORE_CONFIG.MAX_CONCURRENT_EXECUTIONS);
    const results: ParallelExecutionResult[] = [];

    const executeRule = async (rule: CollaborationRule) => {
      await semaphore.acquire();
      try {
        const result = await this.executeCollaborationRule(state, rule);
        results.push({ rule, result });
      } catch (error) {
        results.push({ rule, result: state, error: error as Error });
      } finally {
        semaphore.release();
      }
    };

    // Execute all rules in parallel
    await Promise.all(rules.map(executeRule));

    // Merge results
    const successfulResults = results.filter(r => !r.error);
    const mergedState = this.mergeCollaborationResults(
      state,
      successfulResults.map(r => r.result)
    );

    this.logParallelCollaborationCompletion(results, successfulResults.length);
    return mergedState;
  }

  /**
   * Log parallel collaboration completion
   */
  private logParallelCollaborationCompletion(
    results: ParallelExecutionResult[],
    successfulCount: number
  ): void {
    this.logger.info(
      {
        collaboration: 'Parallel collaboration completed',
        successful: successfulCount,
        failed: results.length - successfulCount,
        totalRules: results.length,
      },
      'Parallel collaboration completed'
    );
  }

  /**
   * Winner-take-all execution (first successful result wins)
   */
  private async executeWinnerTakeAllCollaboration(
    state: AgentGraphState,
    rules: CollaborationRule[]
  ): Promise<AgentGraphState> {
    const promises = rules.map(async rule => {
      try {
        const result = await this.executeCollaborationRule(state, rule);
        return { rule, result, success: true, error: undefined };
      } catch (error) {
        return { rule, result: state, success: false, error };
      }
    });

    // Wait for first successful result
    const results = await Promise.allSettled(promises);
    const successfulResult = this.findFirstSuccessfulResult(results);

    if (successfulResult) {
      this.logWinnerTakeAllSuccess(successfulResult.rule.name, rules.length);
      return successfulResult.result;
    }

    // Return original state if no successful result
    this.logWinnerTakeAllFailure(rules.length);
    return state;
  }

  /**
   * Find first successful result
   */
  private findFirstSuccessfulResult(
    results: PromiseSettledResult<CollaborationResult>[]
  ): CollaborationResult | null {
    const successfulResult = results.find(
      r => r.status === 'fulfilled' && r.value.success
    );

    return successfulResult && successfulResult.status === 'fulfilled'
      ? successfulResult.value
      : null;
  }

  /**
   * Log winner-take-all success
   */
  private logWinnerTakeAllSuccess(
    winnerName: string,
    totalRules: number
  ): void {
    this.logger.info(
      {
        collaboration: 'Winner-take-all completed',
        winner: winnerName,
        totalRules,
      },
      'Winner-take-all collaboration completed'
    );
  }

  /**
   * Log winner-take-all failure
   */
  private logWinnerTakeAllFailure(totalRules: number): void {
    this.logger.warn(
      {
        collaboration: 'Winner-take-all failed',
        totalRules,
      },
      'No successful collaboration found, returning original state'
    );
  }

  /**
   * All-finish-merge execution (wait for all, then merge)
   */
  private async executeAllFinishMergeCollaboration(
    state: AgentGraphState,
    rules: CollaborationRule[]
  ): Promise<AgentGraphState> {
    const promises = rules.map(async rule => {
      try {
        const result = await this.executeCollaborationRule(state, rule);
        return { rule, result, success: true, error: undefined };
      } catch (error) {
        return { rule, result: state, success: false, error };
      }
    });

    const results = await Promise.allSettled(promises);
    const successfulResults = this.extractSuccessfulResults(results);
    const mergedState = this.mergeCollaborationResults(
      state,
      successfulResults
    );

    this.logAllFinishMergeCompletion(successfulResults.length, rules.length);
    return mergedState;
  }

  /**
   * Extract successful results
   */
  private extractSuccessfulResults(
    results: PromiseSettledResult<CollaborationResult>[]
  ): AgentGraphState[] {
    return results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(
        r => (r as PromiseFulfilledResult<CollaborationResult>).value.result
      );
  }

  /**
   * Log all-finish-merge completion
   */
  private logAllFinishMergeCompletion(
    successfulCount: number,
    totalRules: number
  ): void {
    this.logger.info(
      {
        collaboration: 'All-finish-merge completed',
        successful: successfulCount,
        totalRules,
      },
      'All-finish-merge collaboration completed'
    );
  }

  /**
   * Execute single collaboration rule
   */
  private async executeCollaborationRule(
    state: AgentGraphState,
    rule: CollaborationRule
  ): Promise<AgentGraphState> {
    this.logCollaborationRuleStart(state, rule);
    // Ingest at rule boundary as well (A2A process, idempotent per run)
    await this.saveIfReportCandidateOnce(state);

    const nextState = this.createCollaborationState(state, rule);
    const result = await this.executeSpecializedAgent(nextState);

    this.logCollaborationRuleCompletion(state, rule);
    return result;
  }

  /**
   * Log collaboration rule start
   */
  private logCollaborationRuleStart(
    state: AgentGraphState,
    rule: CollaborationRule
  ): void {
    this.logger.info(
      {
        collaboration: `${state.currentAgent} -> ${rule.targetAgent}`,
        rule: rule.name,
        sharedData: (state.finalOutput as AgentResult)?.sharedData,
      },
      `Executing collaboration rule: ${rule.name}`
    );
  }

  /**
   * Create collaboration state
   */
  private createCollaborationState(
    state: AgentGraphState,
    rule: CollaborationRule
  ): AgentGraphState {
    return {
      ...state,
      currentAgent: rule.targetAgent,
      context: {
        ...state.context,
        sharedData: {
          ...(state.context?.sharedData || {}),
          ...(state.finalOutput as AgentResult)?.sharedData,
        },
      },
    };
  }

  /**
   * Log collaboration rule completion
   */
  private logCollaborationRuleCompletion(
    state: AgentGraphState,
    rule: CollaborationRule
  ): void {
    this.logger.info(
      {
        collaboration: `${state.currentAgent} -> ${rule.targetAgent}`,
        success: true,
        rule: rule.name,
      },
      `Collaboration rule completed: ${rule.name}`
    );
  }

  /**
   * Merge multiple collaboration results
   */
  private mergeCollaborationResults(
    originalState: AgentGraphState,
    results: AgentGraphState[]
  ): AgentGraphState {
    if (results.length === 0) {
      return originalState;
    }

    return results.reduce((mergedState, result) => {
      return this.mergeSingleResult(mergedState, result);
    }, originalState);
  }

  /**
   * Merge single result
   */
  private mergeSingleResult(
    mergedState: AgentGraphState,
    result: AgentGraphState
  ): AgentGraphState {
    return {
      ...mergedState,
      messages: [...(mergedState.messages || []), ...(result.messages || [])],
      context: {
        ...mergedState.context,
        ...result.context,
        sharedData: {
          ...(mergedState.context?.sharedData || {}),
          ...(result.context?.sharedData || {}),
          ...(result.finalOutput as AgentResult)?.sharedData,
        },
      },
    };
  }

  /**
   * Define collaboration rules (with priorities and costs)
   */
  private getCollaborationRules(): CollaborationRule[] {
    return [
      this.createNotificationToAppointmentRule(),
      this.createAppointmentToReportRule(),
    ];
  }

  /**
   * Create medication -> appointment rule
   */
  // medication-related collaboration removed after merge into notification

  /**
   * Create notification -> appointment rule
   */
  private createNotificationToAppointmentRule(): CollaborationRule {
    return {
      name: 'notification-to-appointment',
      priority: COLLABORATION_PRIORITY.HIGH,
      cost: 1,
      latency: 1000,
      targetAgent: 'appointment',
      shouldExecute: (sharedData, intent, currentAgent) => {
        // Only execute if notification agent was the current agent and appointment hasn't been executed yet
        return (
          currentAgent === 'notification' &&
          Boolean(sharedData?.notificationSchedule) &&
          !sharedData?.appointmentSchedule
        );
      },
    };
  }

  /**
   * Create appointment -> report rule
   */
  private createAppointmentToReportRule(): CollaborationRule {
    return {
      name: 'appointment-to-report',
      priority: COLLABORATION_PRIORITY.LOW,
      cost: 2,
      latency: 2000,
      targetAgent: 'report',
      shouldExecute: (sharedData, intent, currentAgent) => {
        // Only execute if appointment agent was the current agent and report hasn't been executed yet
        return (
          currentAgent === 'appointment' &&
          Boolean(sharedData?.appointmentSchedule) &&
          !sharedData?.reportSchedule
        );
      },
    };
  }

  /**
   * Create notification -> medication rule
   */
  // notification->medication rule removed after merge into notification

  /**
   * Send A2A message (direct agent-to-agent communication)
   */
  async sendMessage(from: string, to: string, content: unknown): Promise<void> {
    const message: AgentMessage = {
      from,
      to,
      type: 'notification',
      content,
      timestamp: new Date(),
      messageId: uuidv4(),
    };

    this.logger.info({ message }, `A2A message: ${from} -> ${to}`);
    // Note: sendMessage is A2A, not user-originated; no ingestion here
  }

  /**
   * Save user message to Supabase/Chroma if it meets report criteria.
   * Best-effort: failures are logged and ignored.
   */
  private async saveIfReportCandidateOnce(state: AgentGraphState) {
    const text = state.originalMessage;
    const userId = state.userId;
    const sessionId = state.sessionId;
    if (!text) return;
    const shouldIngest = await this.isReportCandidate(text);
    if (!shouldIngest) return;
    // Idempotency within a single graph run
    const already = (state.context?.sharedData as any)?.__reportIngested;
    if (already) return;
    const tsIso = new Date().toISOString();
    const category = this.deriveCategory(text);
    try {
      await saveInteractionTool(
        this.logger as FastifyBaseLogger,
        {
          user_id: userId || 'anonymous',
          session_id: sessionId || null,
          role: 'user',
          text,
          created_at: tsIso,
          category,
        } as any
      );
    } catch {}
    try {
      await saveToChromaTool(this.logger as FastifyBaseLogger, {
        collection: 'interactions',
        documents: [text],
        metadatas: [
          {
            userId: userId || 'anonymous',
            sessionId: sessionId || null,
            role: 'user',
            timestampISO: tsIso,
            category,
          },
        ],
      });
    } catch {}
    // Mark as ingested
    state.context = state.context || ({} as any);
    state.context.sharedData = {
      ...(state.context.sharedData || {}),
      __reportIngested: true,
    } as any;
  }

  private matchesReportCriteria(text: string): boolean {
    const t = text.toLowerCase();
    return /\b(cognitive|memory|brain|focus|mental|mood|anxiety|stress|physical|exercise|sleep|pain|bp|blood pressure|heart|summary|report|status)\b/.test(
      t
    );
  }

  /**
   * Decide with LLM if the message should be ingested for reporting.
   * Fallback to rule-based check on LLM failure.
   */
  private async isReportCandidate(text: string): Promise<boolean> {
    const system = `You decide if a user message should be stored for health reporting.
Return ONLY a compact JSON object with fields: {"ingest": true|false, "category": "cognitive|mental|physical|other", "confidence": 0..1}.
Ingest if the message contains health state signals (mental, cognitive, physical status, tone) or explicitly asks for a report/summary.`;
    const prompt = `${system}\n\nMessage: "${text}"\n\nJSON:`;
    try {
      const response = await this.llm.generate(prompt, { temperature: 0 });
      const parsed = JSON.parse(response || '{}');
      if (typeof parsed?.ingest === 'boolean') {
        return Boolean(parsed.ingest);
      }
      // If parsing ambiguous, fallback to rules
      return this.matchesReportCriteria(text);
    } catch {
      // On any LLM failure, fallback to rules
      return this.matchesReportCriteria(text);
    }
  }

  private deriveCategory(
    text: string
  ): 'cognitive' | 'mental' | 'physical' | 'other' {
    const t = text.toLowerCase();
    if (/(memory|focus|brain|cognitive)/.test(t)) return 'cognitive';
    if (/(mood|anxiety|stress|mental)/.test(t)) return 'mental';
    if (/(pain|sleep|exercise|physical|bp|blood pressure|heart)/.test(t))
      return 'physical';
    return 'other';
  }
}
