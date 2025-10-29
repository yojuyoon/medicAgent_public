import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Service-role key is server-only (full access). Protect this file.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);

// Anon client for user email/password auth flows handled by backend
export const supabaseAnon = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
  }
);

export async function pingSupabase() {
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (error) {
      throw new Error(`Supabase DB failed to connect: ${error.message}`);
    }

    return { connected: true, message: 'Supabase DB connected' };
  } catch (err) {
    return {
      connected: false,
      message: `Supabase DB failed to connect: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`,
    };
  }
}
