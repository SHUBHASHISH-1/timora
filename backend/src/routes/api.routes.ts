// backend/src/routes/api.routes.ts

import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  UserModel,
  CandidateProfileModel,
  InterviewerProfileModel,
  RoomModel,
  AvailabilityModel,
  PlacementDriveModel,
  InterviewSessionModel,
  ScheduleVersionModel,
  FeedbackModel,
  AuditLogModel,
} from '../models';
import { authenticate, requireRole, signToken } from '../middleware/auth';
import { cvUpload } from '../middleware/upload';
import { TimoraCSPSolver, intervalsOverlap, isContainedInAny } from '../engine/cspSolver';
import { IndependentScheduleValidator } from '../engine/scheduleValidator';
import { LocalizedRescheduler } from '../engine/rescheduler';
import { generateNaturalLanguageScheduleSummary } from '../services/geminiService';
import {
  CSPProblemInput,
  CandidateSlotAssignment,
  InterviewVariable,
} from '../../../shared/types/csp';
import { env } from '../config/env';

export const apiRouter = Router();
const solver = new TimoraCSPSolver();
const validator = new IndependentScheduleValidator();
const rescheduler = new LocalizedRescheduler();

// ============================================================================
// 1. AUTHENTICATION & PROFILE ROUTES
// ============================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  role: z.enum(['ADMIN', 'INTERVIEWER', 'CANDIDATE']).optional(),
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password format.', details: parsed.error.issues });
      return;
    }

    const { email, password, role } = parsed.data;
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (role && user.role !== role) {
      res.status(403).json({
        error: `Account ${email} belongs to role ${user.role}, not ${role}. Please select ${user.role}.`,
      });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const tokenPayload = {
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = signToken(tokenPayload);

    await AuditLogModel.create({
      actorName: user.name,
      actorRole: user.role,
      action: 'SIGN_IN',
      details: `${user.name} (${user.email}) signed in as ${user.role}.`,
    });

    res.json({ token, user: tokenPayload });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed.', message: (err as Error).message });
  }
});

apiRouter.get('/auth/me', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('-passwordHash');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  let candidateProfile = null;
  let interviewerProfile = null;
  if (user.role === 'CANDIDATE') {
    candidateProfile = await CandidateProfileModel.findOne({ userId: user._id });
  } else if (user.role === 'INTERVIEWER') {
    interviewerProfile = await InterviewerProfileModel.findOne({ userId: user._id });
  }

  const availability = await AvailabilityModel.findOne({ userId: user._id });

  res.json({
    user,
    candidateProfile,
    interviewerProfile,
    availability: availability?.windows ?? [],
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  degree: z.string().optional(),
  branch: z.string().optional(),
  graduationYear: z.number().optional(),
  cgpa: z.number().min(0).max(10).optional(),
  skills: z.array(z.string()).optional(),
  company: z.string().optional(),
  maxInterviewsPerDay: z.number().min(1).max(15).optional(),
});

apiRouter.put('/profile', authenticate, async (req: Request, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update payload.', details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const user = await UserModel.findById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (data.name) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.department !== undefined) user.department = data.department;
  await user.save();

  if (user.role === 'CANDIDATE') {
    await CandidateProfileModel.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          ...(data.degree ? { degree: data.degree } : {}),
          ...(data.branch ? { branch: data.branch } : {}),
          ...(data.graduationYear ? { graduationYear: data.graduationYear } : {}),
          ...(data.cgpa !== undefined ? { cgpa: data.cgpa } : {}),
          ...(data.skills ? { skills: data.skills } : {}),
        },
      },
      { new: true, upsert: true }
    );
  } else if (user.role === 'INTERVIEWER') {
    await InterviewerProfileModel.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          ...(data.company ? { company: data.company } : {}),
          ...(data.department ? { department: data.department } : {}),
          ...(data.skills ? { skills: data.skills } : {}),
          ...(data.maxInterviewsPerDay ? { maxInterviewsPerDay: data.maxInterviewsPerDay } : {}),
        },
      },
      { new: true, upsert: true }
    );
  }

  res.json({ message: 'Profile updated successfully.' });
});

// Candidate CV Upload (Inside Candidate Profile)
apiRouter.post(
  '/profile/cv',
  authenticate,
  requireRole('CANDIDATE'),
  (req, res, next) => {
    cvUpload.single('cv')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please select a valid PDF file to upload.' });
      return;
    }

    const profile = await CandidateProfileModel.findOne({ userId: req.user!.userId });
    if (!profile) {
      res.status(404).json({ error: 'Candidate profile not found.' });
      return;
    }

    // Delete previous file if replacing
    if (profile.cvMetadata?.storedFileName) {
      const oldPath = path.resolve(env.UPLOAD_DIR, profile.cvMetadata.storedFileName);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    profile.cvMetadata = {
      originalName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedAt: new Date(),
    };
    await profile.save();

    await AuditLogModel.create({
      actorName: req.user!.name,
      actorRole: 'CANDIDATE',
      action: 'CV_UPLOAD',
      details: `Uploaded CV "${req.file.originalname}" (${Math.round(req.file.size / 1024)} KB).`,
    });

    res.json({ message: 'CV uploaded successfully.', cvMetadata: profile.cvMetadata });
  }
);

// Secure CV Download (Authorized for Owner Candidate, Assigned Interviewer, or Admin)
apiRouter.get('/profile/cv/:candidateUserId', authenticate, async (req: Request, res: Response) => {
  const { candidateUserId } = req.params;
  const requester = req.user!;

  if (requester.role === 'CANDIDATE' && requester.userId !== candidateUserId) {
    res.status(403).json({ error: 'Forbidden. Candidates may only access their own CV.' });
    return;
  }

  if (requester.role === 'INTERVIEWER') {
    const hasAssignedInterview = await InterviewSessionModel.exists({
      candidateId: candidateUserId,
      interviewerIds: requester.userId,
    });
    if (!hasAssignedInterview) {
      res.status(403).json({ error: 'Forbidden. You are not assigned to interview this candidate.' });
      return;
    }
  }

  const profile = await CandidateProfileModel.findOne({ userId: candidateUserId });
  if (!profile?.cvMetadata?.storedFileName) {
    res.status(404).json({ error: 'No CV uploaded for this candidate.' });
    return;
  }

  const filePath = path.resolve(env.UPLOAD_DIR, profile.cvMetadata.storedFileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'CV file not found on disk.' });
    return;
  }

  res.download(filePath, profile.cvMetadata.originalName);
});

// ============================================================================
// 2. AVAILABILITY MANAGEMENT
// ============================================================================

const availabilitySchema = z.object({
  userId: z.string().optional(),
  windows: z
    .array(
      z.object({
        startMs: z.number(),
        endMs: z.number(),
      })
    )
    .refine((list) => list.every((w) => w.endMs > w.startMs), {
      message: 'Every availability window must have endMs > startMs.',
    }),
});

apiRouter.put('/availability', authenticate, async (req: Request, res: Response) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid availability windows.', details: parsed.error.issues });
    return;
  }

  // Interviewer and Candidate availability can only be modified by the owning authenticated user.
  // Admins must not directly edit an interviewer's availability.
  if (req.user!.role === 'ADMIN') {
    res.status(403).json({
      error: 'Admins cannot directly edit interviewer or candidate availability. Panel members and candidates manage their own availability.',
    });
    return;
  }

  const targetUserId = req.user!.userId;
  const targetUser = await UserModel.findById(targetUserId);
  if (!targetUser) {
    res.status(404).json({ error: 'Target user not found.' });
    return;
  }

  // If interviewer modifies availability, validate that existing scheduled sessions fall within the new windows
  if (targetUser.role === 'INTERVIEWER') {
    const activeSessions = await InterviewSessionModel.find({
      interviewerIds: targetUserId,
      status: 'Scheduled',
    });

    for (const session of activeSessions) {
      const isContained = isContainedInAny(session.startMs, session.effectiveEndMs, parsed.data.windows);
      if (!isContained) {
        res.status(409).json({
          error: `Cannot update availability: Your confirmed session for "${session.roundName}" with candidate ${session.candidateName} (${new Date(session.startMs).toISOString().slice(11, 16)}–${new Date(session.endMs).toISOString().slice(11, 16)} UTC) falls outside the updated windows. Please request a rescheduling before removing this slot.`,
        });
        return;
      }
    }
  }

  const updated = await AvailabilityModel.findOneAndUpdate(
    { userId: targetUser._id },
    {
      $set: {
        role: targetUser.role,
        windows: parsed.data.windows,
      },
    },
    { new: true, upsert: true }
  );

  await AuditLogModel.create({
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: 'AVAILABILITY_UPDATED',
    details: `Updated ${parsed.data.windows.length} availability window(s) for ${targetUser.name}.`,
  });

  res.json({ message: 'Availability saved.', availability: updated });
});

// ============================================================================
// 3. ROOM MANAGEMENT
// ============================================================================

const roomSchema = z.object({
  name: z.string().min(2),
  building: z.string().default('Academic Block A'),
  capacity: z.number().int().min(1),
  features: z.array(z.string()).default([]),
  availableWindows: z.array(z.object({ startMs: z.number(), endMs: z.number() })),
});

apiRouter.get('/rooms', authenticate, async (_req: Request, res: Response) => {
  const rooms = await RoomModel.find().sort({ name: 1 });
  const activeSessions = await InterviewSessionModel.find({ status: 'Scheduled' });
  res.json({ rooms, activeSessions });
});

apiRouter.post('/rooms', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid room data.', details: parsed.error.issues });
    return;
  }

  const room = await RoomModel.create(parsed.data);
  await AuditLogModel.create({
    actorName: req.user!.name,
    actorRole: 'ADMIN',
    action: 'ROOM_CREATED',
    details: `Configured room "${room.name}" (capacity ${room.capacity}).`,
  });

  res.status(201).json({ room });
});

apiRouter.delete('/rooms/:roomId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const inUse = await InterviewSessionModel.exists({
    roomId: req.params.roomId,
    status: 'Scheduled',
  });
  if (inUse) {
    res.status(409).json({
      error: 'Cannot delete a room that has active scheduled interviews.',
    });
    return;
  }
  await RoomModel.findByIdAndDelete(req.params.roomId);
  res.json({ message: 'Room deleted.' });
});

// ============================================================================
// 4. PLACEMENT DRIVES & CANIDATE / INTERVIEWER ROSTERS
// ============================================================================

apiRouter.get('/drives', authenticate, async (_req: Request, res: Response) => {
  const drives = await PlacementDriveModel.find().sort({ createdAt: -1 });
  res.json({ drives });
});

const createDriveSchema = z.object({
  title: z.string().min(3),
  companyName: z.string().min(2),
  jobRole: z.string().min(2),
  packageLPA: z.string().default('24 LPA'),
  description: z.string().default(''),
  selfBookingEnabled: z.boolean().default(true),
  allowedTimeWindows: z.array(z.object({ startMs: z.number(), endMs: z.number() })).min(1),
  rounds: z
    .array(
      z.object({
        roundId: z.string(),
        name: z.string(),
        order: z.number().int().min(1),
        durationMinutes: z.number().int().min(15).max(180),
        bufferMinutes: z.number().int().min(0).max(60).default(10),
        requiredSkills: z.array(z.string()),
        panelSize: z.number().int().min(1).default(1),
        requiredRoomCapacity: z.number().int().min(2).default(2),
        prerequisiteRoundId: z.string().optional(),
        passingScoreThreshold: z.number().min(0).max(100).default(70),
      })
    )
    .min(1),
  eligibleCandidateIds: z.array(z.string()).default([]),
  assignedInterviewerIds: z.array(z.string()).default([]),
});

apiRouter.post('/drives', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createDriveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid placement drive payload.', details: parsed.error.issues });
    return;
  }

  const drive = await PlacementDriveModel.create({
    ...parsed.data,
    status: 'Draft',
  });

  if (parsed.data.eligibleCandidateIds.length > 0) {
    await CandidateProfileModel.updateMany(
      { userId: { $in: parsed.data.eligibleCandidateIds } },
      { $addToSet: { eligibleDriveIds: String(drive._id) } }
    );
  }

  await AuditLogModel.create({
    actorName: req.user!.name,
    actorRole: 'ADMIN',
    action: 'DRIVE_CREATED',
    details: `Created drive "${drive.title}" for ${drive.companyName}.`,
  });

  res.status(201).json({ drive });
});

apiRouter.delete('/drives/:driveId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { driveId } = req.params;
  const drive = await PlacementDriveModel.findById(driveId);
  if (!drive) {
    res.status(404).json({ error: 'Placement drive not found.' });
    return;
  }

  // Cascade cleanup of associated schedule versions and interview sessions
  const deletedSessions = await InterviewSessionModel.deleteMany({ driveId });
  await ScheduleVersionModel.deleteMany({ driveId });

  // Remove drive reference from candidate profiles
  await CandidateProfileModel.updateMany(
    { eligibleDriveIds: String(drive._id) },
    { $pull: { eligibleDriveIds: String(drive._id) } }
  );

  await PlacementDriveModel.findByIdAndDelete(driveId);

  await AuditLogModel.create({
    actorName: req.user!.name,
    actorRole: 'ADMIN',
    action: 'DRIVE_DELETED',
    details: `Deleted drive "${drive.title}" (${drive.companyName}) and purged ${deletedSessions.deletedCount} related session(s).`,
  });

  res.json({
    message: `Placement drive "${drive.title}" and ${deletedSessions.deletedCount} associated interview session(s) were successfully deleted.`,
    deletedDriveId: driveId,
  });
});

apiRouter.get('/admin/overview', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  const [
    drives,
    candidatesUsers,
    candidateProfiles,
    interviewerUsers,
    interviewerProfiles,
    availabilities,
    rooms,
    sessions,
    scheduleVersions,
    auditLogs,
  ] = await Promise.all([
    PlacementDriveModel.find().sort({ createdAt: -1 }),
    UserModel.find({ role: 'CANDIDATE' }).select('-passwordHash'),
    CandidateProfileModel.find(),
    UserModel.find({ role: 'INTERVIEWER' }).select('-passwordHash'),
    InterviewerProfileModel.find(),
    AvailabilityModel.find(),
    RoomModel.find(),
    InterviewSessionModel.find().sort({ startMs: 1 }),
    ScheduleVersionModel.find().sort({ createdAt: -1 }).limit(10),
    AuditLogModel.find().sort({ createdAt: -1 }).limit(15),
  ]);

  const availMap = new Map(availabilities.map((a) => [String(a.userId), a.windows]));
  const candProfileMap = new Map(candidateProfiles.map((p) => [String(p.userId), p]));
  const intProfileMap = new Map(interviewerProfiles.map((p) => [String(p.userId), p]));

  const candidates = candidatesUsers.map((u) => ({
    userId: String(u._id),
    name: u.name,
    email: u.email,
    department: u.department,
    profile: candProfileMap.get(String(u._id)) ?? null,
    availability: availMap.get(String(u._id)) ?? [],
  }));

  const interviewers = interviewerUsers.map((u) => ({
    userId: String(u._id),
    name: u.name,
    email: u.email,
    department: u.department,
    profile: intProfileMap.get(String(u._id)) ?? null,
    availability: availMap.get(String(u._id)) ?? [],
  }));

  res.json({
    drives,
    candidates,
    interviewers,
    rooms,
    sessions,
    scheduleVersions,
    auditLogs,
  });
});

apiRouter.patch(
  '/admin/candidates/:candidateUserId/eligibility',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const { candidateUserId } = req.params;
    const { driveId, eligible } = z
      .object({ driveId: z.string(), eligible: z.boolean() })
      .parse(req.body);

    if (eligible) {
      await CandidateProfileModel.findOneAndUpdate(
        { userId: candidateUserId },
        { $addToSet: { eligibleDriveIds: driveId } }
      );
      await PlacementDriveModel.findByIdAndUpdate(driveId, {
        $addToSet: { eligibleCandidateIds: candidateUserId },
      });
    } else {
      await CandidateProfileModel.findOneAndUpdate(
        { userId: candidateUserId },
        { $pull: { eligibleDriveIds: driveId } }
      );
      await PlacementDriveModel.findByIdAndUpdate(driveId, {
        $pull: { eligibleCandidateIds: candidateUserId },
      });
    }

    res.json({ message: 'Candidate drive eligibility updated.' });
  }
);

// ============================================================================
// 5. CSP SCHEDULE GENERATION, INDEPENDENT VALIDATION & PUBLICATION
// ============================================================================

async function buildCSPInputForDrive(driveId: string): Promise<{
  problemInput: CSPProblemInput;
  userMap: Map<string, string>;
  roomNameMap: Map<string, string>;
  driveTitle: string;
  companyName: string;
}> {
  const drive = await PlacementDriveModel.findById(driveId);
  if (!drive) {
    throw new Error('Placement drive not found.');
  }

  const [candUsers, candProfiles, intUsers, intProfiles, availabilities, rooms, otherSessions] =
    await Promise.all([
      UserModel.find({ role: 'CANDIDATE' }),
      CandidateProfileModel.find(),
      UserModel.find({ role: 'INTERVIEWER' }),
      InterviewerProfileModel.find(),
      AvailabilityModel.find(),
      RoomModel.find({ isActive: true }),
      InterviewSessionModel.find({
        driveId: { $ne: driveId },
        status: 'Scheduled',
      }),
    ]);

  const userMap = new Map<string, string>();
  candUsers.forEach((u) => userMap.set(String(u._id), u.name));
  intUsers.forEach((u) => userMap.set(String(u._id), u.name));

  const roomNameMap = new Map<string, string>();
  rooms.forEach((r) => roomNameMap.set(String(r._id), r.name));

  const availMap = new Map(availabilities.map((a) => [String(a.userId), a.windows]));
  const candProfMap = new Map(candProfiles.map((p) => [String(p.userId), p]));
  const intProfMap = new Map(intProfiles.map((p) => [String(p.userId), p]));

  const candidates = candUsers
    .filter((u) => drive.eligibleCandidateIds.includes(String(u._id)))
    .map((u) => {
      const prof = candProfMap.get(String(u._id));
      return {
        id: String(u._id),
        name: u.name,
        availableWindows: availMap.get(String(u._id)) ?? [],
        completedRoundIds: prof?.completedRoundIds ?? [],
        eligibleDriveIds: prof?.eligibleDriveIds ?? [String(drive._id)],
      };
    });

  const interviewers = intUsers.map((u) => {
    const prof = intProfMap.get(String(u._id));
    return {
      id: String(u._id),
      name: u.name,
      skills: prof?.skills ?? [],
      availableWindows: availMap.get(String(u._id)) ?? [],
      maxInterviewsPerDay: prof?.maxInterviewsPerDay ?? 6,
    };
  });

  const roomInputs = rooms.map((r) => ({
    id: String(r._id),
    name: r.name,
    capacity: r.capacity,
    features: r.features,
    availableWindows: r.availableWindows,
  }));

  const variables: InterviewVariable[] = [];
  const sortedRounds = [...drive.rounds].sort((a, b) => a.order - b.order);

  for (const cand of candidates) {
    for (const round of sortedRounds) {
      if (cand.completedRoundIds.includes(round.roundId)) continue;
      variables.push({
        id: `var_${drive._id}_${cand.id}_${round.roundId}`,
        driveId: String(drive._id),
        roundId: round.roundId,
        roundName: round.name,
        roundOrder: round.order,
        prerequisiteRoundId: round.prerequisiteRoundId,
        candidateId: cand.id,
        durationMinutes: round.durationMinutes,
        bufferMinutes: round.bufferMinutes,
        requiredSkills: round.requiredSkills,
        panelSize: round.panelSize,
        requiredRoomCapacity: round.requiredRoomCapacity,
        allowedTimeWindows: drive.allowedTimeWindows,
      });
    }
  }

  const existingReservations = otherSessions.map((s) => ({
    sessionId: s.variableId,
    candidateId: s.candidateId,
    interviewerIds: s.interviewerIds,
    roomId: s.roomId,
    window: { startMs: s.startMs, endMs: s.effectiveEndMs },
  }));

  return {
    problemInput: {
      variables,
      candidates,
      interviewers,
      rooms: roomInputs,
      existingReservations,
      slotGranularityMinutes: 15,
    },
    userMap,
    roomNameMap,
    driveTitle: drive.title,
    companyName: drive.companyName,
  };
}

apiRouter.post(
  '/schedules/generate/:driveId',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { driveId } = req.params;
      const { problemInput, userMap, roomNameMap, driveTitle, companyName } =
        await buildCSPInputForDrive(driveId);

      const solverResult = solver.solve(problemInput);
      const validationReport = validator.validate(problemInput, solverResult.assignments);

      await InterviewSessionModel.deleteMany({ driveId, status: 'Scheduled' });

      const sessionDocs = solverResult.assignments.map((a) => ({
        variableId: a.variableId,
        driveId: a.driveId,
        driveTitle,
        companyName,
        roundId: a.roundId,
        roundName: a.roundName ?? a.roundId,
        roundOrder:
          problemInput.variables.find((v) => v.id === a.variableId)?.roundOrder ?? 1,
        candidateId: a.candidateId,
        candidateName: userMap.get(a.candidateId) ?? a.candidateId,
        interviewerIds: a.interviewerIds,
        interviewerNames: a.interviewerIds.map((id) => userMap.get(id) ?? id),
        roomId: a.roomId,
        roomName: roomNameMap.get(a.roomId) ?? a.roomId,
        startMs: a.startMs,
        endMs: a.endMs,
        effectiveEndMs: a.effectiveEndMs,
        status: 'Scheduled' as const,
        isPublished: false,
        bookedVia: 'CSP_ENGINE' as const,
      }));

      if (sessionDocs.length > 0) {
        await InterviewSessionModel.insertMany(sessionDocs);
      }

      const nextStatus = validationReport.isValid ? 'Under Review' : 'Generated';
      await PlacementDriveModel.findByIdAndUpdate(driveId, { status: nextStatus });

      const scheduleVersion = await ScheduleVersionModel.create({
        driveId,
        status: nextStatus,
        solverStatus: solverResult.status,
        isCompleteSolution: solverResult.isCompleteSolution,
        assignmentsCount: solverResult.assignments.length,
        unscheduledDiagnostics: solverResult.unscheduled,
        validationReport,
        statistics: solverResult.statistics,
        createdBy: req.user!.name,
      });

      const nlSummary = await generateNaturalLanguageScheduleSummary(
        driveTitle,
        solverResult,
        validationReport
      );

      await AuditLogModel.create({
        actorName: req.user!.name,
        actorRole: 'ADMIN',
        action: 'CSP_SCHEDULE_GENERATED',
        details: nlSummary,
      });

      res.json({
        solverResult,
        validationReport,
        scheduleVersion,
        nlSummary,
        sessions: sessionDocs,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

apiRouter.post(
  '/schedules/publish/:driveId',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { driveId } = req.params;
      const { problemInput, driveTitle } = await buildCSPInputForDrive(driveId);
      const currentSessions = await InterviewSessionModel.find({
        driveId,
        status: 'Scheduled',
      });

      if (currentSessions.length === 0) {
        res.status(400).json({ error: 'No scheduled sessions exist to publish for this drive.' });
        return;
      }

      const assignments: CandidateSlotAssignment[] = currentSessions.map((s) => ({
        variableId: s.variableId,
        driveId: s.driveId,
        roundId: s.roundId,
        roundName: s.roundName,
        candidateId: s.candidateId,
        interviewerIds: s.interviewerIds,
        roomId: s.roomId,
        startMs: s.startMs,
        endMs: s.endMs,
        effectiveEndMs: s.effectiveEndMs,
      }));

      const validationReport = validator.validate(problemInput, assignments);
      if (!validationReport.isValid) {
        res.status(422).json({
          error: 'Publication blocked: Schedule contains hard-constraint violations.',
          validationReport,
        });
        return;
      }

      await InterviewSessionModel.updateMany(
        { driveId, status: 'Scheduled' },
        { $set: { isPublished: true } }
      );

      const drive = await PlacementDriveModel.findByIdAndUpdate(
        driveId,
        { status: 'Published' },
        { new: true }
      );

      await AuditLogModel.create({
        actorName: req.user!.name,
        actorRole: 'ADMIN',
        action: 'SCHEDULE_PUBLISHED',
        details: `Published ${currentSessions.length} validated interview sessions for "${driveTitle}".`,
      });

      res.json({
        message: `Published ${currentSessions.length} conflict-free interviews for ${driveTitle}.`,
        drive,
        validationReport,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

// ============================================================================
// 6. CANDIDATE SELF-BOOKING (WITH ATOMIC CONCURRENCY CONTROL)
// ============================================================================

apiRouter.get(
  '/candidate/self-booking/options/:driveId',
  authenticate,
  requireRole('CANDIDATE'),
  async (req: Request, res: Response) => {
    const { driveId } = req.params;
    const candidateId = req.user!.userId;

    const drive = await PlacementDriveModel.findById(driveId);
    if (!drive || !drive.selfBookingEnabled) {
      res.status(400).json({ error: 'Self-booking is not enabled for this placement drive.' });
      return;
    }

    if (!drive.eligibleCandidateIds.includes(candidateId)) {
      res.status(403).json({ error: 'You are not marked eligible for this placement drive.' });
      return;
    }

    const { problemInput, userMap, roomNameMap } = await buildCSPInputForDrive(driveId);
    const candidateVars = problemInput.variables.filter((v) => v.candidateId === candidateId);

    const activeSessions = await InterviewSessionModel.find({ status: 'Scheduled' });
    const existingReservations = activeSessions.map((s) => ({
      sessionId: s.variableId,
      candidateId: s.candidateId,
      interviewerIds: s.interviewerIds,
      roomId: s.roomId,
      window: { startMs: s.startMs, endMs: s.effectiveEndMs },
    }));

    const singleCandidateProblem: CSPProblemInput = {
      ...problemInput,
      variables: candidateVars.slice(0, 1),
      existingReservations,
    };

    const result = solver.solve(singleCandidateProblem);
    res.json({
      recommendedSlots: result.assignments.map((a) => ({
        ...a,
        interviewerNames: a.interviewerIds.map((id) => userMap.get(id) ?? id),
        roomName: roomNameMap.get(a.roomId) ?? a.roomId,
      })),
      unscheduled: result.unscheduled,
    });
  }
);

const selfBookRequestSchema = z.object({
  driveId: z.string(),
  roundId: z.string(),
  roomId: z.string(),
  interviewerIds: z.array(z.string()).min(1),
  startMs: z.number(),
});

apiRouter.post(
  '/candidate/self-book',
  authenticate,
  requireRole('CANDIDATE'),
  async (req: Request, res: Response) => {
    const parsed = selfBookRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid booking request.', details: parsed.error.issues });
      return;
    }

    const { driveId, roundId, roomId, interviewerIds, startMs } = parsed.data;
    const candidateId = req.user!.userId;

    const drive = await PlacementDriveModel.findById(driveId);
    if (!drive || !drive.selfBookingEnabled) {
      res.status(400).json({ error: 'Self-booking is disabled for this drive.' });
      return;
    }

    if (!drive.eligibleCandidateIds.includes(candidateId)) {
      res.status(403).json({ error: 'You are not eligible for this placement drive.' });
      return;
    }

    const round = drive.rounds.find((r) => r.roundId === roundId);
    if (!round) {
      res.status(404).json({ error: 'Interview round not found.' });
      return;
    }

    const endMs = startMs + round.durationMinutes * 60 * 1000;
    const effectiveEndMs = startMs + (round.durationMinutes + round.bufferMinutes) * 60 * 1000;

    const overlappingSession = await InterviewSessionModel.findOne({
      status: 'Scheduled',
      startMs: { $lt: effectiveEndMs },
      effectiveEndMs: { $gt: startMs },
      $or: [
        { roomId },
        { candidateId },
        { interviewerIds: { $in: interviewerIds } },
      ],
    });

    if (overlappingSession) {
      res.status(409).json({
        error:
          'Slot conflict detected: This room, interviewer, or candidate slot was just reserved by another concurrent request.',
      });
      return;
    }

    const [candAvail, intAvails, roomDoc, intUsers] = await Promise.all([
      AvailabilityModel.findOne({ userId: candidateId }),
      AvailabilityModel.find({ userId: { $in: interviewerIds } }),
      RoomModel.findById(roomId),
      UserModel.find({ _id: { $in: interviewerIds } }),
    ]);

    if (!candAvail || !isContainedInAny(startMs, endMs, candAvail.windows)) {
      res.status(422).json({ error: 'Requested slot is outside your submitted availability windows.' });
      return;
    }

    if (!roomDoc || !isContainedInAny(startMs, effectiveEndMs, roomDoc.availableWindows)) {
      res.status(422).json({ error: 'Selected room is not available during the requested interval.' });
      return;
    }

    for (const intId of interviewerIds) {
      const ia = intAvails.find((a) => String(a.userId) === intId);
      if (!ia || !isContainedInAny(startMs, effectiveEndMs, ia.windows)) {
        res.status(422).json({ error: 'Selected interviewer is not available during this slot.' });
        return;
      }
    }

    const variableId = `var_${driveId}_${candidateId}_${roundId}`;

    try {
      const session = await InterviewSessionModel.findOneAndUpdate(
        {
          variableId,
          status: { $ne: 'Completed' },
        },
        {
          $set: {
            driveId,
            driveTitle: drive.title,
            companyName: drive.companyName,
            roundId,
            roundName: round.name,
            roundOrder: round.order,
            candidateId,
            candidateName: req.user!.name,
            interviewerIds,
            interviewerNames: intUsers.map((u) => u.name),
            roomId,
            roomName: roomDoc.name,
            startMs,
            endMs,
            effectiveEndMs,
            status: 'Scheduled',
            isPublished: true,
            bookedVia: 'CANDIDATE_SELF_BOOKING',
          },
          $inc: { version: 1 },
        },
        { new: true, upsert: true }
      );

      await AuditLogModel.create({
        actorName: req.user!.name,
        actorRole: 'CANDIDATE',
        action: 'CANDIDATE_SELF_BOOKED',
        details: `Self-booked ${round.name} in ${roomDoc.name} at ${new Date(startMs).toISOString()}.`,
      });

      res.status(201).json({ message: 'Interview slot confirmed.', session });
    } catch (err) {
      res.status(409).json({
        error: 'Concurrent booking race prevented. Please refresh and choose an available slot.',
        details: (err as Error).message,
      });
    }
  }
);

// ============================================================================
// 7. EMERGENCY CANCELLATION & LOCALIZED RIPPLE-EFFECT RESCHEDULING
// ============================================================================

const cancelSchema = z.object({
  reason: z.string().min(3),
});

apiRouter.post(
  '/sessions/:sessionId/cancel-and-repair',
  authenticate,
  requireRole('INTERVIEWER', 'ADMIN'),
  async (req: Request, res: Response) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a cancellation reason.' });
      return;
    }

    const session = await InterviewSessionModel.findById(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }

    if (
      req.user!.role === 'INTERVIEWER' &&
      !session.interviewerIds.includes(req.user!.userId)
    ) {
      res.status(403).json({ error: 'You are not assigned to this interview session.' });
      return;
    }

    const droppedInterviewerId =
      req.user!.role === 'INTERVIEWER' ? req.user!.userId : session.interviewerIds[0];

    const { problemInput, userMap, roomNameMap } = await buildCSPInputForDrive(session.driveId);
    const variable = problemInput.variables.find((v) => v.id === session.variableId);

    const otherDriveSessions = await InterviewSessionModel.find({
      driveId: session.driveId,
      _id: { $ne: session._id },
      status: 'Scheduled',
    });

    const unaffectedAssignments: CandidateSlotAssignment[] = otherDriveSessions.map((s) => ({
      variableId: s.variableId,
      driveId: s.driveId,
      roundId: s.roundId,
      roundName: s.roundName,
      candidateId: s.candidateId,
      interviewerIds: s.interviewerIds,
      roomId: s.roomId,
      startMs: s.startMs,
      endMs: s.endMs,
      effectiveEndMs: s.effectiveEndMs,
    }));

    if (variable) {
      const repairResult = rescheduler.repairCancelledAssignment(
        {
          variableId: session.variableId,
          driveId: session.driveId,
          roundId: session.roundId,
          roundName: session.roundName,
          candidateId: session.candidateId,
          interviewerIds: session.interviewerIds,
          roomId: session.roomId,
          startMs: session.startMs,
          endMs: session.endMs,
          effectiveEndMs: session.effectiveEndMs,
        },
        variable,
        droppedInterviewerId,
        problemInput,
        unaffectedAssignments
      );

      if (repairResult.repaired && repairResult.updatedAssignment) {
        const u = repairResult.updatedAssignment;
        session.interviewerIds = u.interviewerIds;
        session.interviewerNames = u.interviewerIds.map((id) => userMap.get(id) ?? id);
        session.roomId = u.roomId;
        session.roomName = roomNameMap.get(u.roomId) ?? u.roomId;
        session.startMs = u.startMs;
        session.endMs = u.endMs;
        session.effectiveEndMs = u.effectiveEndMs;
        session.bookedVia = 'RESCHEDULE_ENGINE';
        session.cancellationReason = `Auto-repaired (${repairResult.strategy}) after cancellation: ${parsed.data.reason}`;
        await session.save();

        await AuditLogModel.create({
          actorName: req.user!.name,
          actorRole: req.user!.role,
          action: 'AUTO_RESCHEDULED',
          details: `Session ${session.variableId} automatically repaired via ${repairResult.strategy} -> Panel [${session.interviewerNames.join(', ')}] in ${session.roomName}.`,
        });

        res.json({
          repaired: true,
          strategy: repairResult.strategy,
          session,
          validationReport: repairResult.validationReport,
        });
        return;
      }

      session.status = 'Cancelled';
      session.cancellationReason = `${parsed.data.reason} | Blocking constraint: ${repairResult.blockingReason}`;
      await session.save();

      await AuditLogModel.create({
        actorName: req.user!.name,
        actorRole: req.user!.role,
        action: 'CANCELLATION_UNRESOLVED',
        details: `Session ${session.variableId} cancelled. Auto-repair blocked: ${repairResult.blockingReason}`,
      });

      res.json({
        repaired: false,
        strategy: 'UNRESOLVED',
        blockingReason: repairResult.blockingReason,
        session,
      });
      return;
    }

    session.status = 'Cancelled';
    session.cancellationReason = parsed.data.reason;
    await session.save();
    res.json({ repaired: false, session });
  }
);

// ============================================================================
// 8. STRUCTURED INTERVIEW FEEDBACK & AUTOMATED ROUND PROGRESSION
// ============================================================================

const feedbackSchema = z.object({
  sessionId: z.string(),
  problemSolvingScore: z.number().min(0).max(100),
  technicalDepthScore: z.number().min(0).max(100),
  communicationScore: z.number().min(0).max(100),
  recommendation: z.enum(['STRONG_HIRE', 'HIRE', 'HOLD', 'NO_HIRE']),
  strengths: z.string().min(5),
  improvements: z.string().default(''),
});

apiRouter.post(
  '/feedback',
  authenticate,
  requireRole('INTERVIEWER'),
  async (req: Request, res: Response) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid feedback rubric scores.', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const session = await InterviewSessionModel.findById(data.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }

    if (!session.interviewerIds.includes(req.user!.userId)) {
      res.status(403).json({ error: 'You are not assigned to evaluate this interview session.' });
      return;
    }

    const overallScore = Math.round(
      (data.problemSolvingScore + data.technicalDepthScore + data.communicationScore) / 3
    );

    const drive = await PlacementDriveModel.findById(session.driveId);
    const roundConfig = drive?.rounds.find((r) => r.roundId === session.roundId);
    const threshold = roundConfig?.passingScoreThreshold ?? 70;

    const passedRound =
      overallScore >= threshold &&
      (data.recommendation === 'STRONG_HIRE' || data.recommendation === 'HIRE');

    session.status = 'Completed';
    await session.save();

    let nextStageLabel = `Evaluated in ${session.roundName} (${overallScore}/100)`;
    if (passedRound && drive) {
      const nextRound = drive.rounds.find((r) => r.order === session.roundOrder + 1);
      nextStageLabel = nextRound
        ? `Advanced to ${nextRound.name}`
        : `Cleared Final Round (${drive.companyName} Offer Eligible)`;

      await CandidateProfileModel.findOneAndUpdate(
        { userId: session.candidateId },
        {
          $addToSet: { completedRoundIds: session.roundId },
          $set: { currentStage: nextStageLabel },
        }
      );
    } else {
      nextStageLabel = `Did not advance past ${session.roundName}`;
      await CandidateProfileModel.findOneAndUpdate(
        { userId: session.candidateId },
        { $set: { currentStage: nextStageLabel } }
      );
    }

    const feedback = await FeedbackModel.findOneAndUpdate(
      { sessionId: String(session._id) },
      {
        $set: {
          driveId: session.driveId,
          roundId: session.roundId,
          roundName: session.roundName,
          candidateId: session.candidateId,
          candidateName: session.candidateName,
          interviewerId: req.user!.userId,
          interviewerName: req.user!.name,
          problemSolvingScore: data.problemSolvingScore,
          technicalDepthScore: data.technicalDepthScore,
          communicationScore: data.communicationScore,
          overallScore,
          recommendation: data.recommendation,
          strengths: data.strengths,
          improvements: data.improvements,
          advancedToNextRound: passedRound,
        },
      },
      { new: true, upsert: true }
    );

    await AuditLogModel.create({
      actorName: req.user!.name,
      actorRole: 'INTERVIEWER',
      action: 'FEEDBACK_SUBMITTED',
      details: `Evaluated ${session.candidateName} for ${session.roundName}: ${overallScore}/100 (${data.recommendation}) -> ${nextStageLabel}.`,
    });

    res.status(201).json({
      message: 'Feedback submitted and candidate progression updated.',
      feedback,
      nextStageLabel,
    });
  }
);

// ============================================================================
// 9. ROLE-SPECIFIC DASHBOARD DATA & .ICS EXPORT
// ============================================================================

apiRouter.get(
  '/interviewer/dashboard',
  authenticate,
  requireRole('INTERVIEWER'),
  async (req: Request, res: Response) => {
    const interviewerId = req.user!.userId;
    const [sessions, feedbacks, profile, availability, drives] = await Promise.all([
      InterviewSessionModel.find({ interviewerIds: interviewerId }).sort({ startMs: 1 }),
      FeedbackModel.find({ interviewerId }).sort({ createdAt: -1 }),
      InterviewerProfileModel.findOne({ userId: interviewerId }),
      AvailabilityModel.findOne({ userId: interviewerId }),
      PlacementDriveModel.find(),
    ]);

    res.json({
      sessions,
      feedbacks,
      profile,
      availability: availability?.windows ?? [],
      drives,
    });
  }
);

apiRouter.get(
  '/candidate/dashboard',
  authenticate,
  requireRole('CANDIDATE'),
  async (req: Request, res: Response) => {
    const candidateId = req.user!.userId;
    const [sessions, profile, availability, drives] = await Promise.all([
      InterviewSessionModel.find({
        candidateId,
        $or: [{ isPublished: true }, { bookedVia: 'CANDIDATE_SELF_BOOKING' }],
      }).sort({ startMs: 1 }),
      CandidateProfileModel.findOne({ userId: candidateId }),
      AvailabilityModel.findOne({ userId: candidateId }),
      PlacementDriveModel.find({ eligibleCandidateIds: candidateId }),
    ]);

    res.json({
      sessions,
      profile,
      availability: availability?.windows ?? [],
      drives,
    });
  }
);

