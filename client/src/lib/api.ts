const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message ?? `Request failed: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

export function toDateInputValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}
