'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ApplicationShell } from '@/components/ApplicationShell';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { apiFetch, downloadCandidateCV, downloadScheduleICS } from '@/lib/api';

export default function AdminPortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [user, setUser] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [latestSolverOutput, setLatestSolverOutput] = useState<any>(null);

  // New Drive Form State
  const [newDriveTitle, setNewDriveTitle] = useState('');
  const [newDriveCompany, setNewDriveCompany] = useState('');
  const [newDriveRole, setNewDriveRole] = useState('SDE-1');
  const [newDriveDate, setNewDriveDate] = useState('2026-10-28');

  // New Room Form State
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomBuilding, setNewRoomBuilding] = useState('Placement Block');
  const [newRoomCapacity, setNewRoomCapacity] = useState(4);
  const [newRoomFeatures, setNewRoomFeatures] = useState('Whiteboard, Projector');

  // Drive Details Modal & Deletion State
  const [selectedDriveModal, setSelectedDriveModal] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingDrive, setDeletingDrive] = useState(false);

  // Candidate Search & Eligibility Drive Filter State
  const [candidateSearch, setCandidateSearch] = useState('');
  const [eligibilityDriveId, setEligibilityDriveId] = useState('');

  // Profile Form State
  const [profileName, setProfileName] = useState('');
  const [profileDept, setProfileDept] = useState('');
  const [profilePhone, setProfilePhone] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [meRes, ovRes] = await Promise.all([
        apiFetch('/auth/me'),
        apiFetch('/admin/overview'),
      ]);
      if (meRes.user.role !== 'ADMIN') {
        router.push('/');
        return;
      }
      setUser(meRes.user);
      setProfileName(meRes.user.name);
      setProfileDept(meRes.user.department || '');
      setProfilePhone(meRes.user.phone || '');
      setOverview(ovRes);
      if (ovRes.drives?.length > 0 && !eligibilityDriveId) {
        setEligibilityDriveId(ovRes.drives[0]._id);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router, eligibilityDriveId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunCSPSolver = async (driveId: string) => {
    try {
      setActionMessage('');
      setErrorMessage('');
      const res = await apiFetch(`/schedules/generate/${driveId}`, { method: 'POST' });
      setLatestSolverOutput(res);
      setActionMessage(res.nlSummary);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handlePublishSchedule = async (driveId: string) => {
    try {
      setActionMessage('');
      setErrorMessage('');
      const res = await apiFetch(`/schedules/publish/${driveId}`, { method: 'POST' });
      setActionMessage(res.message);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCreateDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startMs = new Date(`${newDriveDate}T09:00:00.000Z`).getTime();
      const endMs = new Date(`${newDriveDate}T17:00:00.000Z`).getTime();
      const stamp = Date.now();
      const r1Id = `R1_${stamp}`;
      const r2Id = `R2_${stamp}`;

      const created = await apiFetch('/drives', {
        method: 'POST',
        body: JSON.stringify({
          title: newDriveTitle,
          companyName: newDriveCompany,
          jobRole: newDriveRole,
          selfBookingEnabled: true,
          allowedTimeWindows: [{ startMs, endMs }],
          rounds: [
            {
              roundId: r1Id,
              name: 'Technical Round 1 — DSA',
              order: 1,
              durationMinutes: 45,
              bufferMinutes: 15,
              requiredSkills: ['DSA'],
              panelSize: 1,
              requiredRoomCapacity: 2,
              passingScoreThreshold: 70,
            },
            {
              roundId: r2Id,
              name: 'Technical Round 2 — System Design',
              order: 2,
              durationMinutes: 45,
              bufferMinutes: 15,
              requiredSkills: ['System Design'],
              panelSize: 1,
              requiredRoomCapacity: 2,
              prerequisiteRoundId: r1Id,
              passingScoreThreshold: 75,
            },
          ],
          eligibleCandidateIds: overview.candidates.map((c: any) => c.userId),
          assignedInterviewerIds: overview.interviewers.map((i: any) => i.userId),
        }),
      });
      setNewDriveTitle('');
      setNewDriveCompany('');
      if (created?.drive?._id) {
        setEligibilityDriveId(created.drive._id);
      }
      setActionMessage('Placement drive created successfully.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const defaultStartMs = Date.UTC(2026, 9, 28, 9, 0, 0);
      const defaultEndMs = Date.UTC(2026, 9, 28, 17, 0, 0);
      const driveWindows = (overview.drives || []).flatMap(
        (d: any) => d.allowedTimeWindows || []
      );

      await apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoomName,
          building: newRoomBuilding,
          capacity: Number(newRoomCapacity),
          features: newRoomFeatures
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          availableWindows: [
            { startMs: defaultStartMs, endMs: defaultEndMs },
            ...driveWindows,
          ],
        }),
      });
      setNewRoomName('');
      setActionMessage('Room added successfully.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('Delete this room permanently?')) return;
    try {
      await apiFetch(`/rooms/${roomId}`, { method: 'DELETE' });
      setActionMessage('Room deleted.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDeleteDrive = async (driveId: string) => {
    try {
      setDeletingDrive(true);
      const res = await apiFetch(`/drives/${driveId}`, { method: 'DELETE' });
      setActionMessage(res.message || 'Placement drive deleted successfully.');
      setSelectedDriveModal(null);
      setShowDeleteConfirm(false);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setDeletingDrive(false);
    }
  };

  const handleToggleCandidateEligibility = async (
    candidateUserId: string,
    driveId: string,
    currentEligible: boolean
  ) => {
    try {
      await apiFetch(`/admin/candidates/${candidateUserId}/eligibility`, {
        method: 'PATCH',
        body: JSON.stringify({
          driveId,
          eligible: !currentEligible,
        }),
      });
      setActionMessage('Candidate drive eligibility updated.');
      await loadData();
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
          department: profileDept,
          phone: profilePhone,
        }),
      });
      setActionMessage('Coordinator profile saved.');
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  if (loading || !user || !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-sm font-mono text-neutral-600">
        Loading Timora Coordinator Workspace...
      </div>
    );
  }

  const scheduledSessions = overview.sessions.filter((s: any) => s.status === 'Scheduled');

  const filteredCandidates = overview.candidates.filter((c: any) => {
    const q = candidateSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.profile?.registrationNumber || '').toLowerCase().includes(q) ||
      (c.profile?.skills || []).some((s: string) => s.toLowerCase().includes(q))
    );
  });

  const targetEligibilityDrive =
    overview.drives.find((d: any) => d._id === eligibilityDriveId) || overview.drives[0];

  return (
    <ApplicationShell
      role="ADMIN"
      userName={user.name}
      userEmail={user.email}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {/* Status Notifications */}
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-950 tracking-tight">
                Welcome back, {user.name}
              </h1>
              <p className="text-sm text-neutral-500">
                Placement Coordinator Command Center
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadScheduleICS().catch((e) => setErrorMessage(e.message))}
                className="px-3.5 py-2 rounded-md border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-100 transition"
              >
                Export Master .ICS
              </button>
              <button
                onClick={() => setActiveTab('Placement Drives')}
                className="px-3.5 py-2 rounded-md border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-100 transition"
              >
                + New Drive
              </button>
              <button
                onClick={() => setActiveTab('Interview Scheduling')}
                className="px-3.5 py-2 rounded-md bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
              >
                Open Scheduling Engine &rarr;
              </button>
            </div>
          </div>

          {/* 3 Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">ACTIVE DRIVES</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1.5">{overview.drives.length}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {overview.drives.filter((d: any) => d.status === 'Published').length} published master schedules
              </p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">SCHEDULED SESSIONS</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1.5">{scheduledSessions.length}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {scheduledSessions.filter((s: any) => !s.isPublished).length} pending coordinator publication
              </p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-5">
              <p className="text-[11px] font-mono uppercase text-neutral-500">CANDIDATES & PANEL</p>
              <p className="text-2xl font-bold text-neutral-950 mt-1.5">{overview.candidates.length}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {overview.interviewers.length} registered interviewers across {overview.rooms.length} rooms
              </p>
            </div>
          </div>

          {/* Active Placement Drives Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-950">Active Placement Drives</h2>
                <p className="text-xs text-neutral-500">
                  Select any drive card to view full specifications, rounds, and management actions.
                </p>
              </div>
              <span className="text-xs font-mono text-neutral-500">
                {overview.drives.length} Total Drive(s)
              </span>
            </div>

            {overview.drives.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center text-xs text-neutral-500">
                No active placement drives found. Create a new drive to begin scheduling.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {overview.drives.map((drive: any) => {
                  const driveSessions = overview.sessions.filter(
                    (s: any) => s.driveId === drive._id && s.status !== 'Cancelled'
                  );
                  const totalRequired = drive.eligibleCandidateIds.length * drive.rounds.length;
                  return (
                    <div
                      key={drive._id}
                      onClick={() => setSelectedDriveModal(drive)}
                      className="bg-white border border-neutral-200 hover:border-neutral-400 rounded-lg p-5 flex flex-col justify-between transition cursor-pointer shadow-sm hover:shadow"
                      title="Click to view details and manage drive"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono uppercase text-neutral-500">
                            {drive.companyName}
                          </span>
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-neutral-100 text-neutral-900 border border-neutral-300">
                            {drive.status}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-neutral-950 mt-1">{drive.title}</h3>
                        <p className="text-xs text-neutral-500 mt-1">
                          {drive.jobRole} · {drive.packageLPA}
                        </p>
                        <div className="mt-3 text-xs text-neutral-600 flex flex-wrap gap-3 font-mono">
                          <span>{drive.rounds.length} rounds</span>
                          <span>{drive.eligibleCandidateIds.length} candidates</span>
                          <span>{drive.assignedInterviewerIds.length} interviewers</span>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-neutral-600">
                          Scheduled: {driveSessions.length}/{totalRequired}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunCSPSolver(drive._id);
                            }}
                            className="px-3 py-1.5 rounded bg-neutral-950 text-white text-xs font-medium hover:bg-neutral-800 transition"
                          >
                            Run CSP
                          </button>
                          {driveSessions.length > 0 && drive.status !== 'Published' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePublishSchedule(drive._id);
                              }}
                              className="px-3 py-1.5 rounded border border-neutral-950 text-neutral-950 text-xs font-semibold hover:bg-neutral-100 transition"
                            >
                              Publish
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live System Audit Activity Feed */}
          {overview.auditLogs?.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                <h2 className="text-sm font-bold text-neutral-950">Recent System Audit Feed</h2>
                <span className="text-[11px] font-mono text-neutral-500">
                  Latest {overview.auditLogs.length} event(s)
                </span>
              </div>
              <div className="divide-y divide-neutral-100 max-h-60 overflow-y-auto">
                {overview.auditLogs.map((log: any) => (
                  <div key={log._id} className="py-2 flex items-start justify-between gap-4 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-neutral-900">[{log.action}]</span>{' '}
                      <span className="text-neutral-700">{log.details}</span>
                    </div>
                    <span className="font-mono text-[11px] text-neutral-400 shrink-0">
                      {new Date(log.createdAt).toISOString().slice(11, 19)} UTC
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: PLACEMENT DRIVES ==================== */}
      {activeTab === 'Placement Drives' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-neutral-950">Placement Drives</h1>
              <p className="text-xs text-neutral-500">
                Configure corporate placement drives, target roles, round structures, and scheduling parameters
              </p>
            </div>
          </div>

          {/* New Drive Form */}
          <form
            onSubmit={handleCreateDrive}
            className="bg-white border border-neutral-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Northwind Labs"
                value={newDriveCompany}
                onChange={(e) => setNewDriveCompany(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1">
                Drive Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SDE Campus Drive 2026"
                value={newDriveTitle}
                onChange={(e) => setNewDriveTitle(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1">
                Target Role
              </label>
              <input
                type="text"
                required
                value={newDriveRole}
                onChange={(e) => setNewDriveRole(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1">
                Drive Date (UTC)
              </label>
              <input
                type="date"
                required
                value={newDriveDate}
                onChange={(e) => setNewDriveDate(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs font-mono text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
            >
              + Create Drive
            </button>
          </form>

          {/* Drives List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {overview.drives.map((d: any) => (
              <div
                key={d._id}
                onClick={() => setSelectedDriveModal(d)}
                className="bg-white border border-neutral-200 hover:border-neutral-400 rounded-lg p-5 space-y-3 cursor-pointer transition shadow-sm hover:shadow"
                title="Click to view details and manage drive"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono uppercase text-neutral-500">
                      {d.companyName}
                    </span>
                    <h3 className="text-lg font-bold text-neutral-950">{d.title}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-neutral-100 border border-neutral-300">
                    {d.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">
                  Role: <strong>{d.jobRole}</strong> · Package: <strong>{d.packageLPA}</strong>
                </p>
                <div className="border-t border-neutral-100 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-neutral-800">Interview Rounds:</p>
                    <span className="text-[11px] text-neutral-500 font-mono underline">
                      Click for details & actions &rarr;
                    </span>
                  </div>
                  {d.rounds.map((r: any) => (
                    <div
                      key={r.roundId}
                      className="text-xs font-mono bg-neutral-50 px-3 py-2 rounded border border-neutral-200 flex justify-between"
                    >
                      <span>
                        #{r.order} {r.name} ({r.durationMinutes}m + {r.bufferMinutes}m buffer)
                      </span>
                      <span>Skills: [{r.requiredSkills.join(', ')}]</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: MANAGE CANDIDATES ==================== */}
      {activeTab === 'Manage Candidates' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-950">Manage Candidates</h1>
              <p className="text-xs text-neutral-500">
                Inspect candidate credentials, verified skills, recruitment stage, and CV uploads
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {overview.drives.length > 0 && (
                <select
                  value={targetEligibilityDrive?._id || ''}
                  onChange={(e) => setEligibilityDriveId(e.target.value)}
                  className="h-9 px-3 rounded border border-neutral-300 text-xs bg-white text-neutral-950"
                >
                  {overview.drives.map((d: any) => (
                    <option key={d._id} value={d._id}>
                      Eligibility Drive: {d.companyName} — {d.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="w-64">
                <input
                  type="text"
                  placeholder="Search candidates by name, reg, skill..."
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  className="w-full h-9 px-3.5 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100 font-mono uppercase text-[11px] text-neutral-600">
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Reg No & CGPA</th>
                  <th className="py-3 px-4">Skills</th>
                  <th className="py-3 px-4">Current Stage</th>
                  <th className="py-3 px-4">Drive Eligibility</th>
                  <th className="py-3 px-4">CV Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredCandidates.map((c: any) => {
                  const isEligible = targetEligibilityDrive?.eligibleCandidateIds.includes(c.userId);
                  return (
                    <tr key={c.userId} className="hover:bg-neutral-50">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-neutral-950">{c.name}</p>
                        <p className="font-mono text-neutral-500">{c.email}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {c.profile?.registrationNumber || 'N/A'} · CGPA {c.profile?.cgpa || 'N/A'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(c.profile?.skills || []).map((s: string) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-300 font-mono text-[11px]"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-neutral-900">
                        {c.profile?.currentStage || 'Registered'}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {targetEligibilityDrive ? (
                          <button
                            onClick={() =>
                              handleToggleCandidateEligibility(
                                c.userId,
                                targetEligibilityDrive._id,
                                isEligible
                              )
                            }
                            className={`px-2.5 py-1 rounded text-[11px] border ${
                              isEligible
                                ? 'bg-neutral-950 text-white border-neutral-950'
                                : 'bg-white text-neutral-600 border-neutral-300'
                            }`}
                          >
                            {isEligible ? 'Eligible' : 'Not Eligible'}
                          </button>
                        ) : (
                          'No active drive'
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {c.profile?.cvMetadata?.storedFileName ? (
                          <button
                            type="button"
                            onClick={() =>
                              downloadCandidateCV(c.userId).catch((e) => setErrorMessage(e.message))
                            }
                            className="underline font-semibold text-neutral-950 hover:text-neutral-700"
                          >
                            Download PDF
                          </button>
                        ) : (
                          <span className="text-neutral-400">Not uploaded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: INTERVIEW SCHEDULING (CSP SOLVER & VALIDATOR) ==================== */}
      {activeTab === 'Interview Scheduling' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-950">
                Constraint-Satisfaction Interview Scheduling
              </h1>
              <p className="text-xs text-neutral-500">
                Deterministic backtracking solver with MRV variable ordering and zero-trust independent validation
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {overview.drives.map((d: any) => (
                <div key={d._id} className="flex gap-2">
                  <button
                    onClick={() => handleRunCSPSolver(d._id)}
                    className="px-3.5 py-2 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
                  >
                    Run CSP Solver ({d.companyName})
                  </button>
                  <button
                    onClick={() => handlePublishSchedule(d._id)}
                    className="px-3.5 py-2 rounded border border-neutral-950 bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-100 transition"
                  >
                    Validate & Publish ({d.companyName})
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Diagnostics and Independent Validator Output */}
          {(latestSolverOutput || overview.scheduleVersions.length > 0) && (
            <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              {(() => {
                const ver = latestSolverOutput?.scheduleVersion || overview.scheduleVersions[0];
                if (!ver) return null;
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                      <div>
                        <span className="text-xs font-mono uppercase text-neutral-500">
                          CSP Engine & Independent Validator Diagnostics
                        </span>
                        <h3 className="text-sm font-bold text-neutral-950 mt-0.5">
                          Solver Status: {ver.solverStatus} · Independent Validation:{' '}
                          <span
                            className={
                              ver.validationReport?.isValid
                                ? 'text-neutral-950 font-bold'
                                : 'text-red-700 font-bold'
                            }
                          >
                            {ver.validationReport?.isValid ? 'PASSED (0 Hard Violations)' : 'FAILED'}
                          </span>
                        </h3>
                      </div>
                      <div className="flex gap-4 text-xs font-mono text-neutral-700">
                        <span>Nodes: {ver.statistics?.exploredNodes}</span>
                        <span>Backtracks: {ver.statistics?.backtracks}</span>
                        <span>Pruned: {ver.statistics?.prunedBranches}</span>
                        <span>Runtime: {ver.statistics?.executionTimeMs}ms</span>
                      </div>
                    </div>

                    {ver.unscheduledDiagnostics?.length > 0 && (
                      <div className="p-3.5 rounded bg-neutral-100 border border-neutral-300 text-xs space-y-1">
                        <p className="font-bold text-neutral-950">
                          Unscheduled Variables & Blocking Constraints ({ver.unscheduledDiagnostics.length}):
                        </p>
                        {ver.unscheduledDiagnostics.map((u: any, idx: number) => (
                          <p key={idx} className="font-mono text-neutral-700">
                            • [{u.reasonCode}] {u.explanation}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* FullCalendar Integration */}
          <ScheduleCalendar sessions={overview.sessions} />
        </div>
      )}

      {/* ==================== TAB 5: ROOMS ==================== */}
      {activeTab === 'Rooms' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Rooms</h1>
            <p className="text-xs text-neutral-500">
              Listed physical and virtual interview venues with capacity bounds and live occupancy indicators
            </p>
          </div>

          <form
            onSubmit={handleCreateRoom}
            className="bg-white border border-neutral-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
          >
            <div>
              <label className="block text-xs font-semibold mb-1">Room Name / ID</label>
              <input
                type="text"
                required
                placeholder="e.g. Panel Room C-301"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Building</label>
              <input
                type="text"
                required
                value={newRoomBuilding}
                onChange={(e) => setNewRoomBuilding(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Capacity</label>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={newRoomCapacity}
                onChange={(e) => setNewRoomCapacity(Number(e.target.value))}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Features (comma-separated)</label>
              <input
                type="text"
                value={newRoomFeatures}
                onChange={(e) => setNewRoomFeatures(e.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-xs text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
            >
              + Add Room
            </button>
          </form>

          {/* Rooms Grid matching Sketch 3: RoomId and Occupied • dot */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {overview.rooms.map((room: any) => {
              const now = Date.now();
              const isOccupied = overview.sessions.some(
                (s: any) =>
                  s.roomId === room._id &&
                  s.status === 'Scheduled' &&
                  s.startMs <= now &&
                  now <= s.effectiveEndMs
              );

              return (
                <div
                  key={room._id}
                  className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-neutral-950">{room.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isOccupied ? 'bg-neutral-950 animate-pulse' : 'bg-neutral-400'
                          }`}
                        />
                        <span className="text-neutral-700">
                          {isOccupied ? 'Occupied' : 'Available'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">{room.building}</p>
                    <p className="text-xs font-mono text-neutral-800 mt-2">
                      Max Capacity: <strong>{room.capacity} persons</strong>
                    </p>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {(room.features || []).map((f: string) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-300 text-[11px] font-mono"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-neutral-100 flex justify-end">
                    <button
                      onClick={() => handleDeleteRoom(room._id)}
                      className="text-xs text-red-600 hover:text-red-900 font-medium"
                    >
                      Delete Room
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 6: INTERVIEWER AVAILABILITY ==================== */}
      {activeTab === 'Interviewer Availability' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Interviewer Availability</h1>
            <p className="text-xs text-neutral-500">
              Read-only inspection roster of panel interviewers, technical competencies, daily limits, and availability windows
            </p>
          </div>

          <div className="p-3 bg-neutral-100 rounded-md border border-neutral-200 text-xs text-neutral-700">
            <span className="font-semibold text-neutral-950">Ownership Policy:</span> Interviewer availability is strictly self-managed by each panel member via their personal portal to prevent double-booking and guarantee scheduling accuracy.
          </div>

          {/* Interviewer Rosters */}
          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100 font-mono uppercase text-[11px] text-neutral-600">
                  <th className="py-3 px-4">Interviewer</th>
                  <th className="py-3 px-4">Company & Skills</th>
                  <th className="py-3 px-4">Daily Cap</th>
                  <th className="py-3 px-4">Configured Availability Windows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {overview.interviewers.map((i: any) => (
                  <tr key={i.userId} className="hover:bg-neutral-50">
                    <td className="py-3.5 px-4 font-bold text-neutral-950">
                      {i.name}
                      <p className="font-mono text-[11px] text-neutral-500 font-normal">{i.email}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-neutral-900">
                        {i.profile?.company || 'Northwind Labs'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(i.profile?.skills || []).map((s: string) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-300 font-mono text-[10px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {i.profile?.maxInterviewsPerDay || 6} / day
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {i.availability.length === 0 ? (
                        <span className="text-neutral-400">None submitted</span>
                      ) : (
                        i.availability.map((w: any, idx: number) => (
                          <span key={idx} className="block">
                            {new Date(w.startMs).toISOString().slice(11, 16)}–
                            {new Date(w.endMs).toISOString().slice(11, 16)} UTC (
                            {new Date(w.startMs).toISOString().slice(0, 10)})
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 7: PROFILE ==================== */}
      {activeTab === 'Profile' && (
        <div className="max-w-xl space-y-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">Placement Coordinator Profile</h1>
            <p className="text-xs text-neutral-500">
              Manage coordinator contact credentials and departmental affiliation
            </p>
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4"
          >
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
              <label className="block text-xs font-semibold mb-1">Email Address</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full h-10 px-3.5 rounded border border-neutral-200 bg-neutral-100 text-neutral-500 text-sm font-mono cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Department / Office</label>
              <input
                type="text"
                value={profileDept}
                onChange={(e) => setProfileDept(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Contact Phone</label>
              <input
                type="text"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="w-full h-10 px-3.5 rounded border border-neutral-300 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition"
            >
              Update Profile
            </button>
          </form>
        </div>
      )}

      {/* ==================== DRIVE DETAILS & DELETE MODAL ==================== */}
      {selectedDriveModal && (
        <div className="fixed inset-0 bg-neutral-950/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full space-y-5 shadow-2xl my-8 border border-neutral-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-neutral-100 pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-neutral-500">
                  {selectedDriveModal.companyName}
                </span>
                <h3 className="text-xl font-bold text-neutral-950 mt-0.5">
                  {selectedDriveModal.title}
                </h3>
                <p className="text-xs text-neutral-600 mt-1">
                  Target Role: <strong>{selectedDriveModal.jobRole}</strong> · Package:{' '}
                  <strong>{selectedDriveModal.packageLPA}</strong>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-neutral-100 border border-neutral-300">
                  {selectedDriveModal.status}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDriveModal(null);
                    setShowDeleteConfirm(false);
                  }}
                  className="text-neutral-400 hover:text-neutral-950 text-base font-bold px-2 py-1"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded border border-neutral-200 bg-neutral-50">
                <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                  Eligible Candidates
                </span>
                <span className="text-base font-bold text-neutral-950">
                  {selectedDriveModal.eligibleCandidateIds?.length || 0} enrolled
                </span>
              </div>
              <div className="p-3 rounded border border-neutral-200 bg-neutral-50">
                <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                  Assigned Panel
                </span>
                <span className="text-base font-bold text-neutral-950">
                  {selectedDriveModal.assignedInterviewerIds?.length || 0} interviewers
                </span>
              </div>
              <div className="p-3 rounded border border-neutral-200 bg-neutral-50">
                <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                  Candidate Booking
                </span>
                <span className="text-base font-bold text-neutral-950">
                  {selectedDriveModal.selfBookingEnabled ? 'Self-Booking Active' : 'Coordinator-Only'}
                </span>
              </div>
            </div>

            {/* Allowed Windows */}
            <div>
              <h4 className="text-xs font-bold text-neutral-900 mb-1.5 uppercase font-mono">
                Permitted Drive Scheduling Windows (UTC)
              </h4>
              <div className="space-y-1">
                {(selectedDriveModal.allowedTimeWindows || []).map((w: any, idx: number) => (
                  <div
                    key={idx}
                    className="text-xs font-mono p-2 rounded bg-neutral-50 border border-neutral-200"
                  >
                    Window #{idx + 1}: {new Date(w.startMs).toISOString().slice(0, 10)} (
                    {new Date(w.startMs).toISOString().slice(11, 16)}–
                    {new Date(w.endMs).toISOString().slice(11, 16)} UTC)
                  </div>
                ))}
              </div>
            </div>

            {/* Rounds Specification */}
            <div>
              <h4 className="text-xs font-bold text-neutral-900 mb-1.5 uppercase font-mono">
                Interview Rounds Breakdown ({selectedDriveModal.rounds?.length || 0})
              </h4>
              <div className="space-y-2">
                {(selectedDriveModal.rounds || []).map((r: any) => (
                  <div
                    key={r.roundId}
                    className="p-3 rounded border border-neutral-200 bg-neutral-50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-950">
                        Round {r.order}: {r.name}
                      </span>
                      <span className="font-mono text-[11px] text-neutral-600">
                        Passing Score: {r.passingScoreThreshold || 70}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-neutral-600 font-mono text-[11px]">
                      <span>Duration: {r.durationMinutes} min</span>
                      <span>Buffer: {r.bufferMinutes} min</span>
                      <span>Panel Size: {r.panelSize || 1}</span>
                      <span>Min Room Cap: {r.requiredRoomCapacity || 2}</span>
                    </div>
                    <div className="text-[11px] text-neutral-700">
                      Required Skills: <span className="font-mono">[{r.requiredSkills?.join(', ')}]</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Confirmation Warning (if triggered) */}
            {showDeleteConfirm && (
              <div className="p-4 rounded-md border border-red-300 bg-red-50 text-xs text-red-900 space-y-2">
                <p className="font-bold">
                  Confirm permanent deletion of &quot;{selectedDriveModal.title}&quot;?
                </p>
                <p>
                  This will permanently delete this placement drive, all associated interview round configurations, and all scheduled/draft interview sessions linked to it. This action cannot be reversed.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded border border-red-300 bg-white text-neutral-700 text-xs font-medium hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingDrive}
                    onClick={() => handleDeleteDrive(selectedDriveModal._id)}
                    className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingDrive ? 'Deleting Drive...' : 'Yes, Delete Permanently'}
                  </button>
                </div>
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100">
              <div>
                {!showDeleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3.5 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition"
                  >
                    Delete Drive
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleRunCSPSolver(selectedDriveModal._id);
                    setSelectedDriveModal(null);
                  }}
                  className="px-4 py-2 rounded bg-neutral-950 text-white text-xs font-medium hover:bg-neutral-800 transition"
                >
                  Run CSP Solver
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDriveModal(null);
                    setShowDeleteConfirm(false);
                  }}
                  className="px-4 py-2 rounded border border-neutral-300 text-neutral-700 text-xs font-medium hover:bg-neutral-100 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ApplicationShell>
  );
}