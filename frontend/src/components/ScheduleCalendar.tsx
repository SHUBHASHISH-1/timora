'use client';

import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

export interface CalendarSessionItem {
  _id?: string;
  variableId: string;
  companyName: string;
  roundName: string;
  candidateName: string;
  interviewerNames: string[];
  roomName: string;
  startMs: number;
  endMs: number;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}

export function ScheduleCalendar({ sessions }: { sessions: CalendarSessionItem[] }) {
  const events = sessions
    .filter((s) => s.status !== 'Cancelled')
    .map((s) => ({
      id: s.variableId,
      title: `${s.roundName} · ${s.candidateName} (${s.roomName})`,
      start: new Date(s.startMs).toISOString(),
      end: new Date(s.endMs).toISOString(),
      backgroundColor: s.status === 'Completed' ? '#525252' : '#0a0a0a',
      borderColor: '#0a0a0a',
      textColor: '#ffffff',
      extendedProps: s,
    }));

  const initialDate =
    sessions.length > 0 ? new Date(sessions[0].startMs).toISOString() : '2026-10-28T09:00:00.000Z';

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-950">
            Persisted Interview Schedule Time-Grid
          </h3>
          <p className="text-xs text-neutral-500">
            Powered by FullCalendar · Synchronized with CSP Engine & MongoDB
          </p>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 border border-neutral-200">
          {events.length} Active Slot(s)
        </span>
      </div>

      {events.length === 0 && (
        <div className="mb-4 p-3.5 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 text-xs flex items-center justify-between">
          <span>No scheduled interview slots found for this view. Confirmed sessions will populate dynamically once generated or booked.</span>
        </div>
      )}

      <FullCalendar
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridDay"
        initialDate={initialDate}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'timeGridDay,timeGridWeek,dayGridMonth',
        }}
        slotMinTime="08:00:00"
        slotMaxTime="19:00:00"
        allDaySlot={false}
        height="auto"
        events={events}
      />
    </div>
  );
}

