// backend/src/engine/rescheduler.ts

import {
  CSPProblemInput,
  CandidateSlotAssignment,
  ExistingReservation,
  InterviewVariable,
  RescheduleResult,
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
    // Convert all unaffected assignments into locked reservations so global schedule is untouched
    const lockedReservations: ExistingReservation[] = [
      ...fullProblemContext.existingReservations,
      ...unaffectedAssignments.map((a) => ({
        sessionId: a.variableId,
        candidateId: a.candidateId,
        interviewerIds: a.interviewerIds,
        roomId: a.roomId,
        window: { startMs: a.startMs, endMs: a.effectiveEndMs },
      })),
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
    const shiftProblem: CSPProblemInput = {
      ...fullProblemContext,
      variables: [variable],
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

