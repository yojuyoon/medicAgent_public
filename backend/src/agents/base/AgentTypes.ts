export type AgentMetadata = {
  timezone?: string;
  locale?: string;
  googleAccessToken?: string;
};

export type AgentInput = {
  userId: string;
  sessionId: string;
  message: string;
  metadata?: AgentMetadata;
  stream?: boolean;
  intent?: string;
  entities?: Record<string, unknown>;
};

export type AgentAction = {
  type: string;
  status?: 'pending' | 'done' | 'failed';
  payload?: Record<string, unknown>;
};

export type AgentOutput = {
  reply: string;
  route?: string;
  intent?: string;
  actions?: AgentAction[];
  followups?: { type: 'question' | 'confirm' | 'info'; text: string }[];
};
