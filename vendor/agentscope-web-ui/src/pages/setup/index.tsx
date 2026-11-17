import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { saveAdminAuth, serviceUrl } from '@/api/platform-auth';

/** Host authentication boundary. All configuration pages remain the upstream UI. */
export function SetupPage({ onComplete, className }: { onComplete: () => void; className?: string }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const auth = await response.json(); if (!response.ok) throw new Error(auth.detail || '登录失败');
      const access = await fetch(serviceUrl('/platform/access'), { headers: { Authorization: `Bearer ${auth.token}` } });
      if (!access.ok) { const result = await access.json(); throw new Error(result.detail || '没有平台配置权限'); }
      saveAdminAuth(auth); setPassword(''); onComplete();
    } catch (e) { setError(e instanceof Error ? e.message : '服务连接失败，请重试'); } finally { setBusy(false); }
  }
  return <div className={`flex min-h-screen items-center justify-center p-6 ${className || ''}`}><Card className="w-full max-w-sm"><CardHeader><CardTitle>AgentScope 服务管理</CardTitle><CardDescription>使用平台管理员账号登录，配置修改会直接同步至智能体市场。</CardDescription></CardHeader><CardContent><form onSubmit={event => void submit(event)}><FieldGroup><Field><FieldLabel htmlFor="admin-name">管理员账号</FieldLabel><Input id="admin-name" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required/></Field><Field><FieldLabel htmlFor="admin-password">密码</FieldLabel><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></Field>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button disabled={busy} type="submit">{busy ? '登录中…' : '登录'}</Button></FieldGroup></form></CardContent></Card></div>;
}
