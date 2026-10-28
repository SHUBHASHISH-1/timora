'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setStoredAuth } from '@/lib/api';

type RoleOption = 'CANDIDATE' | 'INTERVIEWER' | 'ADMIN';

const DEMO_CREDENTIALS: Record<RoleOption, { email: string; label: string }> = {
  CANDIDATE: { email: 'aarav@timora.dev', label: 'Candidate' },
  INTERVIEWER: { email: 'leena@timora.dev', label: 'Interviewer' },
  ADMIN: { email: 'officer@timora.dev', label: 'Admin / Coordinator' },
};

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleOption>('ADMIN');
  const [email, setEmail] = useState(DEMO_CREDENTIALS.ADMIN.email);
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectRole = (role: RoleOption) => {
    setSelectedRole(role);
    setEmail(DEMO_CREDENTIALS[role].email);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch<{
        token: string;
        user: { userId: string; email: string; name: string; role: RoleOption };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: selectedRole }),
      });

      setStoredAuth(res.token, res.user);
      if (res.user.role === 'ADMIN') router.push('/admin');
      else if (res.user.role === 'INTERVIEWER') router.push('/interviewer');
      else router.push('/candidate');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white text-neutral-950">
      {/* LEFT PANEL: Monochrome Branding & Constraint Matrix */}
      <aside className="w-full lg:w-1/2 bg-neutral-950 text-white flex flex-col justify-between px-8 py-10 sm:px-14 lg:px-16 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white text-neutral-950 flex items-center justify-center font-mono font-bold text-sm">
            T
          </div>
          <span className="font-bold tracking-[0.18em] text-sm uppercase">TIMORA</span>
        </div>

        <div className="my-12 lg:my-auto max-w-[490px]">
          <p className="text-xs font-mono uppercase tracking-widest text-neutral-400 mb-3">
            Constraint-Satisfaction Recruitment Scheduler
          </p>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-white leading-[1.3] mb-4">
            Conflict-free interview schedules for campus placement drives.
          </h1>
          <p className="text-neutral-400 text-sm sm:text-[15px] leading-[1.65] mb-9">
            Collect availability, match interviewer skills, enforce room capacities and round prerequisites via MRV backtracking, publish validated timetables, and recover from last-minute cancellations automatically.
          </p>

          {/* Monochrome 6x4 Schedule Slot Matrix */}
          <div className="grid grid-cols-6 gap-2.5">
            {Array.from({ length: 24 }).map((_, i) => {
              const variant = i % 4;
              return (
                <div
                  key={i}
                  className={`h-10 rounded ${
                    variant === 0
                      ? 'bg-white'
                      : variant === 1
                      ? 'bg-neutral-600'
                      : variant === 2
                      ? 'bg-neutral-800'
                      : 'border border-dashed border-neutral-700 bg-neutral-900/50'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="text-xs text-neutral-500 font-mono">
          Next.js · Express · MongoDB · Deterministic CSP Engine · Live Schedule Sync
        </div>
      </aside>

      {/* RIGHT PANEL: Sign In Form */}
      <main className="w-full lg:w-1/2 bg-white flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[410px]">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-950 tracking-tight mb-1.5">
              Sign in to Timora
            </h2>
            <p className="text-sm text-neutral-500">
              Select your role and sign in with your institute credentials.
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-neutral-800 mb-2">
              Select Role
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-100 rounded-lg border border-neutral-200">
              {(['CANDIDATE', 'INTERVIEWER', 'ADMIN'] as RoleOption[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSelectRole(r)}
                  className={`py-2 px-2 text-xs rounded-md transition ${
                    selectedRole === r
                      ? 'bg-neutral-950 text-white font-semibold shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-950 font-medium'
                  }`}
                >
                  {DEMO_CREDENTIALS[r].label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="email" className="block text-xs font-semibold text-neutral-800">
                  Email Address
                </label>
                <span className="text-[11px] font-mono bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded border border-neutral-200">
                  {DEMO_CREDENTIALS[selectedRole].label}
                </span>
              </div>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3.5 rounded-md border border-neutral-300 text-sm text-neutral-950 focus:outline-none focus:border-neutral-950"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3.5 rounded-md border border-neutral-300 text-sm text-neutral-950 focus:outline-none focus:border-neutral-950"
              />
            </div>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold text-sm rounded-md transition"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 p-3.5 rounded-md bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <p className="font-semibold text-neutral-900">Quick Demo Accounts (Password: password123)</p>
            <p className="font-mono">Admin: officer@timora.dev</p>
            <p className="font-mono">Interviewer: leena@timora.dev</p>
            <p className="font-mono">Candidate: aarav@timora.dev</p>
          </div>
        </div>
      </main>
    </div>
  );
}

