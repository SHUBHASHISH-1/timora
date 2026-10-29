// backend/src/services/icsService.ts

import { IInterviewSession } from '../models';

function formatICSDateUTC(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  // Convert YYYY-MM-DDTHH:mm:ss.sssZ -> YYYYMMDDTHHmmssZ
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function generateICSFeed(
  sessions: IInterviewSession[],
  calendarTitle = 'Timora Recruitment Schedule'
): string {
  const nowStamp = formatICSDateUTC(Date.now());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Timora//CSP Recruitment Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(calendarTitle)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const s of sessions) {
    if (s.status === 'Cancelled') continue;

    const uid = `${s.variableId}@timora.dev`;
    const dtStart = formatICSDateUTC(s.startMs);
    const dtEnd = formatICSDateUTC(s.endMs);
    const summary = `${s.roundName} - ${s.candidateName} (${s.companyName})`;
    const description = [
      `Placement Drive: ${s.driveTitle} (${s.companyName})`,
      `Round: ${s.roundName}`,
      `Candidate: ${s.candidateName}`,
      `Interviewer Panel: ${s.interviewerNames.join(', ')}`,
      `Venue: ${s.roomName}`,
      `Status: ${s.status}`,
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeICSText(uid)}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeICSText(summary)}`,
      `DESCRIPTION:${escapeICSText(description)}`,
      `LOCATION:${escapeICSText(s.roomName)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}