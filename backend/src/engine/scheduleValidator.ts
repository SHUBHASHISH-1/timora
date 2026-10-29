// backend/src/engine/scheduleValidator.ts

import {
  CSPProblemInput,
  CandidateSlotAssignment,
  HardConstraintViolation,
  ScheduleValidationReport,
  TimeWindow,
} from '../../../shared/types/csp';

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function withinWindows(startMs: number, endMs: number, windows: TimeWindow[]): boolean {
  return windows.some((w) => startMs >= w.startMs && endMs <= w.endMs);
}

export class IndependentScheduleValidator {
  public validate(
    problem: CSPProblemInput,
    assignments: CandidateSlotAssignment[]
  ): ScheduleValidationReport {
    const violations: HardConstraintViolation[] = [];

    const varMap = new Map(problem.variables.map((v) => [v.id, v]));
    const candMap = new Map(problem.candidates.map((c) => [c.id, c]));
    const intMap = new Map(problem.interviewers.map((i) => [i.id, i]));
    const roomMap = new Map(problem.rooms.map((r) => [r.id, r]));
    const assignmentByCandidateRound = new Map<string, CandidateSlotAssignment>();

    // Track daily interviewer workload starting from existingReservations
    const interviewerDayCounts = new Map<string, number>();
    for (const existing of problem.existingReservations) {
      const dayKey = new Date(existing.window.startMs).toISOString().slice(0, 10);
      for (const intId of existing.interviewerIds) {
        const key = `${intId}::${dayKey}`;
        interviewerDayCounts.set(key, (interviewerDayCounts.get(key) ?? 0) + 1);
      }
    }

    for (const a of assignments) {
      assignmentByCandidateRound.set(`${a.candidateId}::${a.roundId}`, a);
    }

    for (const a of assignments) {
      const variable = varMap.get(a.variableId);
      if (!variable) continue;

      const expectedEndMs = a.startMs + variable.durationMinutes * 60 * 1000;
      const expectedEffectiveEndMs =
        a.startMs + (variable.durationMinutes + variable.bufferMinutes) * 60 * 1000;

      if (a.endMs !== expectedEndMs || a.effectiveEndMs !== expectedEffectiveEndMs) {
        violations.push({
          code: 'INVALID_DURATION',
          variableId: a.variableId,
          message: `Assignment duration or buffer does not match round configuration.`,
        });
      }

      if (!withinWindows(a.startMs, a.endMs, variable.allowedTimeWindows)) {
        violations.push({
          code: 'CANDIDATE_UNAVAILABLE',
          variableId: a.variableId,
          message: `Assignment falls outside permitted drive windows.`,
        });
      }

      const candidate = candMap.get(a.candidateId);
      if (!candidate || !candidate.eligibleDriveIds.includes(a.driveId)) {
        violations.push({
          code: 'CANDIDATE_NOT_ELIGIBLE',
          variableId: a.variableId,
          message: `Candidate ${a.candidateId} is not eligible for drive ${a.driveId}.`,
        });
      } else if (!withinWindows(a.startMs, a.endMs, candidate.availableWindows)) {
        violations.push({
          code: 'CANDIDATE_UNAVAILABLE',
          variableId: a.variableId,
          message: `Candidate ${candidate.name} is unavailable during assigned slot.`,
        });
      }

      if (variable.prerequisiteRoundId && candidate) {
        const completedPreviously = candidate.completedRoundIds.includes(variable.prerequisiteRoundId);
        const scheduledPrereq = assignmentByCandidateRound.get(
          `${a.candidateId}::${variable.prerequisiteRoundId}`
        );
        const existingPrereq = problem.existingReservations.find(
          (res) =>
            res.candidateId === a.candidateId &&
            res.roundId === variable.prerequisiteRoundId &&
            (!res.driveId || res.driveId === a.driveId)
        );
        if (!completedPreviously && !scheduledPrereq && !existingPrereq) {
          violations.push({
            code: 'ROUND_DEPENDENCY_VIOLATION',
            variableId: a.variableId,
            message: `Prerequisite round ${variable.prerequisiteRoundId} is neither completed nor scheduled.`,
          });
        } else if (scheduledPrereq && scheduledPrereq.endMs > a.startMs) {
          violations.push({
            code: 'ROUND_DEPENDENCY_VIOLATION',
            variableId: a.variableId,
            conflictingVariableId: scheduledPrereq.variableId,
            message: `Round ${a.roundId} starts before prerequisite round ${variable.prerequisiteRoundId} finishes.`,
          });
        }
      }

      if (a.interviewerIds.length !== variable.panelSize) {
        violations.push({
          code: 'PANEL_SIZE_MISMATCH',
          variableId: a.variableId,
          message: `Expected panel size ${variable.panelSize}, received ${a.interviewerIds.length}.`,
        });
      }

      const dayKey = new Date(a.startMs).toISOString().slice(0, 10);
      for (const intId of a.interviewerIds) {
        const interviewer = intMap.get(intId);
        if (!interviewer) {
          violations.push({
            code: 'INTERVIEWER_UNAVAILABLE',
            variableId: a.variableId,
            message: `Interviewer ${intId} does not exist.`,
          });
          continue;
        }

        if (!withinWindows(a.startMs, a.effectiveEndMs, interviewer.availableWindows)) {
          violations.push({
            code: 'INTERVIEWER_UNAVAILABLE',
            variableId: a.variableId,
            message: `Interviewer ${interviewer.name} is unavailable during assigned slot.`,
          });
        }

        const hasSkills = variable.requiredSkills.every((req) =>
          interviewer.skills.some((s) => s.toLowerCase() === req.toLowerCase())
        );
        if (!hasSkills) {
          violations.push({
            code: 'SKILL_MISMATCH',
            variableId: a.variableId,
            message: `Interviewer ${interviewer.name} lacks required skills [${variable.requiredSkills.join(', ')}].`,
          });
        }

        const dayCountKey = `${intId}::${dayKey}`;
        const nextCount = (interviewerDayCounts.get(dayCountKey) ?? 0) + 1;
        interviewerDayCounts.set(dayCountKey, nextCount);
        if (
          interviewer.maxInterviewsPerDay !== undefined &&
          nextCount > interviewer.maxInterviewsPerDay
        ) {
          violations.push({
            code: 'INTERVIEWER_DAILY_CAP_EXCEEDED',
            variableId: a.variableId,
            message: `Interviewer ${interviewer.name} exceeds daily cap (${interviewer.maxInterviewsPerDay}) on ${dayKey}.`,
          });
        }
      }

      const room = roomMap.get(a.roomId);
      if (!room) {
        violations.push({
          code: 'ROOM_UNAVAILABLE',
          variableId: a.variableId,
          message: `Room ${a.roomId} does not exist.`,
        });
      } else {
        if (!withinWindows(a.startMs, a.effectiveEndMs, room.availableWindows)) {
          violations.push({
            code: 'ROOM_UNAVAILABLE',
            variableId: a.variableId,
            message: `Room ${room.name} is unavailable during assigned interval.`,
          });
        }
        if (room.capacity < variable.requiredRoomCapacity) {
          violations.push({
            code: 'ROOM_CAPACITY_INSUFFICIENT',
            variableId: a.variableId,
            message: `Room ${room.name} capacity (${room.capacity}) < required (${variable.requiredRoomCapacity}).`,
          });
        }
        if (
          variable.requiredRoomFeatures &&
          !variable.requiredRoomFeatures.every((f) =>
            room.features.some((rf) => rf.toLowerCase() === f.toLowerCase())
          )
        ) {
          violations.push({
            code: 'ROOM_FEATURE_MISSING',
            variableId: a.variableId,
            message: `Room ${room.name} is missing required features.`,
          });
        }
      }

      for (const existing of problem.existingReservations) {
        if (
          existing.candidateId === a.candidateId &&
          overlaps(a.startMs, a.endMs, existing.window.startMs, existing.window.endMs)
        ) {
          violations.push({
            code: 'CANDIDATE_OVERLAP',
            variableId: a.variableId,
            conflictingVariableId: existing.sessionId,
            message: `Candidate ${a.candidateId} overlaps with existing reservation ${existing.sessionId}.`,
          });
        }
        if (
          existing.roomId === a.roomId &&
          overlaps(a.startMs, a.effectiveEndMs, existing.window.startMs, existing.window.endMs)
        ) {
          violations.push({
            code: 'ROOM_OVERLAP',
            variableId: a.variableId,
            conflictingVariableId: existing.sessionId,
            message: `Room ${a.roomId} overlaps with existing reservation ${existing.sessionId}.`,
          });
        }
        if (
          a.interviewerIds.some((id) => existing.interviewerIds.includes(id)) &&
          overlaps(a.startMs, a.effectiveEndMs, existing.window.startMs, existing.window.endMs)
        ) {
          violations.push({
            code: 'INTERVIEWER_OVERLAP',
            variableId: a.variableId,
            conflictingVariableId: existing.sessionId,
            message: `Interviewer overlaps with existing reservation ${existing.sessionId}.`,
          });
        }
      }
    }

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i];
        const b = assignments[j];

        if (a.candidateId === b.candidateId) {
          if (overlaps(a.startMs, a.endMs, b.startMs, b.endMs)) {
            violations.push({
              code: 'CANDIDATE_OVERLAP',
              variableId: a.variableId,
              conflictingVariableId: b.variableId,
              message: `Candidate ${a.candidateId} is double-booked in ${a.variableId} and ${b.variableId}.`,
            });
          }

          const varA = varMap.get(a.variableId);
          const varB = varMap.get(b.variableId);
          if (varA && varB && varA.driveId === varB.driveId && varA.roundOrder !== varB.roundOrder) {
            if (varA.roundOrder < varB.roundOrder && a.endMs > b.startMs) {
              violations.push({
                code: 'ROUND_DEPENDENCY_VIOLATION',
                variableId: b.variableId,
                conflictingVariableId: a.variableId,
                message: `Round ${b.roundId} starts before earlier round ${a.roundId} finishes.`,
              });
            } else if (varB.roundOrder < varA.roundOrder && b.endMs > a.startMs) {
              violations.push({
                code: 'ROUND_DEPENDENCY_VIOLATION',
                variableId: a.variableId,
                conflictingVariableId: b.variableId,
                message: `Round ${a.roundId} starts before earlier round ${b.roundId} finishes.`,
              });
            }
          }
        }

        if (
          a.roomId === b.roomId &&
          overlaps(a.startMs, a.effectiveEndMs, b.startMs, b.effectiveEndMs)
        ) {
          violations.push({
            code: 'ROOM_OVERLAP',
            variableId: a.variableId,
            conflictingVariableId: b.variableId,
            message: `Room ${a.roomId} is double-booked in ${a.variableId} and ${b.variableId}.`,
          });
        }

        const sharedInterviewers = a.interviewerIds.filter((id) => b.interviewerIds.includes(id));
        if (
          sharedInterviewers.length > 0 &&
          overlaps(a.startMs, a.effectiveEndMs, b.startMs, b.effectiveEndMs)
        ) {
          violations.push({
            code: 'INTERVIEWER_OVERLAP',
            variableId: a.variableId,
            conflictingVariableId: b.variableId,
            message: `Interviewer(s) [${sharedInterviewers.join(', ')}] double-booked in ${a.variableId} and ${b.variableId}.`,
          });
        }
      }
    }

    return {
      isValid: violations.length === 0,
      checkedAssignments: assignments.length,
      violations,
      validatedAt: new Date().toISOString(),
    };
  }
}