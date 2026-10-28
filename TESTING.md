# TIMORA Automated Testing & Verification Suite

The Timora testing suite in `backend/tests/csp.spec.ts` executes 17 mandatory constraint scenarios using Vitest:

## 1. Test Scenarios Matrix

| # | Test Scenario Description | Expected Outcome | Engine Component Tested |
|---|---|---|---|
| **1** | Solves a simple feasible schedule and passes independent validation | Complete conflict-free solution (`isValid: true`) | CSPSolver + IndependentScheduleValidator |
| **2** | Rejects assignment to an unavailable interviewer | Feasibility check fails with `NO_INTERVIEWER_AVAILABILITY` | Domain Pruning |
| **3** | Prevents double-booked interviewer across two simultaneous candidates | Allocates only 1 candidate when 1 interviewer is available | Forward Checking + Non-Overlap |
| **4** | Prevents double-booked candidate across two simultaneous interviews | Allocates 1 interview; avoids simultaneous candidate booking | Candidate Non-Overlap |
| **5** | Prevents room conflicts when only one room is available in a single slot | Second interview flagged `NO_COMPATIBLE_ROOM` | Room Non-Overlap |
| **6** | Rejects interviewer without the required skill tag | Rejects assignment with `NO_QUALIFIED_INTERVIEWER` | Skill Matching Constraint |
| **7** | Rejects rooms with insufficient capacity | Fails with `NO_COMPATIBLE_ROOM` | Room Capacity Filter |
| **8** | Supports different interview durations and buffers accurately | $t_{end} - t_{start} = \text{duration}$; $t_{eff} - t_{start} = \text{duration} + \text{buffer}$ | Duration & Buffer Slicing |
| **9** | Enforces multi-round dependencies | Round 2 starts $\ge$ Round 1 end time | Round Dependency Constraint |
| **10** | Reports an infeasible scheduling problem honestly | Status `PARTIAL_OR_INFEASIBLE` with diagnostic code | Honest Infeasibility Detection |
| **11** | Detects an interview with no legal candidate availability domain | Diagnostic `NO_CANDIDATE_AVAILABILITY` | Candidate Window Validation |
| **12-14** | MRV heuristic, forward checking, and backtracking with constrained slots | Schedules heavily constrained variable first at optimal slot | MRV Heuristic & Backtracking |
| **15** | Repairs last-minute interviewer cancellation without disturbing others | In-place replacement assigned; unaffected sessions locked | LocalizedRescheduler |
| **16** | Prevents concurrent reservations via `existingReservations` lock | Rejects overlap against pre-booked session window | Existing Reservation Lock |
| **17** | Independent validator rejects tampered schedule with hard violation | Catches tampered overlap and marks `isValid: false` | Zero-Trust Independent Validator |

## 2. Running the Test Suite

```bash
cd timora/backend
npm test
```

