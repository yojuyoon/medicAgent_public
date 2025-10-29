'use client';

import { useState } from 'react';
import { signInWithGoogleCalendar } from '@/lib/supabase';
import { CalendarIcon } from '@heroicons/react/24/outline';

interface CalendarPermissionRequestProps {
  onPermissionGranted?: () => void;
}

export const CalendarPermissionRequest = ({
  onPermissionGranted,
}: CalendarPermissionRequestProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectCalendar = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogleCalendar();
      if (error) {
        console.error('Calendar connection error:', error);
        alert('Failed to connect Google Calendar. Please try again.');
      }
      // Redirected to callback on success
    } catch (error) {
      console.error('Calendar connection error:', error);
      alert('Failed to connect Google Calendar. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <CalendarIcon className="w-6 h-6 text-blue-600 mt-1 mr-3" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-blue-800 mb-1">
            Connect Google Calendar
          </h3>
          <p className="text-sm text-blue-700 mb-3">
            To manage your appointments, please connect your Google Calendar.
            This will allow me to check your availability and book appointments
            directly.
          </p>
          <button
            onClick={handleConnectCalendar}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <CalendarIcon className="w-4 h-4 mr-2" />
                Connect Google Calendar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
