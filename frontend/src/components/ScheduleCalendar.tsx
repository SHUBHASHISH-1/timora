'use client';

import React, { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { downloadScheduleICS } from '@/lib/api';

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
  const [exporting, setExporting] = useState(false);

  const activeSessions = sessions.filter((s) => s.status !== 'Cancelled');
  const events = activeSessions.map((s) => ({
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
    activeSessions.length > 0
      ? new Date(activeSessions[0].startMs).toISOString()
      : '2026-10-28T09:00:00.000Z';

  const handleExportICS = async () => {
    try {
      setExporting(true);
      await downloadScheduleICS();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-950">
            Persisted Interview Schedule Time-Grid
          </h3>
          <p className="text-xs text-neutral-500">
            Powered by FullCalendar · Synchronized with CSP Engine & MongoDB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 border border-neutral-200">
            {events.length} Active Slot(s)
          </span>
          {events.length > 0 && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportICS}
              className="px-3 py-1 rounded bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition"
            >
              {exporting ? 'Exporting...' : 'Export .ICS'}
            </button>
          )}
        </div>
      </div>

      {events.length === 0 && (
        <div className="mb-4 p-3.5 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 text-xs flex items-center justify-between">
          <span>
            No scheduled interview slots found for this view. Confirmed sessions will populate dynamically once generated or booked.
          </span>
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