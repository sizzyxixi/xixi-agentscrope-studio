"use client";
import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { consoleApi } from '@/lib/console-api';
export function PlatformServiceLink({ token }: { token: string }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => { if (!token) return; const abort = new AbortController(); void consoleApi<{ can_manage: boolean }>(token, 'platform-access', 'GET', undefined, abort.signal).then(result => setAllowed(result.can_manage)).catch(() => setAllowed(false)); return () => abort.abort(); }, [token]);
  if (!token || !allowed) return null;
  return <a href="/agentscope-admin/chat" target="_blank" rel="noopener noreferrer" className="secondaryButton" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}><Settings2 size={15}/>服务管理</a>;
}
