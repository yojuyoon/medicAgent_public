'use client';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { signInWithGoogleCalendar } from '@/lib/supabase';

export default function MyPage() {
  const { user, providerToken } = useAuth();
  const [events, setEvents] = useState<
    {
      id: string;
      title: string;
      start: string;
      end: string;
      location?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const base =
          process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

        if (!providerToken) {
          console.error(
            'No Google OAuth token available. Please sign in with Google.'
          );
          return;
        }

        const res = await fetch(`${base}/calendar/events`, {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
        });
        const json = await res.json();
        setEvents(json.events ?? []);
      } catch (e) {
        console.error('Failed to load events', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [providerToken]);

  return (
    <ProtectedRoute>
      <main className="mx-auto p-6 h-[800px] bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6 text-neutral-900">
            My Page
          </h1>

          <section className="bg-white shadow-sm border rounded-lg p-5 mb-6">
            <h2 className="text-lg font-medium mb-3 text-neutral-900">
              Profile
            </h2>
            <div className="space-y-1 text-sm text-gray-700">
              <div>
                <span className="font-semibold">Email:</span> {user?.email}
              </div>
              <div>
                <span className="font-semibold">Name:</span>{' '}
                {user?.user_metadata?.full_name || '—'}
              </div>
              <div>
                <span className="font-semibold">User ID:</span> {user?.id}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Link
              href="/chat"
              className="block bg-blue-600 hover:bg-blue-700 text-white text-center rounded-lg p-4 transition-colors"
            >
              Open Chat
            </Link>
            <Link
              href="/reports"
              className="block bg-gray-900 hover:bg-black text-white text-center rounded-lg p-4 transition-colors"
            >
              View Reports
            </Link>
          </section>

          <section className="bg-white shadow-sm border rounded-lg p-5">
            <h2 className="text-lg font-medium mb-3 text-neutral-900">
              Upcoming Calendar Events
            </h2>
            {!providerToken ? (
              <div className="text-center py-6">
                <div className="text-gray-600 text-sm mb-4">
                  Google Calendar access is required to view your events.
                </div>
                <button
                  onClick={() => signInWithGoogleCalendar()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Sign in with Google Calendar
                </button>
              </div>
            ) : loading ? (
              <div className="text-gray-600 text-sm">Loading events…</div>
            ) : events.length === 0 ? (
              <div className="text-gray-600 text-sm">No events found.</div>
            ) : (
              <ul className="divide-y">
                {events.map((ev) => (
                  <li key={ev.id} className="py-3">
                    <div className="font-medium text-gray-900">{ev.title}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(ev.start).toLocaleString()} –{' '}
                      {new Date(ev.end).toLocaleString()}
                    </div>
                    {ev.location ? (
                      <div className="text-sm text-gray-600">{ev.location}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
