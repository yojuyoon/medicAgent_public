'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          setError(error.message);
          setTimeout(() => {
            router.push('/signin');
          }, 3000);
          return;
        }

        if (data.session) {
          // Extract Google Calendar token from URL hash if available
          const urlHash = window.location.hash;
          const urlParams = new URLSearchParams(urlHash.substring(1));
          const googleToken = urlParams.get('access_token');

          if (googleToken) {
            // Store the Google Calendar token
            localStorage.setItem('google_calendar_token', googleToken);
            console.log('Google Calendar token stored successfully');
          }

          // Successful authentication
          router.push('/chat');
        } else {
          // No session found
          router.push('/signin');
        }
      } catch (err) {
        console.error('Unexpected error during auth callback:', err);
        setError('An unexpected error occurred');
        setTimeout(() => {
          router.push('/signin');
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Authentication Error
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Redirecting to sign in page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-blue-600 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Completing Authentication
        </h2>
        <p className="text-gray-600">
          Please wait while we complete your sign in...
        </p>
      </div>
    </div>
  );
}
