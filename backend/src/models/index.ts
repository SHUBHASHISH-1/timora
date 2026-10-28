// backend/src/models/index.ts

import mongoose, { Schema, Document } from 'mongoose';
import { DriveStatus, Role, SessionStatus, TimeWindow } from '../../../shared/types/csp';

const TimeWindowSchema = new Schema<TimeWindow>(
  {
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
  },
  { _id: false }
);

// 1. User Model (Base Identity)
export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  department?: string;
  phone?: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'INTERVIEWER', 'CANDIDATE'], required: true, index: true },
    department: { type: String, default: 'Computer Science & Engineering' },
    phone: { type: String, default: '' },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', UserSchema);

// 2. CandidateProfile Model
export interface ICandidateProfile extends Document {
  userId: mongoose.Types.ObjectId;
  registrationNumber: string;
  degree: string;
  branch: string;
  graduationYear: number;
  cgpa: number;
  skills: string[];
  eligibleDriveIds: string[];
  completedRoundIds: string[];
  currentStage: string;
  cvMetadata?: {
    originalName: string;
    storedFileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
  };
}

const CandidateProfileSchema = new Schema<ICandidateProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    registrationNumber: { type: String, required: true },
    degree: { type: String, default: 'B.Tech' },
    branch: { type: String, default: 'CSE' },
    graduationYear: { type: Number, default: 2027 },
    cgpa: { type: Number, default: 8.5 },
    skills: [{ type: String }],
    eligibleDriveIds: [{ type: String }],
    completedRoundIds: [{ type: String }],
    currentStage: { type: String, default: 'Registered' },
    cvMetadata: {
      originalName: String,
      storedFileName: String,
      mimeType: String,
      sizeBytes: Number,
      uploadedAt: Date,
    },
  },
  { timestamps: true }
);

export const CandidateProfileModel = mongoose.model<ICandidateProfile>(
  'CandidateProfile',
  CandidateProfileSchema
);

// 3. InterviewerProfile Model
export interface IInterviewerProfile extends Document {
  userId: mongoose.Types.ObjectId;
  company: string;
  department: string;
  skills: string[];
  maxInterviewsPerDay: number;
}

const InterviewerProfileSchema = new Schema<IInterviewerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    company: { type: String, required: true },
    department: { type: String, default: 'Engineering' },
    skills: [{ type: String }],
    maxInterviewsPerDay: { type: Number, default: 6 },
  },
  { timestamps: true }
);

export const InterviewerProfileModel = mongoose.model<IInterviewerProfile>(
  'InterviewerProfile',
  InterviewerProfileSchema
);

// 4. Room Model
export interface IRoom extends Document {
  name: string;
  building: string;
  capacity: number;
  features: string[];
  availableWindows: TimeWindow[];
  isActive: boolean;
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    building: { type: String, default: 'Academic Block A' },
    capacity: { type: Number, required: true, min: 1 },
    features: [{ type: String }],
    availableWindows: [TimeWindowSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const RoomModel = mongoose.model<IRoom>('Room', RoomSchema);

// 5. Availability Model (Candidate & Interviewer Windows)
export interface IAvailability extends Document {
  userId: mongoose.Types.ObjectId;
  role: Role;
  windows: TimeWindow[];
  updatedAt: Date;
}

const AvailabilitySchema = new Schema<IAvailability>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    role: { type: String, enum: ['ADMIN', 'INTERVIEWER', 'CANDIDATE'], required: true },
    windows: [TimeWindowSchema],
  },
  { timestamps: true }
);

export const AvailabilityModel = mongoose.model<IAvailability>('Availability', AvailabilitySchema);

// 6. PlacementDrive Model (Includes embedded Round definitions)
export interface IInterviewRoundConfig {
  roundId: string;
  name: string;
  order: number;
  durationMinutes: number;
  bufferMinutes: number;
  requiredSkills: string[];
  panelSize: number;
  requiredRoomCapacity: number;
  prerequisiteRoundId?: string;
  passingScoreThreshold: number;
}

export interface IPlacementDrive extends Document {
  title: string;
  companyName: string;
  jobRole: string;
  packageLPA: string;
  description: string;
  status: DriveStatus;
  selfBookingEnabled: boolean;
  allowedTimeWindows: TimeWindow[];
  rounds: IInterviewRoundConfig[];
  eligibleCandidateIds: string[];
  assignedInterviewerIds: string[];
}

const PlacementDriveSchema = new Schema<IPlacementDrive>(
  {
    title: { type: String, required: true },
    companyName: { type: String, required: true },
    jobRole: { type: String, required: true },
    packageLPA: { type: String, default: '24 LPA' },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Draft', 'Generated', 'Under Review', 'Published', 'Cancelled', 'Completed'],
      default: 'Draft',
      index: true,
    },
    selfBookingEnabled: { type: Boolean, default: true },
    allowedTimeWindows: [TimeWindowSchema],
    rounds: [
      {
        roundId: { type: String, required: true },
        name: { type: String, required: true },
        order: { type: Number, required: true },
        durationMinutes: { type: Number, required: true },
        bufferMinutes: { type: Number, default: 10 },
        requiredSkills: [{ type: String }],
        panelSize: { type: Number, default: 1 },
        requiredRoomCapacity: { type: Number, default: 2 },
        prerequisiteRoundId: { type: String },
        passingScoreThreshold: { type: Number, default: 70 },
      },
    ],
    eligibleCandidateIds: [{ type: String }],
    assignedInterviewerIds: [{ type: String }],
  },
  { timestamps: true }
);

export const PlacementDriveModel = mongoose.model<IPlacementDrive>(
  'PlacementDrive',
  PlacementDriveSchema
);

// 7. InterviewSession Model (Persisted Scheduled / Self-Booked Interviews with OCC)
export interface IInterviewSession extends Document {
  variableId: string;
  driveId: string;
  driveTitle: string;
  companyName: string;
  roundId: string;
  roundName: string;
  roundOrder: number;
  candidateId: string;
  candidateName: string;
  interviewerIds: string[];
  interviewerNames: string[];
  roomId: string;
  roomName: string;
  startMs: number;
  endMs: number;
  effectiveEndMs: number;
  status: SessionStatus;
  isPublished: boolean;
  bookedVia: 'CSP_ENGINE' | 'CANDIDATE_SELF_BOOKING' | 'RESCHEDULE_ENGINE';
  cancellationReason?: string;
  version: number;
}

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    variableId: { type: String, required: true, unique: true, index: true },
    driveId: { type: String, required: true, index: true },
    driveTitle: { type: String, required: true },
    companyName: { type: String, required: true },
    roundId: { type: String, required: true },
    roundName: { type: String, required: true },
    roundOrder: { type: Number, required: true },
    candidateId: { type: String, required: true, index: true },
    candidateName: { type: String, required: true },
    interviewerIds: [{ type: String, index: true }],
    interviewerNames: [{ type: String }],
    roomId: { type: String, required: true, index: true },
    roomName: { type: String, required: true },
    startMs: { type: Number, required: true, index: true },
    endMs: { type: Number, required: true },
    effectiveEndMs: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled'],
      default: 'Scheduled',
      index: true,
    },
    isPublished: { type: Boolean, default: false, index: true },
    bookedVia: {
      type: String,
      enum: ['CSP_ENGINE', 'CANDIDATE_SELF_BOOKING', 'RESCHEDULE_ENGINE'],
      default: 'CSP_ENGINE',
    },
    cancellationReason: { type: String },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, optimisticConcurrency: true }
);

export const InterviewSessionModel = mongoose.model<IInterviewSession>(
  'InterviewSession',
  InterviewSessionSchema
);

// 8. ScheduleVersion Model (Stores Solver Diagnostics, Conflicts & Validation Report)
export interface IScheduleVersion extends Document {
  driveId: string;
  status: DriveStatus;
  solverStatus: string;
  isCompleteSolution: boolean;
  assignmentsCount: number;
  unscheduledDiagnostics: Array<{
    variableId: string;
    candidateId: string;
    roundId: string;
    reasonCode: string;
    explanation: string;
  }>;
  validationReport: {
    isValid: boolean;
    checkedAssignments: number;
    violations: Array<{
      code: string;
      variableId: string;
      message: string;
      conflictingVariableId?: string;
    }>;
    validatedAt: string;
  };
  statistics: {
    exploredNodes: number;
    backtracks: number;
    prunedBranches: number;
    executionTimeMs: number;
    softObjectiveScore: number;
  };
  createdBy: string;
}

const ScheduleVersionSchema = new Schema<IScheduleVersion>(
  {
    driveId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    solverStatus: { type: String, required: true },
    isCompleteSolution: { type: Boolean, required: true },
    assignmentsCount: { type: Number, required: true },
    unscheduledDiagnostics: [
      {
        variableId: String,
        candidateId: String,
        roundId: String,
        reasonCode: String,
        explanation: String,
      },
    ],
    validationReport: {
      isValid: Boolean,
      checkedAssignments: Number,
      violations: [
        {
          code: String,
          variableId: String,
          message: String,
          conflictingVariableId: String,
        },
      ],
      validatedAt: String,
    },
    statistics: {
      exploredNodes: Number,
      backtracks: Number,
      prunedBranches: Number,
      executionTimeMs: Number,
      softObjectiveScore: Number,
    },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const ScheduleVersionModel = mongoose.model<IScheduleVersion>(
  'ScheduleVersion',
  ScheduleVersionSchema
);

// 9. Feedback Model (Live Evaluation Rubrics & Progression)
export interface IFeedback extends Document {
  sessionId: string;
  driveId: string;
  roundId: string;
  roundName: string;
  candidateId: string;
  candidateName: string;
  interviewerId: string;
  interviewerName: string;
  problemSolvingScore: number; // 0-100
  technicalDepthScore: number; // 0-100
  communicationScore: number;  // 0-100
  overallScore: number;        // Computed average
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'HOLD' | 'NO_HIRE';
  strengths: string;
  improvements: string;
  advancedToNextRound: boolean;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    driveId: { type: String, required: true, index: true },
    roundId: { type: String, required: true },
    roundName: { type: String, required: true },
    candidateId: { type: String, required: true, index: true },
    candidateName: { type: String, required: true },
    interviewerId: { type: String, required: true, index: true },
    interviewerName: { type: String, required: true },
    problemSolvingScore: { type: Number, required: true, min: 0, max: 100 },
    technicalDepthScore: { type: Number, required: true, min: 0, max: 100 },
    communicationScore: { type: Number, required: true, min: 0, max: 100 },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    recommendation: {
      type: String,
      enum: ['STRONG_HIRE', 'HIRE', 'HOLD', 'NO_HIRE'],
      required: true,
    },
    strengths: { type: String, required: true },
    improvements: { type: String, default: '' },
    advancedToNextRound: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const FeedbackModel = mongoose.model<IFeedback>('Feedback', FeedbackSchema);

// 10. AuditLog Model
export interface IAuditLog extends Document {
  actorName: string;
  actorRole: Role;
  action: string;
  details: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorName: { type: String, required: true },
    actorRole: { type: String, enum: ['ADMIN', 'INTERVIEWER', 'CANDIDATE'], required: true },
    action: { type: String, required: true },
    details: { type: String, required: true },
  },
  { timestamps: true }
);

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

