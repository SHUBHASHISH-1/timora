// backend/src/engine/cspSolver.ts

import {
  CSPProblemInput,
  CSPSolverResult,
  CandidateSlotAssignment,
  InterviewVariable,
  TimeWindow,
  UnscheduledDiagnostic,
} from '../../../shared/types/csp';

interface DomainOption {
  startMs: number;
  endMs: number;
  effectiveEndMs: number;
  roomId: string;
  interviewerIds: string[];
  softCost: number;
}

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isContainedInAny(startMs: number, endMs: number, windows: TimeWindow[]): boolean {
  return windows.some((w) => startMs >= w.startMs && endMs <= w.endMs);
}

function generateDiscreteStarts(windows: TimeWindow[], durationMs: number, stepMs: number): number[] {
  const starts = new Set<number>();
  for (const w of windows) {
    for (let t = w.startMs; t + durationMs <= w.endMs; t += stepMs) {
      starts.add(t);
    }
  }
  return Array.from(starts).sort((a, b) => a - b);
}

function getCombinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const results: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

export class TimoraCSPSolver {
  private buildInitialDomains(input: CSPProblemInput): {
    initialDomains: Map<string, DomainOption[]>;
    activeVariables: InterviewVariable[];
    unscheduled: UnscheduledDiagnostic[];
    existingInterviewerDayLoad: Map<string, number>;
  } {
    const stepMs = (input.slotGranularityMinutes ?? 15) * 60 * 1000;
    const candidateMap = new Map(input.candidates.map((c) => [c.id, c]));

    const initialDomains = new Map<string, DomainOption[]>();
    const unscheduled: UnscheduledDiagnostic[] = [];
    const activeVariables: InterviewVariable[] = [];

    const baseInterviewerLoad = new Map<string, number>();
    const existingInterviewerDayLoad = new Map<string, number>();

    for (const res of input.existingReservations) {
      const dayKey = new Date(res.window.startMs).toISOString().slice(0, 10);
      for (const intId of res.interviewerIds) {
        baseInterviewerLoad.set(intId, (baseInterviewerLoad.get(intId) ?? 0) + 1);
        const dayLoadKey = `${intId}::${dayKey}`;
        existingInterviewerDayLoad.set(
          dayLoadKey,
          (existingInterviewerDayLoad.get(dayLoadKey) ?? 0) + 1
        );
      }
    }

    const batchRoundsByCandidate = new Map<string, Set<string>>();
    for (const v of input.variables) {
      if (!batchRoundsByCandidate.has(v.candidateId)) {
        batchRoundsByCandidate.set(v.candidateId, new Set());
      }
      batchRoundsByCandidate.get(v.candidateId)!.add(v.roundId);
    }

    for (const variable of input.variables) {
      const candidate = candidateMap.get(variable.candidateId);
      if (!candidate || !candidate.eligibleDriveIds.includes(variable.driveId)) {
        unscheduled.push({
          variableId: variable.id,
          candidateId: variable.candidateId,
          roundId: variable.roundId,
          reasonCode: 'CANDIDATE_INELIGIBLE',
          explanation: `Candidate ${variable.candidateId} is not eligible for drive ${variable.driveId}.`,
        });
        continue;
      }

      if (variable.prerequisiteRoundId) {
        const alreadyCompleted = candidate.completedRoundIds.includes(variable.prerequisiteRoundId);
        const scheduledInSameBatch =
          batchRoundsByCandidate.get(variable.candidateId)?.has(variable.prerequisiteRoundId) ?? false;
        const scheduledInExisting = input.existingReservations.some(
          (res) =>
            res.candidateId === variable.candidateId &&
            res.roundId === variable.prerequisiteRoundId &&
            (!res.driveId || res.driveId === variable.driveId)
        );
        if (!alreadyCompleted && !scheduledInSameBatch && !scheduledInExisting) {
          unscheduled.push({
            variableId: variable.id,
            candidateId: variable.candidateId,
            roundId: variable.roundId,
            reasonCode: 'UNMET_ROUND_PREREQUISITE',
            explanation: `Prerequisite round ${variable.prerequisiteRoundId} is not completed or in batch.`,
          });
          continue;
        }
      }

      const durationMs = variable.durationMinutes * 60 * 1000;
      const effectiveDurationMs = (variable.durationMinutes + variable.bufferMinutes) * 60 * 1000;

      const qualifiedInterviewers = input.interviewers.filter((interviewer) =>
        variable.requiredSkills.every((reqSkill) =>
          interviewer.skills.some((s) => s.toLowerCase() === reqSkill.toLowerCase())
        )
      );

      if (qualifiedInterviewers.length < variable.panelSize) {
        unscheduled.push({
          variableId: variable.id,
          candidateId: variable.candidateId,
          roundId: variable.roundId,
          reasonCode: 'NO_QUALIFIED_INTERVIEWER',
          explanation: `Requires ${variable.panelSize} interviewer(s) with [${variable.requiredSkills.join(', ')}]; found ${qualifiedInterviewers.length}.`,
        });
        continue;
      }

      const compatibleRooms = input.rooms.filter((room) => {
        if (room.capacity < variable.requiredRoomCapacity) return false;
        if (variable.requiredRoomFeatures && variable.requiredRoomFeatures.length > 0) {
          return variable.requiredRoomFeatures.every((feat) =>
            room.features.some((rf) => rf.toLowerCase() === feat.toLowerCase())
          );
        }
        return true;
      });

      if (compatibleRooms.length === 0) {
        unscheduled.push({
          variableId: variable.id,
          candidateId: variable.candidateId,
          roundId: variable.roundId,
          reasonCode: 'NO_COMPATIBLE_ROOM',
          explanation: `No room meets minimum capacity (${variable.requiredRoomCapacity}) and required features.`,
        });
        continue;
      }

      const candidateStarts = generateDiscreteStarts(variable.allowedTimeWindows, durationMs, stepMs).filter(
        (startMs) => {
          const endMs = startMs + durationMs;
          if (!isContainedInAny(startMs, endMs, candidate.availableWindows)) return false;
          const conflictsWithExisting = input.existingReservations.some(
            (res) =>
              res.candidateId === candidate.id &&
              intervalsOverlap(startMs, endMs, res.window.startMs, res.window.endMs)
          );
          return !conflictsWithExisting;
        }
      );

      if (candidateStarts.length === 0) {
        unscheduled.push({
          variableId: variable.id,
          candidateId: variable.candidateId,
          roundId: variable.roundId,
          reasonCode: 'NO_CANDIDATE_AVAILABILITY',
          explanation: `Candidate ${candidate.name} has no available slots in the permitted drive window.`,
        });
        continue;
      }

      const options: DomainOption[] = [];
      let anyInterviewerAvailableAtAll = false;

      for (const startMs of candidateStarts) {
        const endMs = startMs + durationMs;
        const effectiveEndMs = startMs + effectiveDurationMs;
        const dayKey = new Date(startMs).toISOString().slice(0, 10);

        const availInterviewersAtSlot = qualifiedInterviewers.filter((interviewer) => {
          if (!isContainedInAny(startMs, effectiveEndMs, interviewer.availableWindows)) return false;
          if (interviewer.maxInterviewsPerDay !== undefined) {
            const existingOnDay = existingInterviewerDayLoad.get(`${interviewer.id}::${dayKey}`) ?? 0;
            if (existingOnDay >= interviewer.maxInterviewsPerDay) return false;
          }
          const hasConflict = input.existingReservations.some(
            (res) =>
              res.interviewerIds.includes(interviewer.id) &&
              intervalsOverlap(startMs, effectiveEndMs, res.window.startMs, res.window.endMs)
          );
          return !hasConflict;
        });

        if (availInterviewersAtSlot.length >= variable.panelSize) {
          anyInterviewerAvailableAtAll = true;
        } else {
          continue;
        }

        const availRoomsAtSlot = compatibleRooms.filter((room) => {
          if (!isContainedInAny(startMs, effectiveEndMs, room.availableWindows)) return false;
          const hasConflict = input.existingReservations.some(
            (res) =>
              res.roomId === room.id &&
              intervalsOverlap(startMs, effectiveEndMs, res.window.startMs, res.window.endMs)
          );
          return !hasConflict;
        });

        if (availRoomsAtSlot.length === 0) continue;

        const panels = getCombinations(availInterviewersAtSlot, variable.panelSize);
        for (const panel of panels) {
          const panelIds = panel.map((p) => p.id).sort();
          const loadPenalty = panelIds.reduce((acc, id) => acc + (baseInterviewerLoad.get(id) ?? 0) * 10, 0);

          for (const room of availRoomsAtSlot) {
            const roomWastePenalty = (room.capacity - variable.requiredRoomCapacity) * 2;
            const earlinessBias = Math.floor((startMs - candidateStarts[0]) / (60 * 60 * 1000));
            options.push({
              startMs,
              endMs,
              effectiveEndMs,
              roomId: room.id,
              interviewerIds: panelIds,
              softCost: loadPenalty + roomWastePenalty + earlinessBias,
            });
          }
        }
      }

      if (options.length === 0) {
        unscheduled.push({
          variableId: variable.id,
          candidateId: variable.candidateId,
          roundId: variable.roundId,
          reasonCode: anyInterviewerAvailableAtAll ? 'NO_COMPATIBLE_ROOM' : 'NO_INTERVIEWER_AVAILABILITY',
          explanation: anyInterviewerAvailableAtAll
            ? `No compatible room was available simultaneously with candidate and interviewers.`
            : `No qualified interviewer panel was available during candidate's free windows.`,
        });
        continue;
      }

      options.sort((a, b) => {
        if (a.softCost !== b.softCost) return a.softCost - b.softCost;
        if (a.startMs !== b.startMs) return a.startMs - b.startMs;
        if (a.roomId !== b.roomId) return a.roomId.localeCompare(b.roomId);
        return a.interviewerIds.join(',').localeCompare(b.interviewerIds.join(','));
      });

      initialDomains.set(variable.id, options);
      activeVariables.push(variable);
    }

    return {
      initialDomains,
      activeVariables,
      unscheduled,
      existingInterviewerDayLoad,
    };
  }

  /**
   * Enumerates up to `maxOptions` distinct, conflict-free slot options for candidate self-booking.
   */
  public enumerateFeasibleSlots(
    input: CSPProblemInput,
    maxOptions = 12
  ): {
    options: CandidateSlotAssignment[];
    unscheduled: UnscheduledDiagnostic[];
  } {
    const { initialDomains, activeVariables, unscheduled } = this.buildInitialDomains(input);
    if (activeVariables.length === 0) {
      return { options: [], unscheduled };
    }

    const targetVar = activeVariables[0];
    const domain = initialDomains.get(targetVar.id) ?? [];

    // Sort chronologically first, then by lowest soft cost, and pick distinct start-time/room/panel combinations
    const chronological = [...domain].sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.softCost - b.softCost;
    });

    const selected: CandidateSlotAssignment[] = [];
    const seenStartTimes = new Set<number>();

    // Pass 1: One optimal room/panel option per distinct start time so the candidate gets varied time choices
    for (const opt of chronological) {
      if (seenStartTimes.has(opt.startMs)) continue;
      seenStartTimes.add(opt.startMs);
      selected.push({
        variableId: targetVar.id,
        driveId: targetVar.driveId,
        roundId: targetVar.roundId,
        roundName: targetVar.roundName,
        candidateId: targetVar.candidateId,
        interviewerIds: opt.interviewerIds,
        roomId: opt.roomId,
        startMs: opt.startMs,
        endMs: opt.endMs,
        effectiveEndMs: opt.effectiveEndMs,
      });
      if (selected.length >= maxOptions) break;
    }

    return { options: selected, unscheduled };
  }

  public solve(input: CSPProblemInput): CSPSolverResult {
    const startClock = Date.now();
    const maxNodes = input.maxSearchNodes ?? 50000;
    const timeoutMs = input.timeoutMs ?? 10000;

    const interviewerMap = new Map(input.interviewers.map((i) => [i.id, i]));
    const { initialDomains, activeVariables, unscheduled, existingInterviewerDayLoad } =
      this.buildInitialDomains(input);
    const warnings: string[] = [];

    // Ensure any variable whose prerequisite was already marked unscheduled in unary pruning is also pruned
    for (let i = activeVariables.length - 1; i >= 0; i--) {
      const v = activeVariables[i];
      if (!v.prerequisiteRoundId) continue;
      const prereqFailed = unscheduled.some(
        (u) => u.candidateId === v.candidateId && u.roundId === v.prerequisiteRoundId
      );
      if (prereqFailed) {
        activeVariables.splice(i, 1);
        initialDomains.delete(v.id);
        unscheduled.push({
          variableId: v.id,
          candidateId: v.candidateId,
          roundId: v.roundId,
          reasonCode: 'UNMET_ROUND_PREREQUISITE',
          explanation: `Prerequisite round ${v.prerequisiteRoundId} could not be scheduled.`,
        });
      }
    }

    let exploredNodes = 0;
    let backtracks = 0;
    let prunedBranches = 0;
    let searchAbortedByLimit = false;

    const variableMap = new Map(activeVariables.map((v) => [v.id, v]));
    const currentAssignment = new Map<string, DomainOption>();

    const isConsistent = (
      varA: InterviewVariable,
      optA: DomainOption,
      varB: InterviewVariable,
      optB: DomainOption
    ): boolean => {
      if (varA.candidateId === varB.candidateId) {
        if (intervalsOverlap(optA.startMs, optA.endMs, optB.startMs, optB.endMs)) {
          return false;
        }
        if (varA.prerequisiteRoundId === varB.roundId && optA.startMs < optB.endMs) {
          return false;
        }
        if (varB.prerequisiteRoundId === varA.roundId && optB.startMs < optA.endMs) {
          return false;
        }
        if (varA.roundOrder !== varB.roundOrder) {
          if (varA.roundOrder < varB.roundOrder && optA.endMs > optB.startMs) return false;
          if (varB.roundOrder < varA.roundOrder && optB.endMs > optA.startMs) return false;
        }
      }

      if (optA.roomId === optB.roomId) {
        if (intervalsOverlap(optA.startMs, optA.effectiveEndMs, optB.startMs, optB.effectiveEndMs)) {
          return false;
        }
      }

      const sharesInterviewer = optA.interviewerIds.some((id) => optB.interviewerIds.includes(id));
      if (sharesInterviewer) {
        if (intervalsOverlap(optA.startMs, optA.effectiveEndMs, optB.startMs, optB.effectiveEndMs)) {
          return false;
        }
      }

      return true;
    };

    const violatesDailyCap = (option: DomainOption): boolean => {
      const dayKey = new Date(option.startMs).toISOString().slice(0, 10);
      for (const intId of option.interviewerIds) {
        const intProfile = interviewerMap.get(intId);
        if (intProfile?.maxInterviewsPerDay !== undefined) {
          let countOnDay = existingInterviewerDayLoad.get(`${intId}::${dayKey}`) ?? 0;
          for (const [, assignedOpt] of currentAssignment.entries()) {
            const assignedDay = new Date(assignedOpt.startMs).toISOString().slice(0, 10);
            if (assignedDay === dayKey && assignedOpt.interviewerIds.includes(intId)) {
              countOnDay++;
            }
          }
          if (countOnDay + 1 > intProfile.maxInterviewsPerDay) {
            return true;
          }
        }
      }
      return false;
    };

    const selectMRVVariable = (
      domains: Map<string, DomainOption[]>,
      requirePrerequisiteAssigned = false
    ): InterviewVariable | null => {
      let bestVar: InterviewVariable | null = null;
      let minDomainSize = Infinity;

      for (const v of activeVariables) {
        if (currentAssignment.has(v.id)) continue;

        if (requirePrerequisiteAssigned && v.prerequisiteRoundId) {
          const prereqVar = activeVariables.find(
            (other) => other.candidateId === v.candidateId && other.roundId === v.prerequisiteRoundId
          );
          if (prereqVar && !currentAssignment.has(prereqVar.id)) {
            continue;
          }
        }

        const domSize = domains.get(v.id)?.length ?? 0;
        if (domSize < minDomainSize) {
          minDomainSize = domSize;
          bestVar = v;
        } else if (domSize === minDomainSize && bestVar) {
          if (v.roundOrder !== bestVar.roundOrder) {
            if (v.roundOrder < bestVar.roundOrder) bestVar = v;
          } else if (v.id.localeCompare(bestVar.id) < 0) {
            bestVar = v;
          }
        }
      }
      return bestVar;
    };

    const backtrack = (domains: Map<string, DomainOption[]>): boolean => {
      if (currentAssignment.size === activeVariables.length) {
        return true;
      }

      if (exploredNodes >= maxNodes || Date.now() - startClock >= timeoutMs) {
        searchAbortedByLimit = true;
        return false;
      }

      const variable = selectMRVVariable(domains, false);
      if (!variable) return true;

      const options = domains.get(variable.id) ?? [];
      for (const option of options) {
        exploredNodes++;

        if (violatesDailyCap(option)) continue;

        currentAssignment.set(variable.id, option);

        const nextDomains = new Map<string, DomainOption[]>();
        let domainWipeout = false;

        for (const otherVar of activeVariables) {
          if (currentAssignment.has(otherVar.id)) continue;
          const currentOtherDomain = domains.get(otherVar.id) ?? [];
          const filtered = currentOtherDomain.filter((otherOpt) =>
            isConsistent(variable, option, otherVar, otherOpt)
          );
          if (filtered.length === 0) {
            domainWipeout = true;
            prunedBranches++;
            break;
          }
          nextDomains.set(otherVar.id, filtered);
        }

        if (!domainWipeout) {
          if (backtrack(nextDomains)) {
            return true;
          }
        }

        currentAssignment.delete(variable.id);
        backtracks++;

        if (searchAbortedByLimit) return false;
      }

      return false;
    };

    const solvedAllActive = activeVariables.length > 0 ? backtrack(initialDomains) : true;

    if (!solvedAllActive && !searchAbortedByLimit && activeVariables.length > 0) {
      warnings.push(
        'Full batch could not be scheduled simultaneously without conflict; generated maximal conflict-free subset.'
      );
      currentAssignment.clear();
      const workingDomains = new Map(initialDomains);

      while (true) {
        const nextVar = selectMRVVariable(workingDomains, true);
        if (!nextVar) break;

        const validOpts = (workingDomains.get(nextVar.id) ?? []).filter(
          (opt) => !violatesDailyCap(opt)
        );

        if (validOpts.length === 0) {
          unscheduled.push({
            variableId: nextVar.id,
            candidateId: nextVar.candidateId,
            roundId: nextVar.roundId,
            reasonCode: 'RESOURCE_CONFLICT_EXHAUSTED',
            explanation: `All feasible slots for ${nextVar.id} conflicted with more-constrained interviews.`,
          });
          const idx = activeVariables.findIndex((v) => v.id === nextVar.id);
          if (idx >= 0) activeVariables.splice(idx, 1);

          // Cascade unschedule any dependent rounds for this candidate
          for (let j = activeVariables.length - 1; j >= 0; j--) {
            const dep = activeVariables[j];
            if (
              dep.candidateId === nextVar.candidateId &&
              (dep.prerequisiteRoundId === nextVar.roundId || dep.roundOrder > nextVar.roundOrder)
            ) {
              unscheduled.push({
                variableId: dep.id,
                candidateId: dep.candidateId,
                roundId: dep.roundId,
                reasonCode: 'UNMET_ROUND_PREREQUISITE',
                explanation: `Prerequisite round ${nextVar.roundId} could not be scheduled.`,
              });
              activeVariables.splice(j, 1);
            }
          }
          continue;
        }

        const chosen = validOpts[0];
        currentAssignment.set(nextVar.id, chosen);

        for (const otherVar of activeVariables) {
          if (currentAssignment.has(otherVar.id)) continue;
          const rem = (workingDomains.get(otherVar.id) ?? []).filter((o) =>
            isConsistent(nextVar, chosen, otherVar, o)
          );
          workingDomains.set(otherVar.id, rem);
        }
      }
    } else if (searchAbortedByLimit) {
      for (const v of activeVariables) {
        if (!currentAssignment.has(v.id)) {
          unscheduled.push({
            variableId: v.id,
            candidateId: v.candidateId,
            roundId: v.roundId,
            reasonCode: 'SEARCH_LIMIT_REACHED',
            explanation: `Solver terminated at configured search limit (${maxNodes} nodes / ${timeoutMs}ms).`,
          });
        }
      }
    }

    const finalAssignments: CandidateSlotAssignment[] = [];
    let totalSoftCost = 0;

    for (const [varId, opt] of currentAssignment.entries()) {
      const v = variableMap.get(varId)!;
      totalSoftCost += opt.softCost;
      finalAssignments.push({
        variableId: v.id,
        driveId: v.driveId,
        roundId: v.roundId,
        roundName: v.roundName,
        candidateId: v.candidateId,
        interviewerIds: opt.interviewerIds,
        roomId: opt.roomId,
        startMs: opt.startMs,
        endMs: opt.endMs,
        effectiveEndMs: opt.effectiveEndMs,
      });
    }

    const isCompleteSolution =
      unscheduled.length === 0 && finalAssignments.length === input.variables.length;

    return {
      status: searchAbortedByLimit
        ? 'SEARCH_TIMEOUT_OR_LIMIT'
        : isCompleteSolution
        ? 'OPTIMAL_OR_FEASIBLE'
        : 'PARTIAL_OR_INFEASIBLE',
      isCompleteSolution,
      assignments: finalAssignments,
      unscheduled,
      statistics: {
        exploredNodes,
        backtracks,
        prunedBranches,
        executionTimeMs: Date.now() - startClock,
        softObjectiveScore: totalSoftCost,
      },
      warnings,
    };
  }
}