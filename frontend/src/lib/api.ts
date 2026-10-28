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


