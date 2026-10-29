'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ApplicationShell } from '@/components/ApplicationShell';
import { apiFetch, downloadCandidateCV, downloadScheduleICS } from '@/lib/api';

export default function CandidatePortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Self-Booking State
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [recommendedSlots, setRecommendedSlots] = useState<any[]>([]);
  const [alreadyBookedSessions, setAlreadyBookedSessions] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingInProgress, setBookingInProgress] = useState(false);

  // Availability Window Submission State
  const [availDate, setAvailDate] = useState('2026-10-28');
  const [availStartTime, setAvailStartTime] = useState('09:00');
  const [availEndTime, setAvailEndTime] = useState('17:00');

  // Candidate Profile State
  const [profileName, setProfileName] = useState('');
  const [profileDegree, setProfileDegree] = useState('B.Tech');
  const [profileBranch, setProfileBranch] = useState('Computer Science & Engineering');
  const [profileGradYear, setProfileGradYear] = useState(2027);
  const [profileCgpa, setProfileCgpa] = useState(9.34);
  const [profileSkills, setProfileSkills] = useState('');

  // CV Upload State
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [meRes, dashRes] = await Promise.all([
        apiFetch('/auth/me'),
        apiFetch('/candidate/dashboard'),
      ]);

      if (meRes.user.role !== 'CANDIDATE') {
        router.push('/');
        return;
      }

      setUser(meRes.user);
      setProfileName(meRes.user.name);
      if (dashRes.profile) {
        setProfileDegree(dashRes.profile.degree || 'B.Tech');
        setProfileBranch(dashRes.profile.branch || 'CSE');
        setProfileGradYear(dashRes.profile.graduationYear || 2027);
        setProfileCgpa(dashRes.profile.cgpa || 8.5);
        setProfileSkills((dashRes.profile.skills || []).join(', '));
      }

      setDashboardData(dashRes);
      if (dashRes.drives.length > 0 && !selectedDriveId) {
        setSelectedDriveId(dashRes.drives[0]._id);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router, selectedDriveId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadBookingSlots = useCallback(async (driveId: string) => {
    if (!driveId) return;
    try {
      setLoadingSlots(true);
      const res = await apiFetch(`/candidate/self-booking/options/${driveId}`);
      setRecommendedSlots(res.recommendedSlots || []);
      setAlreadyBookedSessions(res.alreadyBookedSessions || []);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'Availability / Booking' && selectedDriveId) {
      loadBookingSlots(selectedDriveId);
    }
  }, [activeTab, selectedDriveId, loadBookingSlots]);

  const handleSelfBookSlot = async (slot: any) => {
    setBookingInProgress(true);
    setErrorMessage('');
    setActionMessage('');
    try {
      const res = await apiFetch('/candidate/self-book', {
        method: 'POST',
        body: JSON.stringify({
          driveId: slot.driveId,
          roundId: slot.roundId,
          roomId: slot.roomId,
          interviewerIds: slot.interviewerIds,
          startMs: slot.startMs,
        }),
      });

      setActionMessage(
        `Slot reserved and confirmed! Booked ${res.session.roundName} with panel [${res.session.interviewerNames.join(', ')}] in ${res.session.roomName}.`
      );
      await loadData();
      if (selectedDriveId) {
        await loadBookingSlots(selectedDriveId);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleUpdateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startMs = new Date(`${availDate}T${availStartTime}:00.000Z`).getTime();
      const endMs = new Date(`${availDate}T${availEndTime}:00.000Z`).getTime();

      const existing = (dashboardData.availability || []).map((w: any) => ({
        startMs: w.startMs,
        endMs: w.endMs,
      }));
      const merged = [
        ...existing.filter((w: any) => !(w.startMs === startMs && w.endMs === endMs)),
        { startMs, endMs },
      ];

      await apiFetch('/availability', {
        method: 'PUT',
        body: JSON.stringify({
          windows: merged,
        }),
      });

      setActionMessage('Your availability window has been added.');
      await loadData();
      if (selectedDriveId) {
        await loadBookingSlots(selectedDriveId);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleRemoveAvailabilityWindow = async (idxToRemove: number) => {
    try {
      const remaining = (dashboardData.availability || [])
        .filter((_: any, idx: number) => idx !== idxToRemove)
        .map((w: any) => ({ startMs: w.startMs, endMs: w.endMs }));

      await apiFetch('/availability', {
        method: 'PUT',
        body: JSON.stringify({
          windows: remaining,
        }),
      });

      setActionMessage('Availability window removed.');
      await loadData();
      if (selectedDriveId) {
        await loadBookingSlots(selectedDriveId);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileName,
          degree: profileDegree,
          branch: profileBranch,
          graduationYear: Number(profileGradYear),
          cgpa: Number(profileCgpa),
          skills: profileSkills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setActionMessage('Candidate academic profile saved.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleUploadCV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cvFile) {
      setErrorMessage('Please select a PDF CV to upload.');
      return;
    }
    setUploadingCv(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('cv', cvFile);
      const res = await apiFetch('/profile/cv', {
        method: 'POST',
        body: formData,
      });
      setActionMessage(res.message);
      setCvFile(null);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setUploadingCv(false);
    }
  };

  if (loading || !user || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-sm font-mono text-neutral-600">
        Loading Timora Candidate Workspace...
      </div>
    );
  }

  const scheduledSessions = dashboardData.sessions.filter(
    (s: any) => s.status === 'Scheduled'
  );
  const completedSessions = dashboardData.sessions.filter(
    (s: any) => s.status === 'Completed'
  );

  const nextInterview = scheduledSessions[0] || null;
  const candidateUserId = user.userId || user._id;

  return (
    <ApplicationShell
      role="CANDIDATE"
      userName={user.name}
      userEmail={user.email}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {/* Alert Banners */}
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
      {activeTab === 'Dashboard' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-950 tracking-tight">
              Welcome back, {user.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-neutral-500">
              Registration: {dashboardData.profile?.registrationNumber || '20253283'} · Stage:{' '}
              <span className="font-semibold text-neutral-950">
                {dashboardData.profile?.currentStage || 'Shortlisted for Technical Round 1'}
              </span>
            </p>
          </div>

          {/* NEXT INTERVIEW DARK BANNER */}
          {nextInterview ? (
            <div className="bg-neutral-950 text-white rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  NEXT INTERVIEW
                </p>
                <h2 className="text-xl font-bold mt-1 text-white">
                  {nextInterview.roundName}
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {nextInterview.companyName} · {nextInterview.driveTitle}
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-neutral-300">
                  <span>Venue: {nextInterview.roomName}</span>
                  <span>
                    Time: {new Date(nextInterview.startMs).toISOString().slice(11, 16)}–
                    {new Date(nextInterview.endMs).toISOString().slice(11, 16)} UTC
                  </span>
                  <span>Panel: {nextInterview.interviewerNames.join(', ')}</span>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('My Interviews')}
                className="px-4 py-2 rounded bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-100 transition shrink-0"
              >
                View Details &rarr;
              </button>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-lg p-6 text-center text-xs text-neutral-500">
              No interview sessions currently scheduled. Visit Availability / Booking to self-select available slots.
            </div>
          )}

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">UPCOMING INTERVIEWS</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1">{scheduledSessions.length}</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">COMPLETED ROUNDS</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1">{completedSessions.length}</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">ELIGIBLE DRIVES</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1">{dashboardData.drives.length}</p>
            </div>
          </div>

          {/* Split: Upcoming Interviews List & Your Drives */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h3 className="font-bold text-sm text-neutral-950">Upcoming Interviews</h3>
                <button
                  onClick={() => setActiveTab('My Interviews')}
                  className="text-xs text-neutral-600 hover:text-neutral-950 underline"
                >
                  View all
                </button>
              </div>

              {scheduledSessions.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4">No scheduled interviews pending.</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {scheduledSessions.map((s: any) => (
                    <div key={s._id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-xs text-neutral-950">{s.roundName}</p>
                        <p className="text-[11px] text-neutral-500">
                          {s.companyName} · Room: {s.roomName}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-600 mt-0.5">
                          {new Date(s.startMs).toISOString().slice(11, 16)}–
                          {new Date(s.endMs).toISOString().slice(11, 16)} UTC (
                          {new Date(s.startMs).toISOString().slice(0, 10)})
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 text-[11px] font-mono">
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Your Drives */}
            <div className="xl:col-span-5 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm text-neutral-950">Active Placement Drives</h3>
              <div className="space-y-3">
                {dashboardData.drives.map((d: any) => (
                  <div
                    key={d._id}
                    className="p-3.5 rounded border border-neutral-200 bg-neutral-50 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase text-neutral-500">
                        {d.companyName}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-neutral-300">
                        {d.status}
                      </span>
                    </div>
                    <p className="font-bold text-xs text-neutral-950">{d.title}</p>
                    <p className="text-[11px] text-neutral-600">
                      Role: {d.jobRole} · Package: {d.packageLPA}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: MY INTERVIEWS ==================== */}
      {activeTab === 'My Interviews' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-950">My Interviews</h1>
              <p className="text-xs text-neutral-500">
                Verified timetable of your scheduled and completed recruitment evaluation rounds
              </p>
            </div>
            {dashboardData.sessions.length > 0 && (
              <button
                type="button"
                onClick={() => downloadScheduleICS().catch((e) => setErrorMessage(e.message))}
                className="px-3.5 py-2 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
              >
                Export .ICS Calendar
              </button>
            )}
          </div>

          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100 font-mono uppercase text-[11px] text-neutral-600">
                  <th className="py-3 px-4">Drive & Company</th>
                  <th className="py-3 px-4">Round</th>
                  <th className="py-3 px-4">Interviewer Panel</th>
                  <th className="py-3 px-4">Venue / Room</th>
                  <th className="py-3 px-4">Scheduled Slot (UTC)</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {dashboardData.sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-neutral-500">
                      No interviews scheduled yet.
                    </td>
                  </tr>
                ) : (
                  dashboardData.sessions.map((s: any) => (
                    <tr key={s._id} className="hover:bg-neutral-50">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-neutral-950">{s.companyName}</p>
                        <p className="font-mono text-neutral-500 text-[11px]">{s.driveTitle}</p>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-900">{s.roundName}</td>
                      <td className="py-3.5 px-4 font-mono">{s.interviewerNames.join(', ')}</td>
                      <td className="py-3.5 px-4">{s.roomName}</td>
                      <td className="py-3.5 px-4 font-mono">
                        {new Date(s.startMs).toISOString().slice(11, 16)}–
                        {new Date(s.endMs).toISOString().slice(11, 16)} UTC (
                        {new Date(s.startMs).toISOString().slice(0, 10)})
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                            s.status === 'Completed'
                              ? 'bg-neutral-800 text-white'
                              : s.status === 'Cancelled'
                              ? 'bg-neutral-200 text-neutral-600 line-through'
                              : 'bg-neutral-100 text-neutral-900 border border-neutral-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: AVAILABILITY / BOOKING ==================== */}
      {activeTab === 'Availability / Booking' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Availability & Self-Booking</h1>
            <p className="text-xs text-neutral-500">
              Submit your free interview windows and self-reserve conflict-free slots calculated by the CSP engine
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Cols: Availability Submission */}
            <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm text-neutral-950">Update Candidate Availability</h3>
              <form onSubmit={handleUpdateAvailability} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={availDate}
                    onChange={(e) => setAvailDate(e.target.value)}
                    className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Start Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={availStartTime}
                      onChange={(e) => setAvailStartTime(e.target.value)}
                      className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">End Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={availEndTime}
                      onChange={(e) => setAvailEndTime(e.target.value)}
                      className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full h-9 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
                >
                  + Add Free Window
                </button>
              </form>

              <div className="pt-3 border-t border-neutral-100">
                <p className="text-[11px] font-bold text-neutral-950 uppercase tracking-wider mb-1.5">
                  Your Logged Windows:
                </p>
                {dashboardData.availability.length === 0 ? (
                  <p className="text-xs text-neutral-500">None logged.</p>
                ) : (
                  <ul className="text-xs font-mono divide-y divide-neutral-100">
                    {dashboardData.availability.map((w: any, idx: number) => (
                      <li key={idx} className="py-1.5 flex items-center justify-between">
                        <span>
                          {new Date(w.startMs).toISOString().slice(11, 16)}–
                          {new Date(w.endMs).toISOString().slice(11, 16)} UTC (
                          {new Date(w.startMs).toISOString().slice(0, 10)})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAvailabilityWindow(idx)}
                          className="text-red-600 hover:text-red-800 text-[11px] font-sans font-medium"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right 7 Cols: Self-Booking Interface */}
            <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-neutral-950">Self-Booking Slot Selection</h3>
                  <p className="text-xs text-neutral-500">
                    Atomic reservation with Optimistic Concurrency Control
                  </p>
                </div>
                <div className="w-56">
                  <select
                    value={selectedDriveId}
                    onChange={(e) => setSelectedDriveId(e.target.value)}
                    className="w-full h-8 px-2 rounded border border-neutral-300 text-xs bg-white text-neutral-950"
                  >
                    {dashboardData.drives.map((d: any) => (
                      <option key={d._id} value={d._id}>
                        {d.companyName} — {d.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {alreadyBookedSessions.length > 0 && (
                <div className="p-3 rounded border border-neutral-200 bg-neutral-50 text-xs space-y-1">
                  <p className="font-bold text-neutral-950">
                    Confirmed Reservations in This Drive:
                  </p>
                  {alreadyBookedSessions.map((s: any) => (
                    <p key={s._id} className="font-mono text-neutral-700">
                      • {s.roundName}: {new Date(s.startMs).toISOString().slice(11, 16)}–
                      {new Date(s.endMs).toISOString().slice(11, 16)} UTC in {s.roomName} ({s.status})
                    </p>
                  ))}
                </div>
              )}

              {loadingSlots ? (
                <p className="text-xs text-neutral-500 py-6 text-center font-mono">
                  Calculating conflict-free candidate slots via CSP Engine...
                </p>
              ) : recommendedSlots.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-neutral-600 font-medium">
                    No additional unbooked slots available for this drive right now.
                  </p>
                  <p className="text-xs text-neutral-400">
                    Ensure you have submitted availability matching the drive date and that prerequisite rounds are completed or scheduled.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-600">
                    Select an available slot below for{' '}
                    <strong>{recommendedSlots[0]?.roundName || 'Next Round'}</strong>. Slots are verified against interviewer skills, panel capacity, and venue availability:
                  </p>
                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {recommendedSlots.map((slot: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded border border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 font-mono text-[10px] font-semibold">
                              {slot.roundName}
                            </span>
                            <p className="font-bold text-xs text-neutral-950 font-mono">
                              {new Date(slot.startMs).toISOString().slice(11, 16)}–
                              {new Date(slot.endMs).toISOString().slice(11, 16)} UTC (
                              {new Date(slot.startMs).toISOString().slice(0, 10)})
                            </p>
                          </div>
                          <p className="text-xs text-neutral-600 mt-1">
                            Venue: <strong>{slot.roomName}</strong> · Panel: [
                            {slot.interviewerNames.join(', ')}]
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={bookingInProgress}
                          onClick={() => handleSelfBookSlot(slot)}
                          className="px-4 py-2 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition shrink-0"
                        >
                          {bookingInProgress ? 'Reserving...' : 'Book Slot'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: PROFILE & CV WORKFLOW ==================== */}
      {activeTab === 'Profile' && (
        <div className="max-w-xl space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Candidate Profile & CV</h1>
            <p className="text-xs text-neutral-500">
              Manage academic credentials, technical skills, and verified Curriculum Vitae document
            </p>
          </div>

          {/* Academic Details Form */}
          <form
            onSubmit={handleSaveProfile}
            className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4"
          >
            <h2 className="text-sm font-bold text-neutral-950 border-b border-neutral-100 pb-2">
              Academic Credentials
            </h2>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Degree</label>
                <input
                  type="text"
                  required
                  value={profileDegree}
                  onChange={(e) => setProfileDegree(e.target.value)}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Branch / Major</label>
                <input
                  type="text"
                  required
                  value={profileBranch}
                  onChange={(e) => setProfileBranch(e.target.value)}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Graduation Year</label>
                <input
                  type="number"
                  required
                  value={profileGradYear}
                  onChange={(e) => setProfileGradYear(Number(e.target.value))}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Cumulative GPA (CGPA)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={10}
                  required
                  value={profileCgpa}
                  onChange={(e) => setProfileCgpa(Number(e.target.value))}
                  className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
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
              Update Credentials
            </button>
          </form>

          {/* CV Upload Section */}
          <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-bold text-neutral-950 border-b border-neutral-100 pb-2">
              Curriculum Vitae (PDF)
            </h2>

            {dashboardData.profile?.cvMetadata?.storedFileName ? (
              <div className="p-4 rounded border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-neutral-950">
                    {dashboardData.profile.cvMetadata.originalName}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500 mt-0.5">
                    Size: {Math.round(dashboardData.profile.cvMetadata.sizeBytes / 1024)} KB · Uploaded:{' '}
                    {new Date(dashboardData.profile.cvMetadata.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCandidateCV(candidateUserId).catch((e) => setErrorMessage(e.message))
                  }
                  className="px-3.5 py-1.5 rounded border border-neutral-950 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
                >
                  Download PDF
                </button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                No CV uploaded yet. Interviewers will review your CV before technical rounds.
              </p>
            )}

            <form onSubmit={handleUploadCV} className="space-y-3 pt-2">
              <label className="block text-xs font-semibold mb-1">
                {dashboardData.profile?.cvMetadata?.storedFileName
                  ? 'Replace CV (PDF only, max 5MB)'
                  : 'Upload CV (PDF only, max 5MB)'}
              </label>
              <input
                type="file"
                accept="application/pdf"
                required
                onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                className="w-full text-xs font-mono border border-neutral-300 p-2 rounded bg-white text-neutral-950 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-neutral-950 file:text-white hover:file:bg-neutral-800"
              />
              <button
                type="submit"
                disabled={uploadingCv}
                className="px-5 py-2.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                {uploadingCv ? 'Uploading...' : 'Upload CV'}
              </button>
            </form>
          </div>
        </div>
      )}
    </ApplicationShell>
  );
}