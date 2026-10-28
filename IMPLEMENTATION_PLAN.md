# TIMORA Frontend Implementation Plan

## Phase 1: Repository Audit & Reconciliation
- Audited Webster 2026 abstract (Team 212 — Sh Trio), prototype HTMLs, and handwritten sketches.
- Confirmed strict monochrome design system (black `#0a0a0a`, white `#ffffff`, neutral grays).
- Reconciled exact role navigation structures (Admin: 7 items, Interviewer: 5 items, Candidate: 4 items).

## Phase 2: Design Tokens & Shared Application Shell
- Built `ApplicationShell.tsx` enforcing role-locked navigation items and responsive sidebar.
- Added FullCalendar integration in `ScheduleCalendar.tsx` with timegrid styling.
- Built centralized API client `lib/api.ts` managing JWT tokens, error handling, and .ics calendar exports.

## Phase 3: Split-Screen Monochrome Login Experience
- Built `app/page.tsx` with role switching (Candidate, Interviewer, Admin).
- Included one-click demo credentials (`officer@timora.dev`, `leena@timora.dev`, `aarav@timora.dev`).
- Integrated 6x4 schedule slot matrix visual matching the prototype.

## Phase 4: Admin Placement Coordinator Command Center
- Built `app/admin/page.tsx` supporting:
  - Dashboard with 4 metric cards, placement drives overview, and audit activity feed.
  - Placement Drives management (+ New Drive form, rounds configuration).
  - Manage Candidates with search/filter, CGPA/skill tags, eligibility toggling, and CV PDF download.
  - Interview Scheduling with CSP solver trigger, MRV diagnostics, independent validation checks, and schedule publication.
  - Rooms management matching Sketch 3 (`RoomId` + live `Occupied •` status dot).
  - Interviewer Availability window manager.
  - Coordinator Profile management.

## Phase 5: Interviewer Panel Dashboard & Live Rubric Scoring
- Built `app/interviewer/page.tsx` supporting:
  - Dashboard with Upcoming & Completed toggle buttons and nearest upcoming interview banner matching Sketch WhatsApp Image 2026-10-26.
  - Time-ordered interview list with candidate, round, room, and status.
  - Emergency cancellation trigger executing localized ripple-effect auto-repair.
  - My Calendar rendering assignments via FullCalendar time-grid.
  - Availability submission form.
  - Live rubric evaluation sheets scoring Problem Solving, Technical Depth, and Communication.
  - Interviewer profile management.

## Phase 6: Candidate Self-Booking Portal & CV Workflow
- Built `app/candidate/page.tsx` supporting:
  - Dashboard with current recruitment stage, upcoming interviews, drives, and next interview banner.
  - My Interviews with timetable breakdown and status badges.
  - Availability & Self-Booking interface with atomic optimistic concurrency control.
  - Candidate Profile with PDF CV upload and metadata inspection (matching Sketch 2.jpeg).

