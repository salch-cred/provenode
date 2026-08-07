export async function apiFetch<T = any>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  const tenant = localStorage.getItem('tenant');
  if (tenant) (opts.headers as any)['X-Tenant-Id'] = tenant;
  if (body) {
    if (isForm) opts.body = body as FormData;
    else { (opts.headers as any)['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`);
  return data as T;
}
export const get   = <T = any>(p: string) => apiFetch<T>('GET', p);
export const post  = <T = any>(p: string, b?: unknown) => apiFetch<T>('POST', p, b);
export const del   = <T = any>(p: string) => apiFetch<T>('DELETE', p);
export const patch = <T = any>(p: string, b?: unknown) => apiFetch<T>('PATCH', p, b);
export const upload = <T = any>(p: string, f: FormData) => apiFetch<T>('POST', p, f, true);