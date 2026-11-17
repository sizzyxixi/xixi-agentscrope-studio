/** XIXI host integration only; agent forms and management pages are upstream. */
const key = 'agentscope-platform-admin-auth-v1';
export function getAdminToken(): string { try { return JSON.parse(localStorage.getItem(key) || 'null')?.token || ''; } catch { return ''; } }
export function saveAdminAuth(value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }
export function serviceUrl(path: string) { return new URL('/api/agentscope-service/' + path.replace(/^\//, ''), window.location.origin); }
