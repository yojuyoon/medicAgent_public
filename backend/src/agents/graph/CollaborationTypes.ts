import type { AgentGraphState } from './AgentGraphTypes.js';

// Collaboration rule type definition
export interface CollaborationRule {
  name: string;
  priority: 'high' | 'medium' | 'low';
  cost: number;
  latency: number;
  targetAgent: string;
  shouldExecute: (
    sharedData: SharedData,
    intent?: string,
    currentAgent?: string
  ) => boolean;
}

// Shared data type definition
export interface SharedData {
  medicationSchedule?: MedicationSchedule;
  notificationSchedule?: NotificationSchedule;
  calendarReminder?: boolean;
  [key: string]: unknown;
}

// Medication schedule type
export interface MedicationSchedule {
  jobId: string;
  plan: any; // TODO: Define specific type
  medicationId: string;
  userId: string;
  message: string;
  timestamp: string;
}

// Notification schedule type
export interface NotificationSchedule {
  jobId: string;
  plan: any; // TODO: Define specific type
  notificationId: string;
  userId: string;
  message: string;
  timestamp: string;
}

// Execution strategy type
export interface ExecutionStrategy {
  type: 'sequential' | 'parallel' | 'winner-take-all' | 'all-finish-merge';
  reason: string;
}

// Collaboration result type
export interface CollaborationResult {
  rule: CollaborationRule;
  result: AgentGraphState;
  success: boolean;
  error?: unknown;
}

// Parallel execution result type
export interface ParallelExecutionResult {
  rule: CollaborationRule;
  result: AgentGraphState;
  error?: Error;
}

// Timeline entry type
export interface TimelineEntry {
  step: string;
  ms: number;
  intent?: string;
  route?: string;
  usage?: {
    totalTokens?: number;
  };
}

// Usage information type
export interface UsageInfo {
  totalTokens?: number;
}

// Agent result type
export interface AgentResult {
  reply: string;
  actions: Array<{
    type: string;
    status: 'pending' | 'done' | 'failed';
    payload?: any;
  }>;
  followups?: Array<{
    type: 'question' | 'confirm' | 'info';
    text: string;
  }>;
  sharedData?: SharedData;
  usageTotalTokens?: number;
}

// Router result type
export interface RouterResult {
  intent: string;
  entities: Record<string, any>;
  route: string;
  usageTotalTokens?: number;
}

// Agent input type
export interface AgentInput {
  userId: string;
  sessionId: string;
  message: string;
  metadata?: any;
  intent?: string;
  entities?: Record<string, any>;
}

// Collaboration context type
export interface CollaborationContext {
  sharedData: SharedData;
  intent?: string;
  entities?: Record<string, any>;
}

// Semaphore configuration constants
export const SEMAPHORE_CONFIG = {
  MAX_CONCURRENT_EXECUTIONS: 2,
} as const;

// Collaboration priority constants
export const COLLABORATION_PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

// Execution strategy constants
export const EXECUTION_STRATEGY = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  WINNER_TAKE_ALL: 'winner-take-all',
  ALL_FINISH_MERGE: 'all-finish-merge',
} as const;
