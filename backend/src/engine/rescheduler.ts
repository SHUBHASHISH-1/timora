// backend/src/engine/rescheduler.ts

import {
  CSPProblemInput,
  CandidateSlotAssignment,
  ExistingReservation,
  InterviewVariable,
  RescheduleResult,
  TimeWindow,
} from '../../../shared/types/csp';
import { TimoraCSPSolver } from './cspSolver';
import { IndependentScheduleValidator } from './scheduleValidator';

export class LocalizedRescheduler {
  private solver = new TimoraCSPSolver();
  private validator = new IndependentScheduleValidator();

  public repairCancelledAssignment(
    cancelledAssignment: CandidateSlotAssignment,
    variable: InterviewVariable,
    droppedInterviewerId: string,
    fullProblemContext: CSPProblemInput,
    unaffectedAssignments: CandidateSlotAssignment[]
  ): RescheduleResult {
    const varMap = new Map(fullProblemContext.variables.map((v) => [v.id, v]));

    // Convert all unaffected assignments into locked reservations so global schedule is untouched
    const lockedReservations: ExistingReservation[] = [
      ...fullProblemContext.existingReservations,
      ...unaffectedAssignments.map((a) => {
        const aVar = varMap.get(a.variableId);
        return {
          sessionId: a.variableId,
          candidateId: a.candidateId,
          interviewerIds: a.interviewerIds,
          roomId: a.roomId,
          window: { startMs: a.startMs, endMs: a.effectiveEndMs },
          driveId: a.driveId,
          roundId: a.roundId,
          roundOrder: aVar?.roundOrder,
        };
      }),
    ];

    // Filter out the dropped interviewer from eligible interviewers for this slot
    const updatedInterviewers = fullProblemContext.interviewers.map((interviewer) => {
      if (interviewer.id !== droppedInterviewerId) return interviewer;
      // Remove the cancelled window from the dropped interviewer's availability
      const slicedWindows = interviewer.availableWindows.flatMap((w) => {
        if (w.endMs <= cancelledAssignment.startMs || w.startMs >= cancelledAssignment.effectiveEndMs) {
          return [w];
        }
        const parts = [];
        if (w.startMs < cancelledAssignment.startMs) {
          parts.push({ startMs: w.startMs, endMs: cancelledAssignment.startMs });
        }
        if (w.endMs > cancelledAssignment.effectiveEndMs) {
          parts.push({ startMs: cancelledAssignment.effectiveEndMs, endMs: w.endMs });
        }
        return parts;
      });
      return { ...interviewer, availableWindows: slicedWindows };
    });

    // Attempt 1: In-place interviewer swap (keep exact time and room)
    const inPlaceVariable: InterviewVariable = {
      ...variable,
      allowedTimeWindows: [{ startMs: cancelledAssignment.startMs, endMs: cancelledAssignment.endMs }],
    };

    const inPlaceProblem: CSPProblemInput = {
      ...fullProblemContext,
      variables: [inPlaceVariable],
      interviewers: updatedInterviewers,
      rooms: fullProblemContext.rooms.filter((r) => r.id === cancelledAssignment.roomId),
      existingReservations: lockedReservations,
    };

    const inPlaceResult = this.solver.solve(inPlaceProblem);
    if (inPlaceResult.isCompleteSolution && inPlaceResult.assignments.length === 1) {
      const candidateRepair = inPlaceResult.assignments[0];
      const report = this.validator.validate(
        { ...fullProblemContext, interviewers: updatedInterviewers },
        [...unaffectedAssignments, candidateRepair]
      );
      if (report.isValid) {
        return {
          repaired: true,
          strategy: 'IN_PLACE_INTERVIEWER_SWAP',
          updatedAssignment: candidateRepair,
          validationReport: report,
        };
      }
    }

    // Attempt 2: Shift time/room/interviewer for this single interview without touching others
    // Enforce multi-round ordering bounds against the candidate's other locked rounds in the same drive
    let minStartMs = -Infinity;
    let maxEndMs = Infinity;

    for (const other of unaffectedAssignments) {
      if (other.candidateId !== variable.candidateId || other.driveId !== variable.driveId) continue;
      const otherVar = varMap.get(other.variableId);
      if (!otherVar) continue;

      if (
        variable.prerequisiteRoundId === other.roundId ||
        otherVar.roundOrder < variable.roundOrder
      ) {
        minStartMs = Math.max(minStartMs, other.endMs);
      }
      if (
        otherVar.prerequisiteRoundId === variable.roundId ||
        otherVar.roundOrder > variable.roundOrder
      ) {
        maxEndMs = Math.min(maxEndMs, other.startMs);
      }
    }

    const boundedWindows: TimeWindow[] = variable.allowedTimeWindows
      .map((w) => ({
        startMs: Math.max(w.startMs, minStartMs),
        endMs: Math.min(w.endMs, maxEndMs),
      }))
      .filter((w) => w.endMs > w.startMs);

    const shiftVariable: InterviewVariable = {
      ...variable,
      allowedTimeWindows: boundedWindows,
    };

    const shiftProblem: CSPProblemInput = {
      ...fullProblemContext,
      variables: [shiftVariable],
      interviewers: updatedInterviewers,
      existingReservations: lockedReservations,
    };

    const shiftResult = this.solver.solve(shiftProblem);
    if (shiftResult.isCompleteSolution && shiftResult.assignments.length === 1) {
      const candidateRepair = shiftResult.assignments[0];
      const report = this.validator.validate(
        { ...fullProblemContext, interviewers: updatedInterviewers },
        [...unaffectedAssignments, candidateRepair]
      );
      if (report.isValid) {
        return {
          repaired: true,
          strategy: 'TIME_AND_ROOM_SHIFT',
          updatedAssignment: candidateRepair,
          validationReport: report,
        };
      }
    }

    const reason =
      shiftResult.unscheduled[0]?.explanation ??
      'No qualified replacement interviewer or conflict-free slot available.';

    return {
      repaired: false,
      strategy: 'UNRESOLVED',
      blockingReason: reason,
    };
  }
}