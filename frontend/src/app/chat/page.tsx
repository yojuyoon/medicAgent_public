'use client';
import { useState, useRef, useEffect } from 'react';
import { apiAgentChat } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarPermissionRequest } from '@/components';
import { checkCalendarPermissions } from '@/lib/supabase';
import {
  PaperAirplaneIcon,
  UserIcon,
  ChatBubbleOvalLeftEllipsisIcon,
} from '@heroicons/react/24/outline';

export default function ChatPage() {
  const { user, providerToken } = useAuth();
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [hasCalendarAccess, setHasCalendarAccess] = useState<boolean | null>(
    null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Check Calendar permissions
    const checkPermissions = async () => {
      if (user) {
        const { hasCalendarAccess } = await checkCalendarPermissions();
        setHasCalendarAccess(hasCalendarAccess);
      }
    };

    checkPermissions();
  }, [user]);

  async function send() {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user' as const, content: text };
    setMessages((m) => [...m, userMsg]);
    setText('');
    setIsLoading(true);

    const sessionId = 'chat-' + new Date().getTime();

    try {
      console.log('Sending chat request:', {
        userId: user?.id ?? 'anonymous',
        sessionId,
        message: userMsg.content,
        metadata: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          googleAccessToken: providerToken,
        },
        stream: false,
      });

      // Update loading message after a delay
      setTimeout(() => {
        if (isLoading) {
          setLoadingMessage('Checking calendar availability...');
        }
      }, 2000);

      const data = await apiAgentChat({
        userId: user?.id ?? 'anonymous',
        sessionId,
        message: userMsg.content,
        metadata: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          googleAccessToken: providerToken,
        },
        stream: true,
      });

      console.log('Received response (stream):', data);

      const reader = (data as Response).body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        // Display status messages in separate bubbles
        let showedStatus = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === 'status') {
                // Show status text in bubble only once
                if (!showedStatus) {
                  setMessages((m) => [
                    ...m,
                    {
                      role: 'assistant',
                      content: String(evt.message ?? 'Processing...'),
                    },
                  ]);
                  showedStatus = true;
                } else {
                  setLoadingMessage(String(evt.message ?? 'Processing...'));
                }
              } else if (evt.type === 'result') {
                setMessages((m) => [
                  ...m,
                  {
                    role: 'assistant',
                    content: evt.data?.reply ?? '(no reply)',
                  },
                ]);
              } else if (evt.type === 'error') {
                throw new Error(evt.error || 'Unknown streaming error');
              }
            } catch (e) {
              console.warn('Failed to parse SSE line:', line, e);
            }
          }
        }
      } else {
        // Fallback when streaming is not supported
        const nonStream = await apiAgentChat({
          userId: user?.id ?? 'anonymous',
          sessionId,
          message: userMsg.content,
          metadata: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            googleAccessToken: providerToken,
          },
          stream: false,
        });
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: (nonStream as any).reply ?? '(no reply)',
          },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);

      // More detailed error handling
      let errorMessage = 'Sorry, I encountered an error. Please try again.';

      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage =
            'Unable to connect to the server. Please check your internet connection and try again.';
        } else if (error.message.includes('NetworkError')) {
          errorMessage =
            'Network error occurred. Please check your connection and try again.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }

      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-4xl mx-auto p-6 pt-8">
        <div ref={messagesEndRef} />
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium mb-4">
            <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
            AI-Powered Medical Assistant
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Health Assistant
          </h1>
          <p className="text-gray-600 max-w-md mx-auto">
            Get instant medical guidance and health recommendations powered by
            advanced AI technology
          </p>
        </div>

        {/* Chat Container */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Messages Area */}
          <div className="h-96 overflow-y-auto p-6 space-y-4">
            {/* Calendar Permission Request */}
            {user && hasCalendarAccess === false && (
              <CalendarPermissionRequest
                onPermissionGranted={() => setHasCalendarAccess(true)}
              />
            )}

            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ChatBubbleOvalLeftEllipsisIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Welcome to your Health Assistant
                </h3>
                <p className="text-gray-500">
                  Ask me anything about your health, symptoms, or medical
                  concerns.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`flex items-start gap-3 max-w-xs lg:max-w-md ${
                    m.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <UserIcon className="w-4 h-4" />
                    ) : (
                      <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div
                    className={`px-4 py-3 rounded-2xl shadow-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-3 max-w-xs lg:max-w-md">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.1s' }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600">
                        {loadingMessage}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-100 bg-gray-50/50 p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  className="w-full border-0 bg-white rounded-xl px-4 py-3 pr-12 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 shadow-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your health question here..."
                  disabled={isLoading}
                />
                <button
                  onClick={send}
                  disabled={!text.trim() || isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={send}
                disabled={!text.trim() || isLoading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-all duration-200 transform hover:scale-105 disabled:transform-none shadow-lg hover:shadow-xl"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Your conversations are private and secure. This is a research
            project by UTS.
          </p>
        </div>
      </div>
    </div>
  );
}
