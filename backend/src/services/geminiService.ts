// backend/src/services/geminiService.ts

import { env } from '../config/env';
import { CSPSolverResult, ScheduleValidationReport } from '../../../shared/types/csp';

export async function generateNaturalLanguageScheduleSummary(
  driveTitle: string,
  solverResult: CSPSolverResult,
  validationReport: ScheduleValidationReport
): Promise<string> {
  const deterministicSummary = `Drive "${driveTitle}": Scheduled ${solverResult.assignments.length} interview(s) in ${solverResult.statistics.executionTimeMs}ms (${solverResult.statistics.exploredNodes} nodes explored, ${solverResult.statistics.backtracks} backtracks, ${solverResult.statistics.prunedBranches} branches pruned). Unscheduled count: ${solverResult.unscheduled.length}. Independent Validator Status: ${validationReport.isValid ? 'PASSED (0 hard-constraint violations)' : `FAILED (${validationReport.violations.length} violations)`}.`;

  if (!env.GEMINI_API_KEY) {
    return deterministicSummary;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are the Timora Scheduling Diagnostics Assistant. Summarize the following deterministic CSP solver output in 2 concise sentences for a Placement Coordinator without inventing numbers:\n${deterministicSummary}`,
                },
              ],
            },
          ],
        }),
      }
    );
    if (!response.ok) return deterministicSummary;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || deterministicSummary;
  } catch {
    return deterministicSummary;
  }
}

