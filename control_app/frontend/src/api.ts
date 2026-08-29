export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const apiRoot = window.location.pathname.startsWith("/telemetrika") ? "/telemetrika/api/" : "/api/";

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`,
  {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Ошибка ${response.status}`, response.status);
  return data as T;
}

export function query(params: Record<string, string | number | boolean | string[] | undefined>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(item => result.append(key, item));
    else if (value !== undefined && value !== "" && value !== false) result.set(key, value === true ? "1" : String(value));
  }
  return result.toString();
}
