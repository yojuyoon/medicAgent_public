import { supabase } from '@/lib/supabase';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export interface SignUpPayload {
  email: string;
  password: string;
  userData?: Record<string, any>;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export async function apiSignUp(payload: SignUpPayload) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to sign up');
  return json as { user: any };
}

export async function apiSignIn(payload: SignInPayload) {
  const res = await fetch(`${API_BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to sign in');
  return json as { user: any; session: any };
}

// After calling backend, set Supabase session in the browser
export async function setBrowserSession(session: any) {
  // If backend returns access_token/refresh_token, set it on the client
  if (!session) return;
  const { access_token, refresh_token } = session;
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
}

// ============== Agents API ==============
export type AgentChatRequest = {
  userId: string;
  sessionId: string;
  message: string;
  metadata?: {
    timezone?: string;
    locale?: string;
    googleAccessToken?: string;
  };
  stream?: boolean;
};

export type AgentChatResponse = {
  route: string;
  intent: string;
  reply: string;
  actions?: {
    type: string;
    status?: 'pending' | 'done' | 'failed';
    payload?: any;
  }[];
  followups?: { type: string; text: string }[];
};

export async function apiAgentChat(payload: AgentChatRequest) {
  if (payload.stream) {
    // Handle streaming response
    const response = await fetch(`${API_BASE}/agents/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      cache: 'no-store',
      keepalive: true,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to call Router Agent');
    }

    return response; // Return the response object for streaming
  }

  // Handle non-streaming response
  const res = await fetch(`${API_BASE}/agents/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to call Router Agent');
  return json as AgentChatResponse;
}
