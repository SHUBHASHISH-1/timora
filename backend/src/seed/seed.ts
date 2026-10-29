// backend/src/seed/seed.ts

import bcrypt from 'bcryptjs';
import { connectDatabase, closeDatabase } from '../config/db';
import {
  UserModel,
  CandidateProfileModel,
  InterviewerProfileModel,
  RoomModel,
  AvailabilityModel,
  PlacementDriveModel,
  AuditLogModel,
} from '../models';

async function seed() {
  await connectDatabase();

  const passwordHash = await bcrypt.hash('password123', 10);

  // Base window: UTC 2026-10-28 09:00 to 17:00
  const dayStart = Date.UTC(2026, 9, 28, 9, 0, 0);
  const dayEnd = Date.UTC(2026, 9, 28, 17, 0, 0);

  // 1. Create or Find Admin / Placement Coordinator (Idempotent)
  let admin = await UserModel.findOne({ email: 'officer@timora.dev' });
  if (!admin) {
    admin = await UserModel.create({
      name: 'Prof. Suresh Iyer',
      email: 'officer@timora.dev',
      passwordHash,
      role: 'ADMIN',
      department: 'Training & Placement Cell',
      phone: '+91-9876543210',
    });
    console.log('[SEED] Created Admin: officer@timora.dev');
  } else {
    console.log('[SEED] Admin already exists: officer@timora.dev (skipped)');
  }

  // 2. Create or Find Interviewers (Idempotent)
  const interviewersData = [
    {
      name: 'Leena Fernandes',
      email: 'leena@timora.dev',
      company: 'Northwind Labs',
      skills: ['DSA', 'Algorithms', 'C++', 'System Design'],
      windows: [{ startMs: dayStart, endMs: dayEnd }],
    },
    {
      name: 'Farhan Ali',
      email: 'farhan@timora.dev',
      company: 'Northwind Labs',
      skills: ['DSA', 'Backend', 'Node.js', 'System Design'],
      windows: [{ startMs: dayStart, endMs: dayEnd }],
    },
    {
      name: 'Vikram Bose',
      email: 'vikram@timora.dev',
      company: 'Northwind Labs',
      skills: ['System Design', 'Distributed Systems', 'HR', 'Leadership'],
      windows: [{ startMs: dayStart, endMs: dayEnd }],
    },
  ];

  const interviewerIds: string[] = [];
  for (const item of interviewersData) {
    let u = await UserModel.findOne({ email: item.email });
    if (!u) {
      u = await UserModel.create({
        name: item.name,
        email: item.email,
        passwordHash,
        role: 'INTERVIEWER',
        department: 'Engineering Panel',
      });
      console.log(`[SEED] Created Interviewer: ${item.email}`);
    } else {
      console.log(`[SEED] Interviewer already exists: ${item.email} (skipped)`);
    }
    interviewerIds.push(String(u._id));

    await InterviewerProfileModel.findOneAndUpdate(
      { userId: u._id },
      {
        $setOnInsert: {
          company: item.company,
          department: 'Core Engineering',
          skills: item.skills,
          maxInterviewsPerDay: 6,
        },
      },
      { upsert: true }
    );

    await AvailabilityModel.findOneAndUpdate(
      { userId: u._id },
      {
        $setOnInsert: {
          role: 'INTERVIEWER',
          windows: item.windows,
        },
      },
      { upsert: true }
    );
  }

  // 3. Create or Find Candidates (Idempotent)
  const candidatesData = [
    {
      name: 'Aarav Sharma',
      email: 'aarav@timora.dev',
      regNo: '20253283',
      cgpa: 9.34,
      skills: ['C++', 'DSA', 'Next.js', 'TypeScript', 'MongoDB'],
    },
    {
      name: 'Divya Nair',
      email: 'divya@timora.dev',
      regNo: '20253272',
      cgpa: 9.12,
      skills: ['Java', 'DSA', 'System Design', 'PostgreSQL'],
    },
    {
      name: 'Karan Verma',
      email: 'karan@timora.dev',
      regNo: '20253271',
      cgpa: 8.95,
      skills: ['C++', 'Algorithms', 'React', 'Node.js'],
    },
  ];

  const candidateIds: string[] = [];
  for (const c of candidatesData) {
    let u = await UserModel.findOne({ email: c.email });
    if (!u) {
      u = await UserModel.create({
        name: c.name,
        email: c.email,
        passwordHash,
        role: 'CANDIDATE',
        department: 'Computer Science & Engineering',
      });
      console.log(`[SEED] Created Candidate: ${c.email}`);
    } else {
      console.log(`[SEED] Candidate already exists: ${c.email} (skipped)`);
    }
    candidateIds.push(String(u._id));

    await CandidateProfileModel.findOneAndUpdate(
      { userId: u._id },
      {
        $setOnInsert: {
          registrationNumber: c.regNo,
          degree: 'B.Tech',
          branch: 'Computer Science & Engineering',
          graduationYear: 2027,
          cgpa: c.cgpa,
          skills: c.skills,
          eligibleDriveIds: [],
          completedRoundIds: [],
          currentStage: 'Shortlisted for Technical Round 1',
        },
      },
      { upsert: true }
    );

    await AvailabilityModel.findOneAndUpdate(
      { userId: u._id },
      {
        $setOnInsert: {
          role: 'CANDIDATE',
          windows: [{ startMs: dayStart, endMs: dayEnd }],
        },
      },
      { upsert: true }
    );
  }

  // 4. Create Rooms (Idempotent)
  const roomsData = [
    {
      name: 'Seminar Hall B',
      building: 'Main Academic Building',
      capacity: 6,
      features: ['Whiteboard', 'Projector', 'High-Speed LAN'],
      availableWindows: [{ startMs: dayStart, endMs: dayEnd }],
      isActive: true,
    },
    {
      name: 'Panel Room A-102',
      building: 'Placement Block',
      capacity: 4,
      features: ['Whiteboard', 'Smart Display'],
      availableWindows: [{ startMs: dayStart, endMs: dayEnd }],
      isActive: true,
    },
    {
      name: 'Panel Room B-201',
      building: 'Placement Block',
      capacity: 3,
      features: ['Whiteboard'],
      availableWindows: [{ startMs: dayStart, endMs: dayEnd }],
      isActive: true,
    },
  ];

  for (const r of roomsData) {
    await RoomModel.findOneAndUpdate(
      { name: r.name },
      { $setOnInsert: r },
      { upsert: true }
    );
  }
  console.log('[SEED] Ensured 3 default interview rooms.');

  // 5. Create Placement Drive (Idempotent)
  let drive = await PlacementDriveModel.findOne({ title: 'SDE Campus Drive 2026' });
  if (!drive) {
    drive = await PlacementDriveModel.create({
      title: 'SDE Campus Drive 2026',
      companyName: 'Northwind Labs',
      jobRole: 'Software Development Engineer (SDE-1)',
      packageLPA: '28 LPA',
      description:
        'Multi-round technical & system design campus recruitment drive with automated CSP scheduling.',
      status: 'Draft',
      selfBookingEnabled: true,
      allowedTimeWindows: [{ startMs: dayStart, endMs: dayEnd }],
      rounds: [
        {
          roundId: 'R1_DSA',
          name: 'Technical Round 1 — DSA',
          order: 1,
          durationMinutes: 45,
          bufferMinutes: 15,
          requiredSkills: ['DSA'],
          panelSize: 1,
          requiredRoomCapacity: 2,
          passingScoreThreshold: 70,
        },
        {
          roundId: 'R2_SYSDESIGN',
          name: 'Technical Round 2 — System Design',
          order: 2,
          durationMinutes: 45,
          bufferMinutes: 15,
          requiredSkills: ['System Design'],
          panelSize: 1,
          requiredRoomCapacity: 2,
          prerequisiteRoundId: 'R1_DSA',
          passingScoreThreshold: 75,
        },
      ],
      eligibleCandidateIds: candidateIds,
      assignedInterviewerIds: interviewerIds,
    });
    console.log('[SEED] Created Placement Drive: SDE Campus Drive 2026');

    await CandidateProfileModel.updateMany(
      { userId: { $in: candidateIds } },
      { $addToSet: { eligibleDriveIds: String(drive._id) } }
    );

    await AuditLogModel.create({
      actorName: admin.name,
      actorRole: 'ADMIN',
      action: 'SEED_INITIALIZED',
      details:
        'Initialized demo placement drive "SDE Campus Drive 2026" (Northwind Labs) with 3 candidates, 3 interviewers, and 3 rooms.',
    });
  } else {
    // Clean up any existing mojibake in seeded drive round names if already seeded earlier
    let updatedRounds = false;
    for (const round of drive.rounds) {
      if (round.name.includes('â€”')) {
        round.name = round.name.replace(/â€”/g, '—');
        updatedRounds = true;
      }
    }
    if (updatedRounds) {
      await drive.save();
    }
    console.log('[SEED] Placement Drive already exists: SDE Campus Drive 2026 (verified)');
  }

  console.log('[TIMORA SEED] Completed successfully!');
  console.log('----------------------------------------------------');
  console.log('Demo Accounts (Password for all: password123):');
  console.log('  ADMIN       : officer@timora.dev');
  console.log('  INTERVIEWER : leena@timora.dev');
  console.log('  CANDIDATE   : aarav@timora.dev');
  console.log('----------------------------------------------------');

  await closeDatabase();
}

seed().catch(async (err) => {
  console.error('[SEED ERROR]:', err);
  await closeDatabase();
  process.exit(1);
});