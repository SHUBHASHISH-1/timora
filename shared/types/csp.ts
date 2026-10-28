// shared/types/csp.ts

export type Role = 'ADMIN' | 'INTERVIEWER' | 'CANDIDATE';

export type DriveStatus =
  | 'Draft'
  | 'Generated'
  | 'Under Review'
  | 'Published'
  | 'Cancelled'
  | 'Completed';

export type SessionStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface TimeWindow {
  startMs: number; // UTC Epoch ms
  endMs: number;   // UTC Epoch ms
}

export interface CandidateInput {
  id: string;
  name: string;
  availableWindows: TimeWindow[];
  completedRoundIds: string[];
  eligibleDriveIds: string[];
}

export interface InterviewerInput {
  id: string;
  name: string;
  skills: string[];
  availableWindows: TimeWindow[];
  maxInterviewsPerDay?: number;
}

export interface RoomInput {
  id: string;
  name: string;
  capacity: number;
  features: string[];
  availableWindows: TimeWindow[];
}

export interface InterviewVariable {
  id: string;
  driveId: string;
  roundId: string;
  roundName: string;
  roundOrder: number;
  prerequisiteRoundId?: string;
  candidateId: string;
  durationMinutes: number;
  bufferMinutes: number;
  requiredSkills: string[];
  panelSize: number;
  requiredRoomCapacity: number;
  requiredRoomFeatures?: string[];
  allowedTimeWindows: TimeWindow[];
}

export interface ExistingReservation {
  sessionId: string;
  candidateId: string;
  interviewerIds: string[];
  roomId: string;
  window: TimeWindow;
}

export interface CandidateSlotAssignment {
  variableId: string;
  driveId: string;
  roundId: string;
  roundName?: string;
  candidateId: string;
  interviewerIds: string[];
  roomId: string;
  startMs: number;
  endMs: number;
  effectiveEndMs: number;
}

export interface CSPProblemInput {
  variables: InterviewVariable[];
  candidates: CandidateInput[];
  interviewers: InterviewerInput[];
  rooms: RoomInput[];
  existingReservations: ExistingReservation[];
  slotGranularityMinutes?: number;
  maxSearchNodes?: number;
  timeoutMs?: number;
}

export type BlockingReasonCode =
  | 'CANDIDATE_INELIGIBLE'
  | 'UNMET_ROUND_PREREQUISITE'
  | 'NO_CANDIDATE_AVAILABILITY'
  | 'NO_QUALIFIED_INTERVIEWER'
  | 'NO_INTERVIEWER_AVAILABILITY'
  | 'NO_COMPATIBLE_ROOM'
  | 'RESOURCE_CONFLICT_EXHAUSTED'
  | 'SEARCH_LIMIT_REACHED';

export interface UnscheduledDiagnostic {
  variableId: string;
  candidateId: string;
  roundId: string;
  reasonCode: BlockingReasonCode;
  explanation: string;
}

export type SolverStatus =
  | 'OPTIMAL_OR_FEASIBLE'
  | 'PARTIAL_OR_INFEASIBLE'
  | 'SEARCH_TIMEOUT_OR_LIMIT';

export interface CSPSolverResult {
  status: SolverStatus;
  isCompleteSolution: boolean;
  assignments: CandidateSlotAssignment[];
  unscheduled: UnscheduledDiagnostic[];
  statistics: {
    exploredNodes: number;
    backtracks: number;
    prunedBranches: number;
    executionTimeMs: number;
    softObjectiveScore: number;
  };
  warnings: string[];
}

export interface HardConstraintViolation {
  code:
    | 'CANDIDATE_OVERLAP'
    | 'INTERVIEWER_OVERLAP'
    | 'ROOM_OVERLAP'
    | 'CANDIDATE_UNAVAILABLE'
    | 'INTERVIEWER_UNAVAILABLE'
    | 'ROOM_UNAVAILABLE'
    | 'SKILL_MISMATCH'
    | 'ROOM_CAPACITY_INSUFFICIENT'
    | 'ROOM_FEATURE_MISSING'
    | 'INVALID_DURATION'
    | 'ROUND_DEPENDENCY_VIOLATION'
    | 'CANDIDATE_NOT_ELIGIBLE'
    | 'PANEL_SIZE_MISMATCH';
  variableId: string;
  message: string;
  conflictingVariableId?: string;
}

export interface ScheduleValidationReport {
  isValid: boolean;
  checkedAssignments: number;
  violations: HardConstraintViolation[];
  validatedAt: string;
}

export interface RescheduleResult {
  repaired: boolean;
  strategy: 'IN_PLACE_INTERVIEWER_SWAP' | 'TIME_AND_ROOM_SHIFT' | 'UNRESOLVED';
  updatedAssignment?: CandidateSlotAssignment;
  validationReport?: ScheduleValidationReport;
  blockingReason?: string;
}

