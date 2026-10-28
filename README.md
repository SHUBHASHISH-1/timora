# TIMORA — Constraint-Satisfaction Recruitment Scheduler
**Webster 2026 Hackathon | Team: Sh Trio (Team ID: 212)**
*Members: Shubhashish (20253283), Shivraj Santosh Dhengale (20253272), Shivendra Singh (20253271)*

---

## 1. Project Overview

**Timora** is an automated, constraint-satisfaction scheduling engine designed to solve complex institutional and campus recruitment interview scheduling. It eliminates scheduling collisions, double-booking, room capacity violations, and last-minute cancellation chaos through:

1. **Deterministic Backtracking CSP Engine**: Powered by Minimum Remaining Values (MRV) variable ordering, forward checking, and multi-round prerequisite dependency chaining.
2. **Independent Hard-Constraint Validator**: A zero-trust post-computation audit validator ensuring 0% constraint violations prior to schedule publication.
3. **Optimistic Concurrency Control (OCC) Self-Booking**: Atomic MongoDB `$set` and `$inc` updates that prevent race conditions when hundreds of candidates select slots concurrently.
4. **Automated Rescheduling Engine (Victory Tier)**: Localized ripple-effect resolution that dynamically repairs emergency interviewer dropouts in-place or via localized slot shifts without disrupting the rest of the schedule.
5. **Live Evaluation Rubrics (Victory Tier)**: Synchronous scoring sheets that automatically advance candidates ($Coding \rightarrow Tech \rightarrow HR$) or filter them out in real time.
6. **Standards-Compliant .ics Calendar Export**: RFC 5545 .ics generation for calendar synchronization across Google Calendar, Apple Calendar, and Microsoft Outlook.

---

## 2. Monorepo Repository Structure

```
timora/
├── package.json
├── .env.example
├── README.md
├── ARCHITECTURE.md
├── CSP_ALGORITHM.md
├── IMPLEMENTATION_PLAN.md
├── TESTING.md
├── shared/
│   └── types/
│       └── csp.ts
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   └── db.ts
│   │   ├── models/
│   │   │   └── index.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── upload.ts
│   │   ├── engine/
│   │   │   ├── cspSolver.ts
│   │   │   ├── scheduleValidator.ts
│   │   │   └── rescheduler.ts
│   │   ├── services/
│   │   │   ├── icsService.ts
│   │   │   └── geminiService.ts
│   │   ├── routes/
│   │   │   └── api.routes.ts
│   │   ├── seed/
│   │   │   └── seed.ts
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       └── csp.spec.ts
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs
    ├── postcss.config.mjs
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── layout.tsx
        │   ├── page.tsx
        │   ├── admin/
        │   │   └── page.tsx
        │   ├── interviewer/
        │   │   └── page.tsx
        │   └── candidate/
        │       └── page.tsx
        ├── components/
        │   ├── ApplicationShell.tsx
        │   └── ScheduleCalendar.tsx
        └── lib/
            └── api.ts
```

---

## 3. Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, `@fullcalendar/react` (`@fullcalendar/timegrid`, `@fullcalendar/daygrid`, `@fullcalendar/interaction`).
- **Backend**: Node.js, Express, MongoDB, Mongoose, Zod runtime schema validation, `bcryptjs`, `jsonwebtoken`, `multer`, `ics`.
- **Constraint Satisfaction Engine**: Pure TypeScript implementation of Backtracking with MRV heuristic, forward checking, domain pruning, and localized ripple-effect resolution.
- **Testing**: Vitest test runner with 17 mandatory constraint scenarios.

---

## 4. Setup & Running Instructions

### Prerequisites
- Node.js >= 18.0.0
- MongoDB running locally at `mongodb://127.0.0.1:27017/timora_db` (or MongoDB Atlas URI)

### Quick Start

1. **Install Dependencies**:
   ```bash
   cd timora
   npm run install:all
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` into `backend/.env` and `frontend/.env.local`:
   ```bash
   cp .env.example backend/.env
   cp .env.example frontend/.env.local
   ```

3. **Seed Database with Demo Campus Recruitment Data**:
   ```bash
   npm run seed
   ```

4. **Run Automated Test Suite (17 CSP Scenarios)**:
   ```bash
   npm run test
   ```

5. **Start Development Servers**:
   ```bash
   # Terminal 1 (Backend on port 4000):
   npm run dev:backend

   # Terminal 2 (Frontend on port 3000):
   npm run dev:frontend
   ```

6. Open your browser at [http://localhost:3000](http://localhost:3000).

---

## 5. Seeded Demo Accounts (Password for all: `password123`)

| Role | Email | Name | Focus |
|---|---|---|---|
| **Admin / Coordinator** | `officer@timora.dev` | Prof. Suresh Iyer | T&P Officer Command Center |
| **Interviewer** | `leena@timora.dev` | Leena Fernandes | Panel Expert (DSA & System Design) |
| **Candidate** | `aarav@timora.dev` | Aarav Sharma | B.Tech CSE (9.34 CGPA) |

