'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { clearStoredAuth } from '@/lib/api';

export interface NavItem {
  id: string;
  label: string;
}

// EXACT LOCKED ROLE NAVIGATION
export const LOCKED_ROLE_NAVIGATION: Record<'ADMIN' | 'INTERVIEWER' | 'CANDIDATE', NavItem[]> = {
  ADMIN: [
    { id: 'Dashboard', label: 'Dashboard' },
    { id: 'Placement Drives', label: 'Placement Drives' },
    { id: 'Manage Candidates', label: 'Manage Candidates' },
    { id: 'Interview Scheduling', label: 'Interview Scheduling' },
    { id: 'Rooms', label: 'Rooms' },
    { id: 'Interviewer Availability', label: 'Interviewer Availability' },
    { id: 'Profile', label: 'Profile' },
  ],
  INTERVIEWER: [
    { id: 'Dashboard', label: 'Dashboard' },
    { id: 'My Calendar', label: 'My Calendar' },
    { id: 'Availability', label: 'Availability' },
    { id: 'Feedback', label: 'Feedback' },
    { id: 'Profile', label: 'Profile' },
  ],
  CANDIDATE: [
    { id: 'Dashboard', label: 'Dashboard' },
    { id: 'My Interviews', label: 'My Interviews' },
    { id: 'Availability / Booking', label: 'Availability / Booking' },
    { id: 'Profile', label: 'Profile' },
  ],
};

interface ApplicationShellProps {
  role: 'ADMIN' | 'INTERVIEWER' | 'CANDIDATE';
  userName: string;
  userEmail: string;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  children: React.ReactNode;
}

export function ApplicationShell({
  role,
  userName,
  userEmail,
  activeTab,
  onSelectTab,
  children,
}: ApplicationShellProps) {
  const router = useRouter();
  const navItems = LOCKED_ROLE_NAVIGATION[role];

  const roleDisplayLabel =
    role === 'ADMIN'
      ? 'Admin / Placement Coordinator'
      : role === 'INTERVIEWER'
      ? 'Interviewer'
      : 'Candidate';

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = () => {
    clearStoredAuth();
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-neutral-50 text-neutral-950">
      {/* MONOCHROME SIDEBAR */}
      <aside className="w-full lg:w-[252px] bg-neutral-950 text-neutral-400 flex flex-col justify-between shrink-0 border-r border-neutral-800 select-none">
        <div>
          {/* Brand Header */}
          <button
            type="button"
            onClick={() => {
              const target =
                role === 'ADMIN'
                  ? '/admin'
                  : role === 'INTERVIEWER'
                  ? '/interviewer'
                  : role === 'CANDIDATE'
                  ? '/candidate'
                  : '/';
              router.push(target);
            }}
            className="w-full text-left px-5 pt-6 pb-6 flex items-center gap-3 border-b border-neutral-900 hover:bg-neutral-900/60 transition cursor-pointer group"
            aria-label="TIMORA Home - Go to Dashboard"
          >
            <div className="w-7 h-7 rounded bg-white text-neutral-950 flex items-center justify-center font-mono font-bold text-xs group-hover:scale-105 transition-transform">
              T
            </div>
            <div>
              <div className="font-bold tracking-[0.18em] text-[13px] text-white uppercase group-hover:text-neutral-200 transition-colors">
                TIMORA
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                CSP Recruitment Scheduler
              </div>
            </div>
          </button>

          {/* Role-Locked Navigation Links */}
          <nav className="px-3 py-4 space-y-1 text-[13px]" aria-label="Main Sidebar Navigation">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full text-left flex items-center justify-between px-3.5 py-2.5 rounded-md transition font-medium ${
                    isActive
                      ? 'bg-white text-neutral-950 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Identity & Sign Out */}
        <div className="border-t border-neutral-900 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-neutral-800 text-white text-xs font-mono font-bold flex items-center justify-center shrink-0 border border-neutral-700">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{userName}</p>
              <p className="text-[11px] text-neutral-500 truncate">{userEmail}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-neutral-800 text-[12.5px] font-medium text-neutral-300 hover:bg-white hover:text-neutral-950 transition"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* RIGHT WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-neutral-200 px-6 sm:px-8 flex items-center justify-between shrink-0">
          <div className="text-xs text-neutral-500">
            Role: <span className="font-semibold text-neutral-950">{roleDisplayLabel}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('Profile')}
              className="px-3 py-1.5 rounded bg-neutral-950 text-white hover:bg-neutral-800 text-xs font-medium transition"
            >
              Profile
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 sm:px-8 py-7 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

