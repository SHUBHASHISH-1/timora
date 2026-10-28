# TIMORA CSP Scheduling Engine & Independent Validator

## 1. Mathematical Formalization

We formulate interview scheduling as a discrete **Constraint Satisfaction Problem (CSP)** defined by the triple $(X, D, C)$:

- **Variables ($X$)**:
  $$X = \{ V_{d, c, r} \}$$
  Each variable represents an interview session for placement drive $d$, candidate $c$, and round $r$.

- **Domains ($D$)**:
  Each variable $V$ has a domain of tuples:
  $$D(V) \subseteq \{ (t_{start}, t_{end}, t_{eff}, R, I) \}$$
  where:
  - $t_{start}$ is a discrete start timestamp (aligned to 15-minute granularity).
  - $t_{end} = t_{start} + \text{duration}(r)$.
  - $t_{eff} = t_{start} + \text{duration}(r) + \text{buffer}(r)$ (effective end time for room and interviewer cleanup).
  - $R$ is a compatible room satisfying $\text{capacity}(R) \ge \text{requiredCapacity}(r)$ and required equipment features.
  - $I = \{ i_1, \dots, i_k \}$ is a panel of qualified interviewers satisfying $|I| = \text{panelSize}(r)$ and $\forall \text{skill} \in \text{requiredSkills}(r), \exists i \in I \text{ with that skill}$.

- **Constraints ($C$)**:
  1. **Unary Availability Constraints**:
     - Candidate $c$ must be available throughout $[t_{start}, t_{end}]$.
     - Every interviewer $i \in I$ must be available throughout $[t_{start}, t_{eff}]$.
     - Room $R$ must be available throughout $[t_{start}, t_{eff}]$.
  2. **Binary Resource Non-Overlap**:
     - No candidate $c$ can be double-booked in two simultaneous interviews.
     - No interviewer $i$ can be scheduled in overlapping intervals:
       $$\text{Interval}(V_1) \cap \text{Interval}(V_2) = \emptyset \quad \text{if } I(V_1) \cap I(V_2) \neq \emptyset$$
     - No room $R$ can host two interviews simultaneously.
  3. **Multi-Round Prerequisite & Chaining**:
     - For rounds with prerequisites $r_{pre}$, $t_{start}(r) \ge t_{end}(r_{pre})$.
     - Sequential round ordering: $\text{order}(r_a) < \text{order}(r_b) \implies t_{end}(r_a) \le t_{start}(r_b)$.
  4. **Interviewer Daily Workload Cap**:
     - The number of interview sessions assigned to interviewer $i$ on any calendar date cannot exceed $\text{maxInterviewsPerDay}(i)$.

## 2. Solver Architecture & Heuristics

1. **Unary Domain Pruning**:
   Prior to search, the solver prunes infeasible start times, under-capacity rooms, and unqualified interviewers. Unscheduled diagnostic codes (`CANDIDATE_INELIGIBLE`, `NO_QUALIFIED_INTERVIEWER`, `NO_COMPATIBLE_ROOM`, `NO_CANDIDATE_AVAILABILITY`) are attached to any variable with an empty domain.

2. **Minimum Remaining Values (MRV) Variable Ordering**:
   At each step of backtracking, the solver picks the unassigned variable with the smallest current domain size $|D(V)|$. Ties are broken by earlier round order, then alphabetical ID.

3. **Soft-Objective Value Ordering**:
   Domain options are sorted by a multi-objective soft cost function:
   $$\text{Cost} = 10 \cdot \sum \text{interviewerLoad} + 2 \cdot (\text{capacity}(R) - \text{requiredCapacity}) + \text{earlinessPenalty}$$
   This distributes workload evenly across interviewers and minimizes empty seat waste.

4. **Forward Checking**:
   Assigning an option immediately prunes conflicting options from all remaining unassigned variables. If any unassigned variable's domain wipes out ($|D| = 0$), the branch is pruned immediately, reducing search space exponentially.

## 3. Localized Ripple-Effect Rescheduling (Victory Tier)

When an interviewer cancels last-minute:
1. All unaffected sessions are converted into locked `ExistingReservation` boundaries.
2. The rescheduler attempts an **In-Place Interviewer Swap** (keeping candidate, slot, and room identical, replacing only the dropped panelist with a qualified colleague).
3. If no replacement is available, it attempts a **Localized Slot Shift** for that single interview without disturbing any other session.
4. The independent schedule validator audits the repaired timetable before committing.

