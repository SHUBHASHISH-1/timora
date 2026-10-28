'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ApplicationShell } from '@/components/ApplicationShell';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { apiFetch, getStoredToken } from '@/lib/api';

export default function InterviewerPortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Dashboard Toggle: 'Upcoming' vs 'Completed' (per Sketch WhatsApp Image 2026-10-26 at 20.23.10)
  const [listFilter, setListFilter] = useState<'UPCOMING' | 'COMPLETED'>('UPCOMING');

  // Availability Update State
  const [availDate, setAvailDate] = useState('2026-10-28');
  const [availStartTime, setAvailStartTime] = useState('09:00');
  const [availEndTime, setAvailEndTime] = useState('17:00');

  // Emergency Cancellation Modal State
  const [cancelModalSession, setCancelModalSession] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('Flight delayed / Urgent medical conflict');
  const [cancelling, setCancelling] = useState(false);

  // Live Rubric Evaluation Modal State
  const [feedbackSession, setFeedbackSession] = useState<any>(null);
  const [scoreProblemSolving, setScoreProblemSolving] = useState(85);
  const [scoreTechDepth, setScoreTechDepth] = useState(80);
  const [scoreCommunication, setScoreCommunication] = useState(85);
  const [recommendation, setRecommendation] = useState<'STRONG_HIRE' | 'HIRE' | 'HOLD' | 'NO_HIRE'>('HIRE');
  const [strengths, setStrengths] = useState('Strong data structures foundations, clean modular algorithmic coding.');
  const [improvements, setImprovements] = useState('Could optimize space complexity from O(N) to O(1) in round 2.');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Profile Form State
  const [profileName, setProfileName] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileDept, setProfileDept] = useState('');
  const [profileMaxPerDay, setProfileMaxPerDay] = useState(6);
  const [profileSkills, setProfileSkills] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [meRes, dashRes] = await Promise.all([
        apiFetch('/auth/me'),
        apiFetch('/interviewer/dashboard'),
      ]);

      if (meRes.user.role !== 'INTERVIEWER') {
        router.push('/');
        return;
      }

      setUser(meRes.user);
      setProfileName(meRes.user.name);
      setProfileCompany(dashRes.profile?.company || 'Northwind Labs');
      setProfileDept(dashRes.profile?.department || 'Core Engineering');
      setProfileMaxPerDay(dashRes.profile?.maxInterviewsPerDay || 6);
      setProfileSkills((dashRes.profile?.skills || []).join(', '));
      setDashboardData(dashRes);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startMs = new Date(`${availDate}T${availStartTime}:00.000Z`).getTime();
      const endMs = new Date(`${availDate}T${availEndTime}:00.000Z`).getTime();

      await apiFetch('/availability', {
        method: 'PUT',
        body: JSON.stringify({
          windows: [{ startMs, endMs }],
        }),
      });

      setActionMessage('Availability schedule updated successfully.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCancelAndRepair = async () => {
    if (!cancelModalSession) return;
    setCancelling(true);
    try {
      const res = await apiFetch(`/sessions/${cancelModalSession._id}/cancel-and-repair`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (res.repaired) {
        setActionMessage(
          `Emergency cancellation handled! Automated Rescheduling Engine isolated the slot and completed an ${res.strategy}. Candidate was not dropped.`
        );
      } else {
        setActionMessage(
          `Session marked Cancelled. Solver could not find an immediate replacement: ${res.blockingReason}`
        );
      }
      setCancelModalSession(null);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackSession) return;
    setSubmittingFeedback(true);
    try {
      const res = await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: feedbackSession._id,
          problemSolvingScore: Number(scoreProblemSolving),
          technicalDepthScore: Number(scoreTechDepth),
          communicationScore: Number(scoreCommunication),
          recommendation,
          strengths,
          improvements,
        }),
      });

      setActionMessage(
        `Feedback submitted for ${feedbackSession.candidateName}! Overall score: ${res.feedback.overallScore}/100. Status: ${res.nextStageLabel}`
      );
      setFeedbackSession(null);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileName,
          company: profileCompany,
          department: profileDept,
          maxInterviewsPerDay: Number(profileMaxPerDay),
          skills: profileSkills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setActionMessage('Profile credentials updated.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  if (loading || !user || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-sm font-mono text-neutral-600">
        Loading Timora Interviewer Workspace...
      </div>
    );
  }

  const upcomingSessions = dashboardData.sessions.filter(
    (s: any) => s.status === 'Scheduled'
  );
  const completedSessions = dashboardData.sessions.filter(
    (s: any) => s.status === 'Completed'
  );

  const nearestInterview = upcomingSessions[0] || null;

  return (
    <ApplicationShell
      role="INTERVIEWER"
      userName={user.name}
      userEmail={user.email}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {/* Action and Error Feedback Banners */}
      {actionMessage && (
        <div className="mb-5 p-3.5 rounded-md bg-neutral-900 text-white text-xs font-mono flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage('')} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-md bg-red-50 border border-red-300 text-red-900 text-xs font-medium flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== TAB 1: DASHBOARD ==================== */}
      {/* Matches WhatsApp Image 2026-10-26 at 20.23.10.jpeg */}
      {activeTab === 'Dashboard' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-950 tracking-tight">
              Welcome back, {user.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-neutral-500">
              Interviewer Panel Dashboard · {dashboardData.profile?.company || 'Corporate Partner'}
            </p>
          </div>

          {/* Top Nearest Interview Banner */}
          {nearestInterview ? (
            <div className="bg-neutral-950 text-white rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  UPCOMING INTERVIEW / NEAREST
                </p>
                <h2 className="text-xl font-bold mt-1 text-white">
                  {nearestInterview.roundName} with {nearestInterview.candidateName}
                </h2>
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-neutral-300">
                  <span>Venue: {nearestInterview.roomName}</span>
                  <span>
                    Time: {new Date(nearestInterview.startMs).toISOString().slice(11, 16)}–
                    {new Date(nearestInterview.endMs).toISOString().slice(11, 16)} UTC
                  </span>
                  <span>Drive: {nearestInterview.companyName}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFeedbackSession(nearestInterview)}
                  className="px-4 py-2 rounded bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-100 transition"
                >
                  Score Rubric
                </button>
                <button
                  onClick={() => setCancelModalSession(nearestInterview)}
                  className="px-4 py-2 rounded border border-neutral-700 text-neutral-300 text-xs font-medium hover:bg-neutral-800 transition"
                >
                  Emergency Cancellation
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-lg p-6 text-center text-xs text-neutral-500">
              No upcoming interviews scheduled for your panel at this time.
            </div>
          )}

          {/* Upcoming & Completed Toggles (from sketch) */}
          <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setListFilter('UPCOMING')}
                  className={`px-3.5 py-1.5 rounded text-xs font-semibold transition ${
                    listFilter === 'UPCOMING'
                      ? 'bg-neutral-950 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  Upcoming ({upcomingSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setListFilter('COMPLETED')}
                  className={`px-3.5 py-1.5 rounded text-xs font-semibold transition ${
                    listFilter === 'COMPLETED'
                      ? 'bg-neutral-950 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  Completed ({completedSessions.length})
                </button>
              </div>

              <span className="text-xs text-neutral-500 font-mono">
                Ordered sequentially by interview slot time
              </span>
            </div>

            {/* Time-Ordered List (from sketch: 1., 2., 3. According to time) */}
            <div className="divide-y divide-neutral-100">
              {(listFilter === 'UPCOMING' ? upcomingSessions : completedSessions).length === 0 ? (
                <p className="text-xs text-neutral-500 py-6 text-center">
                  No {listFilter.toLowerCase()} interviews found.
                </p>
              ) : (
                (listFilter === 'UPCOMING' ? upcomingSessions : completedSessions).map(
                  (s: any, idx: number) => (
                    <div
                      key={s._id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded bg-neutral-100 font-mono text-xs font-bold text-neutral-700 flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-neutral-950">{s.roundName}</p>
                            <span className="text-xs text-neutral-500">·</span>
                            <span className="text-xs font-semibold text-neutral-800">
                              {s.candidateName}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Venue: <strong>{s.roomName}</strong> · Drive: {s.driveTitle}
                          </p>
                          <p className="text-[11px] font-mono text-neutral-600 mt-1">
                            {new Date(s.startMs).toISOString().slice(11, 16)}–
                            {new Date(s.endMs).toISOString().slice(11, 16)} UTC (
                            {new Date(s.startMs).toISOString().slice(0, 10)})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {s.status === 'Scheduled' && (
                          <>
                            <button
                              onClick={() => setFeedbackSession(s)}
                              className="px-3 py-1.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
                            >
                              Evaluate
                            </button>
                            <button
                              onClick={() => setCancelModalSession(s)}
                              className="px-3 py-1.5 rounded border border-neutral-300 text-neutral-700 text-xs font-medium hover:bg-neutral-100 transition"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {s.status === 'Completed' && (
                          <span className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 font-mono text-xs">
                            Evaluated & Cleared
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: MY CALENDAR ==================== */}
      {activeTab === 'My Calendar' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">My Interview Calendar</h1>
            <p className="text-xs text-neutral-500">
              Interactive high-performance time grid powered by FullCalendar
            </p>
          </div>

          <ScheduleCalendar sessions={dashboardData.sessions} />
        </div>
      )}

      {/* ==================== TAB 3: AVAILABILITY ==================== */}
      {activeTab === 'Availability' && (
        <div className="max-w-xl space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Update Daily Availability</h1>
            <p className="text-xs text-neutral-500">
              Define the free time windows when you can evaluate candidate rounds
            </p>
          </div>

          <form
            onSubmit={handleUpdateAvailability}
            className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold mb-1">Date</label>
              <input
                type="date"
                required
                value={availDate}
                onChange={(e) => setAvailDate(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Start Time (UTC)</label>
                <input
                  type="time"
                  required
                  value={availStartTime}
                  onChange={(e) => setAvailStartTime(e.target.value)}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">End Time (UTC)</label>
                <input
                  type="time"
                  required
                  value={availEndTime}
                  onChange={(e) => setAvailEndTime(e.target.value)}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
            >
              Update Availability
            </button>
          </form>

          {/* Current Submitted Windows */}
          <div className="bg-white border border-neutral-200 rounded-lg p-5">
            <h3 className="text-xs font-bold text-neutral-950 uppercase tracking-wider mb-2">
              Currently Logged Windows
            </h3>
            {dashboardData.availability.length === 0 ? (
              <p className="text-xs text-neutral-500">No availability windows logged.</p>
            ) : (
              <ul className="text-xs font-mono divide-y divide-neutral-100">
                {dashboardData.availability.map((w: any, idx: number) => (
                  <li key={idx} className="py-2">
                    {new Date(w.startMs).toISOString().slice(11, 16)}–
                    {new Date(w.endMs).toISOString().slice(11, 16)} UTC (
                    {new Date(w.startMs).toISOString().slice(0, 10)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 4: FEEDBACK ==================== */}
      {activeTab === 'Feedback' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Live Evaluation Rubrics</h1>
            <p className="text-xs text-neutral-500">
              Synchronous candidate score sheets submitted by you with automatic round progression
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dashboardData.feedbacks.length === 0 ? (
              <p className="text-xs text-neutral-500">No evaluations submitted yet.</p>
            ) : (
              dashboardData.feedbacks.map((f: any) => (
                <div key={f._id} className="bg-white border border-neutral-200 rounded-lg p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-neutral-950">{f.candidateName}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-100 border border-neutral-300">
                      Score: {f.overallScore}/100
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600">Round: {f.roundName}</p>
                  <p className="text-xs text-neutral-600">Recommendation: <strong>{f.recommendation}</strong></p>
                  <p className="text-xs text-neutral-700 bg-neutral-50 p-2 rounded border border-neutral-100">
                    Strengths: {f.strengths}
                  </p>
                  <p className="text-xs font-mono text-neutral-500">
                    Advanced to next round: {f.advancedToNextRound ? 'YES' : 'NO'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 5: PROFILE ==================== */}
      {activeTab === 'Profile' && (
        <div className="max-w-xl space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Interviewer Profile</h1>
            <p className="text-xs text-neutral-500">
              Domain expertise, company affiliation, and daily interview limits
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Full Name</label>
              <input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Company / Organization</label>
              <input
                type="text"
                required
                value={profileCompany}
                onChange={(e) => setProfileCompany(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Department</label>
              <input
                type="text"
                value={profileDept}
                onChange={(e) => setProfileDept(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Max Daily Interviews Cap</label>
              <input
                type="number"
                min={1}
                max={15}
                value={profileMaxPerDay}
                onChange={(e) => setProfileMaxPerDay(Number(e.target.value))}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Skills (comma-separated)</label>
              <input
                type="text"
                value={profileSkills}
                onChange={(e) => setProfileSkills(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
            >
              Save Profile
            </button>
          </form>
        </div>
      )}

      {/* Emergency Cancellation Modal */}
      {cancelModalSession && (
        <div className="fixed inset-0 bg-neutral-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-neutral-950">
              Emergency Cancellation & Ripple-Effect Rescheduling
            </h3>
            <p className="text-xs text-neutral-600">
              Session: <strong>{cancelModalSession.roundName}</strong> with{' '}
              <strong>{cancelModalSession.candidateName}</strong> in{' '}
              <strong>{cancelModalSession.roomName}</strong>.
            </p>
            <p className="text-xs text-neutral-500">
              The automated rescheduling engine will freeze all other sessions and immediately search for an in-place qualified colleague replacement or localized slot shift without breaking the global schedule.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">Cancellation Reason</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalSession(null)}
                className="px-3.5 py-1.5 rounded border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelAndRepair}
                className="px-4 py-1.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50"
              >
                {cancelling ? 'Re-routing Engine...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Rubric Scoring Modal */}
      {feedbackSession && (
        <div className="fixed inset-0 bg-neutral-950/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full space-y-4 shadow-xl my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-neutral-950">
                  Evaluation Rubric: {feedbackSession.roundName}
                </h3>
                <p className="text-xs text-neutral-500">
                  Candidate: {feedbackSession.candidateName} · {feedbackSession.companyName}
                </p>
              </div>
              <button
                onClick={() => setFeedbackSession(null)}
                className="text-xs text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Problem Solving (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={scoreProblemSolving}
                    onChange={(e) => setScoreProblemSolving(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Tech Depth (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={scoreTechDepth}
                    onChange={(e) => setScoreTechDepth(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Communication (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={scoreCommunication}
                    onChange={(e) => setScoreCommunication(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Hiring Recommendation</label>
                <select
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value as any)}
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-xs bg-white text-neutral-950"
                >
                  <option value="STRONG_HIRE">STRONG HIRE (Candidate exceeded expectations)</option>
                  <option value="HIRE">HIRE (Candidate meets technical bar)</option>
                  <option value="HOLD">HOLD (Borderline score)</option>
                  <option value="NO_HIRE">NO HIRE (Does not meet required competency)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Strengths Observed</label>
                <textarea
                  rows={2}
                  required
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  className="w-full p-2.5 rounded border border-neutral-300 text-xs text-neutral-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Areas for Improvement</label>
                <textarea
                  rows={2}
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  className="w-full p-2.5 rounded border border-neutral-300 text-xs text-neutral-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackSession(null)}
                  className="px-3.5 py-1.5 rounded border border-neutral-300 text-xs font-medium text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-4 py-1.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ApplicationShell>
  );
}

