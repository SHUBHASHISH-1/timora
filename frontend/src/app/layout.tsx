import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TIMORA — Constraint-Satisfaction Recruitment Scheduler',
  description: 'Automated conflict-free campus placement interview scheduling engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-950 antialiased">
        {children}
      </body>
    </html>
  );
}