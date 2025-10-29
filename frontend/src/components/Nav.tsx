'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { UserCircleIcon } from '@heroicons/react/16/solid';
import { signInWithGoogleCalendar } from '@/lib/supabase';

const Nav = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await signInWithGoogleCalendar();
      if (error) {
        console.error('Google sign in error:', error);
      }
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  };

  return (
    <nav className="bg-white shadow-lg border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <Image src="/logo.svg" alt="logo" width={32} height={32} />
              <span className="ml-2 text-xl font-semibold text-gray-900">
                MedicAgent
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <Link
                href="/"
                className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Home
              </Link>
              <Link
                href="/chat"
                className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Chat
              </Link>
              <Link
                href="/about"
                className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                About
              </Link>
              <Link
                href="/contact"
                className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Contact
              </Link>
            </div>
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            {user ? (
              <div className="flex items-center space-x-4">
                <Link href="/mypage" className="inline-flex items-center">
                  <UserCircleIcon className="h-7 w-7 text-gray-500" />
                </Link>
                <button
                  onClick={handleSignOut}
                  className="bg-red-400 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer"
              >
                Sign in with Google
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {/* Icon when menu is closed */}
              <svg
                className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              {/* Icon when menu is open */}
              <svg
                className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-100">
          <Link
            href="/"
            className="text-gray-900 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/chat"
            className="text-gray-900 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMenuOpen(false)}
          >
            Chat
          </Link>
          <Link
            href="/mypage"
            className="text-gray-900 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMenuOpen(false)}
          >
            My Page
          </Link>
          <Link
            href="/about"
            className="text-gray-900 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMenuOpen(false)}
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-gray-900 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMenuOpen(false)}
          >
            Contact
          </Link>
          <div className="pt-4 pb-3 border-t border-gray-200">
            {user ? (
              <div className="space-y-3">
                <Link
                  href="/mypage"
                  className="flex items-center gap-2 px-3 py-2 text-gray-900 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <UserCircleIcon className="h-6 w-6" />
                  <span>My Page</span>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full bg-red-400 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 block text-center"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Nav;
