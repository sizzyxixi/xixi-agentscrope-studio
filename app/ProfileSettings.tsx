"use client";
import { StudioInput, StudioButton } from "./StudioControls";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Pencil, X } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { useToast } from "@/components/OperationFeedback";
import { Dialog } from "@/components/hero-ui/dialog";

export type ProfileUser = { id: string; username: string; created_at?: string };

export function ProfileSettings({ user, token, onUserChange, onLogout }: {
  user: ProfileUser; token: string; onUserChange: (user: ProfileUser) => void; onLogout: () => void;
}) {
  const { t, language } = usePreferences();
  const toast = useToast();
  const profileRevision = useRef(0);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [savingName, setSavingName] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const revision = profileRevision.current;
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { user: ProfileUser };
        if (!controller.signal.aborted && revision === profileRevision.current && payload.user.id === user.id) onUserChange(payload.user);
      } catch { /* Keep the cached profile while offline. */ }
    })();
    return () => controller.abort();
  }, [token, user.id, onUserChange]);

  const saveUsername = async (event: FormEvent) => {
    event.preventDefault();
    if (savingName) return;
    const name = username.trim();
    if (!/^[A-Za-z0-9]{4,}$/.test(name)) { toast.error("用户名至少 4 位，只能包含英文和数字。"); return; }
    if (name === user.username) { setEditing(false); return; }
    profileRevision.current++;
    setSavingName(true);
    try {
      const response = await fetch("/api/auth/me", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ username: name }) });
      const payload = await response.json() as { user?: ProfileUser; detail?: string };
      if (!response.ok || !payload.user) throw new Error(payload.detail || "用户名修改失败。");
      onUserChange(payload.user);
      setEditing(false);
      toast.success("用户名已更新。");
    } catch (error) { toast.error((error as Error).message); }
    finally { setSavingName(false); }
  };

  const closePassword = () => { setPasswordOpen(false); setPassword(""); setConfirmation(""); };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (savingPassword) return;
    if (Array.from(password).length < 6) { toast.error("新密码至少 6 位。"); return; }
    if (password !== confirmation) { toast.error("两次输入的密码不一致。"); return; }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ new_password: password, confirm_password: confirmation }) });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "密码修改失败。");
      closePassword();
      toast.success("密码已修改。");
    } catch (error) { toast.error((error as Error).message); }
    finally { setSavingPassword(false); }
  };
  const date = user.created_at ? new Date(user.created_at) : null;
  const registered = date && Number.isFinite(date.getTime()) ? date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return <div className="accountProfile">
    <dl className="accountProfileDetails">
      <div className="accountProfileRow"><dt>{t("用户名")}</dt><dd>{editing ? <form className="profileNameForm" onSubmit={saveUsername}>
        <StudioInput autoFocus aria-label={t("用户名")} value={username} onChange={event => setUsername(event.target.value)} disabled={savingName} required minLength={4} autoComplete="username" onKeyDown={event => { if (event.key === "Escape" && !savingName) setEditing(false); }} />
        <StudioButton type="submit" className="profileIconButton" disabled={savingName} aria-label={t("保存用户名")} title={t("保存用户名")}><Check size={16} /></StudioButton>
        <StudioButton type="button" className="profileIconButton" disabled={savingName} onClick={() => setEditing(false)} aria-label={t("取消")} title={t("取消")}><X size={16} /></StudioButton>
      </form> : <div className="profileNameValue"><strong>{user.username}</strong><StudioButton type="button" className="profileIconButton profileEditName" aria-label={t("修改用户名")} title={t("修改用户名")} onClick={() => { setUsername(user.username); setEditing(true); }}><Pencil size={15} /></StudioButton></div>}</dd></div>
      <div className="accountProfileRow"><dt>{t("注册时间")}</dt><dd><time dateTime={user.created_at}>{registered}</time></dd></div>
    </dl>
    <div className="profileActions"><StudioButton type="button" onClick={() => setPasswordOpen(true)}>{t("修改密码")}</StudioButton><StudioButton type="button" className="profileLogout" onClick={onLogout}>{t("退出登录")}</StudioButton></div>
    <Dialog.Root open={passwordOpen} onOpenChange={open => { if (!savingPassword) { if (open) setPasswordOpen(true); else closePassword(); } }} isKeyboardDismissDisabled={savingPassword}>
      <Dialog.Portal><Dialog.Overlay /><Dialog.Content className="profilePasswordDialog" onInteractOutside={savingPassword ? event => event.preventDefault() : undefined}>
        <Dialog.Title>{t("修改密码")}</Dialog.Title>
        <Dialog.Description>{t("新密码至少 6 位。")}</Dialog.Description>
        <form className="profilePasswordForm" onSubmit={savePassword}>
          <label>{t("新密码")}<StudioInput autoFocus type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={6} disabled={savingPassword} placeholder={t("至少 6 位")} /></label>
          <label>{t("重复密码")}<StudioInput type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={6} disabled={savingPassword} /></label>
          <div className="profileActions"><StudioButton type="button" disabled={savingPassword} onClick={closePassword}>{t("取消")}</StudioButton><StudioButton className="profileSavePassword" type="submit" disabled={savingPassword}>{t(savingPassword ? "保存中…" : "确认修改")}</StudioButton></div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
