'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  supabase,
  getCurrentUser,
  getSession,
  getGoogleCalendarToken,
  storeGoogleCalendarToken,
} from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  accessToken: string | null;
  providerToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { session } = await getSession();
        setSession(session);
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);

        // Get Google Calendar token from multiple sources
        const googleToken = await getGoogleCalendarToken();
        setProviderToken(googleToken);

        if (typeof window !== 'undefined') {
          (window as any).supabaseAccessToken = session?.access_token;
          (window as any).googleAccessToken = googleToken;
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Handle URL hash for OAuth callback
    const handleUrlHash = async () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        // Let Supabase handle the OAuth callback
        const { session } = await supabase.auth.getSession();
        if (session) {
          setSession(session);
          setUser(session?.user ?? null);
          setAccessToken(session?.access_token ?? null);

          // Get Google Calendar token from multiple sources
          const googleToken = await getGoogleCalendarToken();
          setProviderToken(googleToken);

          if (typeof window !== 'undefined') {
            (window as any).supabaseAccessToken = session?.access_token;
            (window as any).googleAccessToken = googleToken;
          }
        }
      }
    };

    handleUrlHash();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);

      // Get Google Calendar token from multiple sources
      const googleToken = await getGoogleCalendarToken();
      setProviderToken(googleToken);

      if (typeof window !== 'undefined') {
        (window as any).supabaseAccessToken = session?.access_token;
        (window as any).googleAccessToken = googleToken;
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut: handleSignOut,
    accessToken,
    providerToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
