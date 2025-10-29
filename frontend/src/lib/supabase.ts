import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Email/password auth is handled by backend API
// Social auth functions remain on frontend

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes:
        'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
    },
  });
  return { data, error };
};

// Separate login function for Calendar permissions
export const signInWithGoogleCalendar = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes:
        'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      skipBrowserRedirect: false,
    },
  });
  return { data, error };
};

// Check user's current permissions
export const checkCalendarPermissions = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return { hasCalendarAccess: false };
  }

  try {
    // Check permissions with a simple Google Calendar API call
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
      {
        headers: {
          Authorization: `Bearer ${session.provider_token}`,
        },
      }
    );

    return { hasCalendarAccess: response.ok };
  } catch (error) {
    return { hasCalendarAccess: false };
  }
};

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
};

export const getSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  return { session, error };
};

// Get Google Calendar access token from localStorage or session
export const getGoogleCalendarToken = async (): Promise<string | null> => {
  try {
    // First try to get from session
    const { session } = await getSession();
    if (session?.provider_token) {
      return session.provider_token;
    }

    // If not in session, try to get from localStorage
    const storedToken = localStorage.getItem('google_calendar_token');
    if (storedToken) {
      return storedToken;
    }

    return null;
  } catch (error) {
    console.error('Error getting Google Calendar token:', error);
    return null;
  }
};

// Store Google Calendar access token
export const storeGoogleCalendarToken = (token: string) => {
  try {
    localStorage.setItem('google_calendar_token', token);
  } catch (error) {
    console.error('Error storing Google Calendar token:', error);
  }
};
