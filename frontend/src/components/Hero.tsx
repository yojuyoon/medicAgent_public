'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckBadgeIcon,
  CheckIcon,
} from '@heroicons/react/16/solid';
import {
  CheckCircleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/20/solid';

const Hero = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
                <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                AI-Powered Medical Assistant
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Your Personal
                <span className="block text-blue-600">Medical Assistant</span>
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                Get instant medical guidance, symptom analysis, and health
                recommendations powered by advanced AI technology. Your health
                companion, available 24/7.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/chat"
                className={`inline-flex items-center justify-center px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-300 transform ${
                  isHovered
                    ? 'bg-blue-700 shadow-xl scale-105'
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
                }`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                Start Chat Now
                <ArrowRightIcon className="w-5 h-5 ml-2" />
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center space-x-8 pt-8">
              <div className="flex items-center space-x-2">
                <div className="flex -space-x-1">
                  <CheckCircleIcon className="w-6 h-6 text-blue-500" />
                </div>
                <span className="text-sm text-gray-600">
                  UTS Research Project
                </span>
              </div>
            </div>
          </div>

          {/* Right side - Visual */}
          <div className="relative">
            <div className="relative z-10">
              {/* Main illustration */}
              <div className="relative bg-white rounded-2xl shadow-2xl p-8 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-blue-500">
                      <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold">AI Medical Assistant</h3>
                      <p className="text-sm opacity-90">
                        Online • 24/7 Available
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white bg-opacity-20 rounded-lg p-3 text-neutral-900">
                      <p className="text-sm">
                        Hello! I'm here to help with your health questions. What
                        can I assist you with today?
                      </p>
                    </div>

                    <div className="bg-blue-400 rounded-lg p-3 ml-8">
                      <p className="text-sm">
                        I've been having headaches for the past few days...
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <div className="absolute -top-4 -right-4 bg-green-100 rounded-full p-4 shadow-lg">
                <CheckBadgeIcon className="w-6 h-6 text-green-600" />
              </div>

              <div className="absolute -bottom-4 -left-4 bg-orange-100 rounded-full p-4 shadow-lg">
                <ShieldExclamationIcon className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
