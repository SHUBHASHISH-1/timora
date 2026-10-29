// frontend/src/lib/api.ts

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('timora_token');
}

export function setStoredAuth(token: string, user: Record<string, unknown>): void {
  localStorage.setItem('timora_token', token);
  localStorage.setItem('timora_user', JSON.stringify(user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem('timora_token');
  localStorage.removeItem('timora_user');
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function downloadCandidateCV(candidateUserId: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/profile/cv/${candidateUserId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const errData = contentType.includes('application/json') ? await res.json() : null;
    throw new Error(errData?.error || 'No CV uploaded or unable to download CV document.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export async function downloadScheduleICS(driveId?: string): Promise<void> {
  const token = getStoredToken();
  const query = driveId ? `?driveId=${encodeURIComponent(driveId)}` : '';
  const res = await fetch(`${API_BASE}/schedules/ics${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error('Failed to export .ics calendar file.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = driveId ? `timora_schedule_${driveId}.ics` : 'timora_schedule.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}