// backend/tests/csp.spec.ts

import { describe, it, expect } from 'vitest';
import { TimoraCSPSolver } from '../src/engine/cspSolver';
import { IndependentScheduleValidator } from '../src/engine/scheduleValidator';
import { LocalizedRescheduler } from '../src/engine/rescheduler';
import { CSPProblemInput } from '../../shared/types/csp';

const solver = new TimoraCSPSolver();
const validator = new IndependentScheduleValidator();
const rescheduler = new LocalizedRescheduler();

const T0 = Date.UTC(2026, 9, 28, 9, 0, 0); // 09:00
const H1 = 60 * 60 * 1000;

function makeBaseProblem(): CSPProblemInput {
  return {
    variables: [
      {
        id: 'V1',
        driveId: 'D1',
        roundId: 'R1',
        roundName: 'Tech Round 1',
        roundOrder: 1,
        candidateId: 'C1',
        durationMinutes: 45,
        bufferMinutes: 15,
        requiredSkills: ['DSA'],
        panelSize: 1,
        requiredRoomCapacity: 2,
        allowedTimeWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
      },
    ],
    candidates: [
      {
        id: 'C1',
        name: 'Aarav',
        availableWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
        completedRoundIds: [],
        eligibleDriveIds: ['D1'],
      },
    ],
    interviewers: [
      {
        id: 'I1',
        name: 'Leena',
        skills: ['DSA', 'System Design'],
        availableWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
        maxInterviewsPerDay: 5,
      },
    ],
    rooms: [
      {
        id: 'RM1',
        name: 'Hall B',
        capacity: 4,
        features: ['Whiteboard'],
        availableWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
      },
    ],
    existingReservations: [],
    slotGranularityMinutes: 15,
  };
}

describe('TIMORA CSP Engine & Independent Schedule Validator (17 Mandatory Scenarios)', () => {
  it('1. Solves a simple feasible schedule and passes independent validation', () => {
    const problem = makeBaseProblem();
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(true);
    expect(res.assignments).toHaveLength(1);
    const val = validator.validate(problem, res.assignments);
    expect(val.isValid).toBe(true);
  });

  it('2. Rejects assignment to an unavailable interviewer', () => {
    const problem = makeBaseProblem();
    problem.interviewers[0].availableWindows = [];
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(false);
    expect(res.unscheduled[0].reasonCode).toBe('NO_INTERVIEWER_AVAILABILITY');
  });

  it('3. Prevents double-booked interviewer across two simultaneous candidates', () => {
    const problem = makeBaseProblem();
    const narrow = [{ startMs: T0, endMs: T0 + H1 }];
    problem.variables[0].allowedTimeWindows = narrow;
    problem.candidates[0].availableWindows = narrow;
    problem.interviewers[0].availableWindows = narrow;
    problem.rooms[0].availableWindows = narrow;

    problem.candidates.push({
      id: 'C2',
      name: 'Divya',
      availableWindows: narrow,
      completedRoundIds: [],
      eligibleDriveIds: ['D1'],
    });
    problem.rooms.push({
      id: 'RM2',
      name: 'Room 2',
      capacity: 4,
      features: [],
      availableWindows: narrow,
    });
    problem.variables.push({
      ...problem.variables[0],
      id: 'V2',
      candidateId: 'C2',
    });

    const res = solver.solve(problem);
    expect(res.assignments).toHaveLength(1);
    expect(res.unscheduled).toHaveLength(1);
    expect(validator.validate(problem, res.assignments).isValid).toBe(true);
  });

  it('4. Prevents double-booked candidate across two simultaneous interviews', () => {
    const problem = makeBaseProblem();
    const narrow = [{ startMs: T0, endMs: T0 + H1 }];
    problem.variables[0].allowedTimeWindows = narrow;
    problem.candidates[0].availableWindows = narrow;

    problem.interviewers.push({
      id: 'I2',
      name: 'Farhan',
      skills: ['DSA'],
      availableWindows: narrow,
    });
    problem.rooms.push({
      id: 'RM2',
      name: 'Room 2',
      capacity: 4,
      features: [],
      availableWindows: narrow,
    });
    problem.variables.push({
      ...problem.variables[0],
      id: 'V2',
      roundId: 'R_PARALLEL',
      roundOrder: 1,
    });

    const res = solver.solve(problem);
    expect(res.assignments).toHaveLength(1);
    expect(validator.validate(problem, res.assignments).isValid).toBe(true);
  });

  it('5. Prevents room conflicts when only one room is available in a single slot', () => {
    const problem = makeBaseProblem();
    const narrow = [{ startMs: T0, endMs: T0 + H1 }];
    problem.variables[0].allowedTimeWindows = narrow;
    problem.rooms[0].availableWindows = narrow;

    problem.candidates.push({
      id: 'C2',
      name: 'Divya',
      availableWindows: narrow,
      completedRoundIds: [],
      eligibleDriveIds: ['D1'],
    });
    problem.interviewers.push({
      id: 'I2',
      name: 'Farhan',
      skills: ['DSA'],
      availableWindows: narrow,
    });
    problem.variables.push({
      ...problem.variables[0],
      id: 'V2',
      candidateId: 'C2',
      allowedTimeWindows: narrow,
    });

    const res = solver.solve(problem);
    expect(res.assignments).toHaveLength(1);
    expect(res.unscheduled).toHaveLength(1);
  });

  it('6. Rejects interviewer without the required skill tag', () => {
    const problem = makeBaseProblem();
    problem.variables[0].requiredSkills = ['Rust', 'Kernel'];
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(false);
    expect(res.unscheduled[0].reasonCode).toBe('NO_QUALIFIED_INTERVIEWER');
  });

  it('7. Rejects rooms with insufficient capacity', () => {
    const problem = makeBaseProblem();
    problem.rooms[0].capacity = 1;
    problem.variables[0].requiredRoomCapacity = 4;
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(false);
    expect(res.unscheduled[0].reasonCode).toBe('NO_COMPATIBLE_ROOM');
  });

  it('8. Supports different interview durations and buffers accurately', () => {
    const problem = makeBaseProblem();
    problem.variables[0].durationMinutes = 90;
    problem.variables[0].bufferMinutes = 30;
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(true);
    const a = res.assignments[0];
    expect(a.endMs - a.startMs).toBe(90 * 60 * 1000);
    expect(a.effectiveEndMs - a.startMs).toBe(120 * 60 * 1000);
  });

  it('9. Enforces multi-round dependencies (Round 2 must start after Round 1 ends)', () => {
    const problem = makeBaseProblem();
    problem.variables.push({
      id: 'V2_R2',
      driveId: 'D1',
      roundId: 'R2',
      roundName: 'System Design',
      roundOrder: 2,
      prerequisiteRoundId: 'R1',
      candidateId: 'C1',
      durationMinutes: 45,
      bufferMinutes: 15,
      requiredSkills: ['System Design'],
      panelSize: 1,
      requiredRoomCapacity: 2,
      allowedTimeWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
    });

    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(true);
    const r1 = res.assignments.find((a) => a.roundId === 'R1')!;
    const r2 = res.assignments.find((a) => a.roundId === 'R2')!;
    expect(r2.startMs).toBeGreaterThanOrEqual(r1.endMs);
    expect(validator.validate(problem, res.assignments).isValid).toBe(true);
  });

  it('10. Reports an infeasible scheduling problem honestly', () => {
    const problem = makeBaseProblem();
    problem.candidates[0].eligibleDriveIds = [];
    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(false);
    expect(res.status).toBe('PARTIAL_OR_INFEASIBLE');
    expect(res.unscheduled[0].reasonCode).toBe('CANDIDATE_INELIGIBLE');
  });

  it('11. Detects an interview with no legal candidate availability domain', () => {
    const problem = makeBaseProblem();
    problem.candidates[0].availableWindows = [];
    const res = solver.solve(problem);
    expect(res.unscheduled[0].reasonCode).toBe('NO_CANDIDATE_AVAILABILITY');
  });

  it('12 & 13 & 14. Uses MRV, forward checking, and backtracking when an earlier slot blocks a constrained variable', () => {
    const problem = makeBaseProblem();
    problem.candidates[0].availableWindows = [{ startMs: T0, endMs: T0 + 2 * H1 }];
    problem.candidates.push({
      id: 'C2',
      name: 'Constrained Candidate',
      availableWindows: [{ startMs: T0, endMs: T0 + H1 }],
      completedRoundIds: [],
      eligibleDriveIds: ['D1'],
    });
    problem.variables.push({
      ...problem.variables[0],
      id: 'V2',
      candidateId: 'C2',
    });

    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(true);
    const c2Assign = res.assignments.find((a) => a.candidateId === 'C2')!;
    const c1Assign = res.assignments.find((a) => a.candidateId === 'C1')!;
    expect(c2Assign.startMs).toBe(T0);
    expect(c1Assign.startMs).toBe(T0 + H1);
  });

  it('15. Repairs a last-minute interviewer cancellation without disturbing other sessions', () => {
    const problem = makeBaseProblem();
    problem.interviewers.push({
      id: 'I2_BACKUP',
      name: 'Farhan Backup',
      skills: ['DSA'],
      availableWindows: [{ startMs: T0, endMs: T0 + 4 * H1 }],
    });

    const initial = solver.solve(problem);
    const cancelled = initial.assignments[0];

    const repair = rescheduler.repairCancelledAssignment(
      cancelled,
      problem.variables[0],
      cancelled.interviewerIds[0],
      problem,
      []
    );

    expect(repair.repaired).toBe(true);
    expect(repair.strategy).toBe('IN_PLACE_INTERVIEWER_SWAP');
    expect(repair.updatedAssignment?.interviewerIds).toContain('I2_BACKUP');
    expect(repair.validationReport?.isValid).toBe(true);
  });

  it('16. Prevents concurrent reservations on the same resource window via existingReservations lock', () => {
    const problem = makeBaseProblem();
    const narrow = [{ startMs: T0, endMs: T0 + H1 }];
    problem.variables[0].allowedTimeWindows = narrow;
    problem.existingReservations = [
      {
        sessionId: 'LOCKED_SESSION',
        candidateId: 'OTHER_CAND',
        interviewerIds: ['I1'],
        roomId: 'RM1',
        window: { startMs: T0, endMs: T0 + H1 },
      },
    ];

    const res = solver.solve(problem);
    expect(res.isCompleteSolution).toBe(false);
  });

  it('17. Independent validator rejects a tampered schedule containing a hard-constraint violation', () => {
    const problem = makeBaseProblem();
    const tamperedAssignments = [
      {
        variableId: 'V1',
        driveId: 'D1',
        roundId: 'R1',
        candidateId: 'C1',
        interviewerIds: ['I1'],
        roomId: 'RM1',
        startMs: T0,
        endMs: T0 + 45 * 60 * 1000,
        effectiveEndMs: T0 + 60 * 60 * 1000,
      },
      {
        variableId: 'V1_DUPLICATE_ROOM',
        driveId: 'D1',
        roundId: 'R1',
        candidateId: 'C1',
        interviewerIds: ['I1'],
        roomId: 'RM1',
        startMs: T0 + 15 * 60 * 1000,
        endMs: T0 + 60 * 60 * 1000,
        effectiveEndMs: T0 + 75 * 60 * 1000,
      },
    ];

    const report = validator.validate(problem, tamperedAssignments);
    expect(report.isValid).toBe(false);
    expect(report.violations.some((v) => v.code === 'CANDIDATE_OVERLAP')).toBe(true);
    expect(report.violations.some((v) => v.code === 'ROOM_OVERLAP')).toBe(true);
    expect(report.violations.some((v) => v.code === 'INTERVIEWER_OVERLAP')).toBe(true);
  });
});

