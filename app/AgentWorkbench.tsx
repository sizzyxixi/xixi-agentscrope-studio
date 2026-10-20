"use client";
import { settleRun, type RunTiming } from "./run-activity";

import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import Image from "next/image";

import {
  AlarmClock,
  Blocks,
  Box,
  ChevronDown,
  Database,
  DiamondPlus,
  FolderOpen,
  Sparkles,
  SquareUser,
} from "./lucide-icons";
import { MoreHorizontal, Pin, PinOff, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/hero-ui/dropdown-menu";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CapabilityTab, ConsoleView, StudioConsole, consoleApi, downloadFile } from "./StudioConsole";
import ScheduleConsole from "./ScheduleConsole";
import ChannelSettings from "./ChannelSettings";
import { AgentPicker } from "./AgentPicker";
import { CapabilityNav } from "./CapabilityNav";
import type { AgentProfile } from "./AgentEditor";
import { AppearanceSettings } from "./AppearanceSettings";
import { AboutSettings } from "./AboutSettings";
import KnowledgeConsole from "./KnowledgeConsole";
import { usePreferences } from "@/components/PreferencesProvider";
import { ChatSkillPicker } from "./ChatSkillPicker";
import { SelectField, ModelPicker } from "@/components/SelectField";
import type { StudioFile } from "./file-api";
import { AssistantConversation, type ConversationPart } from "./AssistantConversation";

import type { TokenUsage } from "./token-usage";

type NavView = "task" | "settings" | ConsoleView;
type SettingsTab = "profile" | "models" | "channels" | "appearance" | "memory" | "about";
type AuthMode = "login" | "register";
type Role = "user" | "assistant" | "system";
type SessionStatus = "ready" | "streaming" | "waiting_approval";
type SupportedProvider =
  | "kimi"
  | "deepseek"
  | "doubao"
  | "openai"
  | "anthropic"
  | "qwen"
  | "gemini"
  | "ollama"
  | "openai-compatible";

type Message = {
  activity?: RunTiming | null;
  id: string;
  role: Role;
  content: string;
  status?: SessionStatus;
  files?: StudioFile[];
  resources?: { id: string; kind: string; name: string }[];
  parts?: ConversationPart[];
  createdAt?: string;
  tokenUsage?: TokenUsage | null;
};

type StreamEvent = {
  id: string;
  type: "state" | "memory" | "rag" | "agent" | "tool" | "approval" | "token" | "done";
  title: string;
  detail: string;
  ts: string;
  level?: "info" | "success" | "warning";
};

type Approval = {
  id: string;
  toolName: string;
  reason: string;
  args: Record<string, string>;
};

type Session = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  messages: Message[];
  events: StreamEvent[];
  pendingApproval?: Approval;
  skillIds?: string[];
  mcpIds?: string[];
  mockShopIds?: string[];
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  draftInput?: string;
  pinned?: boolean;
  customTitle?: boolean;
  persisted?: boolean;
};

type CurrentUser = {
  id: string;
  username: string;
};

type ModelSetting = {
  id: string;
  provider: SupportedProvider;
  displayName: string;
  modelName: string;
  endpoint: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
};

type ModelForm = {
  provider: SupportedProvider;
  displayName: string;
  modelName: string;
  endpoint: string;
  apiKey: string;
  makeDefault: boolean;
};

type ServerEvent =
  | { type: "run_activity"; activity: RunTiming }
  | { type: "state" | "memory" | "rag" | "agent" | "tool"; title: string; detail: string; level?: StreamEvent["level"] }
  | { type: "approval_required"; approval: Approval; title: string; detail: string }
  | { type: "token_usage"; usage: TokenUsage | null }
  | { type: "files_updated"; files: StudioFile[] }
  | { type: "message_parts"; parts: ConversationPart[] }
  | { type: "token"; text: string }
  | { type: "done"; title: string; detail: string; level?: StreamEvent["level"] };

type AuthResponse =
  | {
      user: CurrentUser;
      token: string;
      detail?: string;
    }
  | {
      detail?: string;
    };

type ModelsResponse =
  | {
      models: ModelSetting[];
      detail?: string;
    }
  | {
      detail?: string;
    };

type ModelTestState = {
  status: "testing" | "success" | "error";
  message: string;
};

type BackendMessage = {
  activity?: RunTiming | null;
  token_usage?: TokenUsage | null;
  id: string;
  role: string;
  content: string;
  created_at?: string;
  files?: StudioFile[];
  resources?: { id: string; kind: string; name: string }[];
  parts?: ConversationPart[];
};

type BackendEvent = {
  event_type: string;
  payload: {
    type?: string;
    title?: string;
    detail?: string;
    level?: StreamEvent["level"];
  };
  created_at?: string;
};

type BackendSession = {
  id: string;
  title: string;
  subtitle: string;
  created_at: string;
  updated_at: string;
  status: SessionStatus;
  messages: BackendMessage[];
  events: BackendEvent[];
  pendingApproval?: Approval;
  skill_ids?: string[];
  agent_id?: string;
  agent_name?: string;
  agent_avatar?: string;
  pinned?: boolean;
  custom_title?: boolean;
};

const appendTextPart = (parts: ConversationPart[], text: string): ConversationPart[] => {
  const tail = parts.at(-1);
  return tail?.type === "text" ? [...parts.slice(0, -1), { ...tail, text: tail.text + text }] : [...parts, { type: "text", text }];
};

const storageKey = "agentscope-studio-sessions-v2";
const authStorageKey = "agentscope-studio-auth-v1";


const providerOptions: Array<{
  value: SupportedProvider;
  label: string;
  defaultModel: string;
  defaultEndpoint: string;
  endpointPlaceholder?: string;
  apiKeyOptional?: boolean;
  hint: string;
}> = [
  {
    value: "kimi",
    label: "Kimi",
    defaultModel: "moonshot-v1-8k",
    defaultEndpoint: "https://api.moonshot.cn/v1",
    hint: "Moonshot 开放平台 API Key，使用 AgentScope MoonshotChatModel。",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-flash",
    defaultEndpoint: "https://api.deepseek.com",
    hint: "使用 DeepSeek 官方 API Key，支持 DeepSeek Flash 和 DeepSeek V4 Pro。",
  },
  {
    value: "doubao",
    label: "豆包 / 火山方舟",
    defaultModel: "",
    defaultEndpoint: "https://ark.cn-beijing.volces.com/api/v3",
    endpointPlaceholder: "火山方舟 OpenAI-compatible Endpoint",
    hint: "Model 填写方舟 Endpoint ID，通过 OpenAI-compatible 接口调用。",
  },
  {
    value: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    defaultEndpoint: "https://api.openai.com/v1",
    hint: "OpenAI API Key，使用 AgentScope OpenAIChatModel。",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-5",
    defaultEndpoint: "",
    endpointPlaceholder: "可留空使用 Anthropic 默认接口",
    hint: "Anthropic API Key，使用 AgentScope AnthropicChatModel。",
  },
  {
    value: "qwen",
    label: "Qwen / DashScope",
    defaultModel: "qwen-plus",
    defaultEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    hint: "阿里云百炼 API Key，使用 AgentScope DashScopeChatModel。",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    defaultEndpoint: "",
    endpointPlaceholder: "Gemini SDK 使用官方接口，无需填写",
    hint: "Google AI Studio API Key，使用 AgentScope GeminiChatModel。",
  },
  {
    value: "ollama",
    label: "Ollama（本地）",
    defaultModel: "qwen3:8b",
    defaultEndpoint: "http://127.0.0.1:11434",
    apiKeyOptional: true,
    hint: "连接本机 Ollama，API Key 可留空，使用 AgentScope OllamaChatModel。",
  },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    defaultModel: "",
    defaultEndpoint: "",
    endpointPlaceholder: "例如 https://api.siliconflow.cn/v1",
    hint: "适用于 SiliconFlow、OpenRouter、vLLM 等兼容 OpenAI Chat Completions 的服务。",
  },
];

const emptyModelForm = (provider: SupportedProvider = "openai"): ModelForm => {
  const option = providerOptions.find((item) => item.value === provider) ?? providerOptions[0];
  return {
  provider,
  displayName: "",
  modelName: option.defaultModel,
  endpoint: option.defaultEndpoint,
  apiKey: "",
  makeDefault: false,
  };
};

const nowLabel = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

const timeLabel = (value?: string) => {
  if (!value) return nowLabel();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return nowLabel();

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const normalizeRole = (role: string): Role => {
  if (role === "user" || role === "system") return role;
  return "assistant";
};

const normalizeEventType = (type?: string): StreamEvent["type"] => {
  if (
    type === "state" ||
    type === "memory" ||
    type === "rag" ||
    type === "agent" ||
    type === "tool" ||
    type === "approval" ||
    type === "token" ||
    type === "done"
  ) {
    return type;
  }

  return "state";
};

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Date.now().toString(36)}`;
};

const defaultSession = (): Session => ({
  id: createId("task"),
  title: "新任务 · 主 Agent",
  subtitle: "等待连接 AgentScope service",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "ready",
  messages: [],
  events: [],
});

const isSessionDraft = (session: Session) => !session.persisted && !session.messages.some(message => message.role === "user");

const seedSessions = () => {
  return [defaultSession()];
};

const fromBackendSession = (session: BackendSession): Session => {
  const fallback = defaultSession();

  return {
    id: session.id,
    title: session.title || fallback.title,
    subtitle: session.subtitle || "AgentScope SQLite state",
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    status: session.status || "ready",
    pendingApproval: session.pendingApproval,
    skillIds: [],
    mcpIds: [],
    mockShopIds: [],
    agentId: session.agent_id ?? "main",
    agentName: session.agent_name,
    agentAvatar: session.agent_avatar,
    pinned: session.pinned ?? false,
    customTitle: session.custom_title ?? false,
    persisted: true,
    messages:
      session.messages.length > 0
        ? session.messages.map((message, index) => ({
            id: message.id,
            role: normalizeRole(message.role),
            content: message.content,
            parts: message.parts,
            tokenUsage: message.token_usage,
            activity: message.activity,
            files: message.files,
            resources: message.resources,
            createdAt: message.created_at,
            status: index === session.messages.length - 1 && message.role === "assistant" ? session.status : "ready",
          }))
        : [],
    events:
      session.events.length > 0
        ? session.events.map((event) => ({
            id: createId("event"),
            type: normalizeEventType(event.payload.type ?? event.event_type),
            title: event.payload.title ?? event.event_type,
            detail: event.payload.detail ?? "",
            ts: timeLabel(event.created_at),
            level: event.payload.level,
          }))
        : [],
  };
};

export function AgentWorkbench() {
  const [view, setView] = useState<NavView>("task");
  const [capabilityTab, setCapabilityTab] = useState<CapabilityTab>("agent");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [sessions, setSessions] = useState<Session[]>(() => seedSessions());
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [input, setInput] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [, setSessionMessage] = useFeedbackState("error");
  const { t } = usePreferences();
  const toast = useToast();
  const [mobileNav, setMobileNav] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("待连接");
  const [sessionAction, setSessionAction] = useState<{ kind: "rename" | "delete"; id: string } | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [sessionsHydrated, setSessionsHydrated] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [, setAuthMessage] = useFeedbackState("error");
  const [modelSettings, setModelSettings] = useState<ModelSetting[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelForm, setModelForm] = useState<ModelForm>(() => emptyModelForm());
  const [editingModelId, setEditingModelId] = useState("");
  const [modelTestStates, setModelTestStates] = useState<Record<string, ModelTestState>>({});
  const [, setModelMessage] = useFeedbackState("auto");
  const streamAbortRef = useRef<AbortController | null>(null);
  const agentChatBusyRef = useRef(false);
  const accountEpochRef = useRef(0);
  const historyEpochRef = useRef(0);

  const selectedModel = useMemo(
    () => modelSettings.find((model) => model.id === selectedModelId) ?? modelSettings.find((model) => model.isDefault),
    [modelSettings, selectedModelId],
  );

  const selectedModelLabel = selectedModel
    ? `${selectedModel.displayName || selectedModel.modelName}`
    : currentUser
      ? "未配置模型"
      : "请先登录";

  const selectedProviderOption =
    providerOptions.find((provider) => provider.value === modelForm.provider) ?? providerOptions[0];

  const authorizationHeaders = (token = authToken): Record<string, string> =>
    token
      ? {
          authorization: `Bearer ${token}`,
        }
      : {};

  const hydrateSessions = (incoming: Session[]) => {
    window.queueMicrotask(() => {
      let nextSessions = incoming;
      const account = JSON.parse(window.localStorage.getItem(authStorageKey) || "null") as { user?: CurrentUser } | null;
      const namespace = `${storageKey}:${account?.user?.id ?? "guest"}`;
      const selected = window.localStorage.getItem(`${namespace}:selected`);
      try {
        const draft = JSON.parse(window.localStorage.getItem(`${namespace}:draft`) || "null") as Session | null;
        if (draft && isSessionDraft(draft) && draft.id === selected && !nextSessions.some(session=>session.id===draft.id)) {
          nextSessions = [draft, ...nextSessions.filter(session=>!isSessionDraft(session))];
          setInput(draft.draftInput ?? "");
        }
      } catch { /* Invalid local draft never prevents loading server history. */ }
      setSessions(nextSessions);
      setCurrentSessionId(previous => nextSessions.some(session => session.id === previous) ? previous : selected && nextSessions.some(session=>session.id===selected) ? selected : nextSessions[0].id);
      setSessionsHydrated(true);
    });
  };

  const hydrateLocalSessions = () => {
    const account = JSON.parse(window.localStorage.getItem(authStorageKey) || "null") as { user?: CurrentUser } | null;
    const stored = window.localStorage.getItem(`${storageKey}:${account?.user?.id ?? "guest"}`);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Session[];
        if (parsed.length > 0) {
          hydrateSessions(parsed);
          return;
        }
      } catch {
        window.localStorage.removeItem(`${storageKey}:${account?.user?.id ?? "guest"}`);
      }
    }

    hydrateSessions(seedSessions());
  };

  const hydrateBackendSessions = async (token = authToken) => {
    const accountEpoch = accountEpochRef.current;
    const historyEpoch = ++historyEpochRef.current;
    try {
      const response = await fetch("/api/agent/sessions", {
        headers: authorizationHeaders(token),
      });
      if (!response.ok) throw new Error("读取会话失败。");
      const payload = (await response.json()) as { sessions?: BackendSession[] };
      if (accountEpoch !== accountEpochRef.current || historyEpoch !== historyEpochRef.current) return;
      if (payload.sessions) {
        hydrateSessions(payload.sessions.length ? payload.sessions.map(fromBackendSession) : seedSessions());
        return;
      }
    } catch {
      // Fall back to device-local sessions when AgentScope service is offline.
    }

    if (accountEpoch === accountEpochRef.current && historyEpoch === historyEpochRef.current) hydrateLocalSessions();
  };

  const loadModelSettings = async (token = authToken) => {
    const accountEpoch = accountEpochRef.current;
    if (!token) {
      setModelSettings([]);
      setSelectedModelId("");
      return;
    }

    const response = await fetch("/api/models", {
      headers: authorizationHeaders(token),
    });
    const payload = (await response.json()) as ModelsResponse;
    if (accountEpoch !== accountEpochRef.current) return;
    if (!response.ok || !("models" in payload)) {
      setModelMessage(payload.detail ?? "读取模型设置失败。");
      return;
    }

    setModelSettings(payload.models);
    setSelectedModelId(
      payload.models.find((model) => model.isDefault)?.id ?? payload.models[0]?.id ?? "",
    );
  };

  useEffect(() => {
    window.queueMicrotask(() => {
      const storedAuth = window.localStorage.getItem(authStorageKey);
      if (!storedAuth) {
        void hydrateBackendSessions("");
        return;
      }

      try {
        const parsed = JSON.parse(storedAuth) as { token?: string; user?: CurrentUser };
        if (!parsed.token || !parsed.user) {
          window.localStorage.removeItem(authStorageKey);
          void hydrateBackendSessions("");
          return;
        }

        setAuthToken(parsed.token);
        setCurrentUser(parsed.user);
        void loadModelSettings(parsed.token);
        void hydrateBackendSessions(parsed.token);
      } catch {
        window.localStorage.removeItem(authStorageKey);
        void hydrateBackendSessions("");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sessions.length > 0 && sessionsHydrated) {
      window.localStorage.setItem(`${storageKey}:${currentUser?.id ?? "guest"}`, JSON.stringify(sessions.filter(session => !isSessionDraft(session))));
    }
  }, [sessions, currentUser, sessionsHydrated]);
  useEffect(() => {
    if (!sessionsHydrated) return;
    const namespace = `${storageKey}:${currentUser?.id ?? "guest"}`;
    const selected = sessions.find(session=>session.id===currentSessionId);
    if (!selected) return;
    window.localStorage.setItem(`${namespace}:selected`, selected.id);
    if (isSessionDraft(selected)) window.localStorage.setItem(`${namespace}:draft`, JSON.stringify({...selected,draftInput:input}));
    else {
      try { if (JSON.parse(window.localStorage.getItem(`${namespace}:draft`) || "null")?.id===selected.id) window.localStorage.removeItem(`${namespace}:draft`); } catch {}
    }
  }, [sessionsHydrated, currentUser, currentSessionId, sessions, input]);


  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!authToken) { if (active) setServiceStatus("待登录"); return; }
      try { await consoleApi(authToken, "status"); if (active) setServiceStatus("服务在线"); }
      catch { if (active) setServiceStatus("服务离线"); }
    };
    void check();
    const interval = window.setInterval(() => void check(), 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [authToken]);

  const selectedSessionId = currentSessionId || sessions[0]?.id || "";

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    if (view !== "task" || !(selectedSessionId.startsWith("run-") || selectedSessionId.startsWith("channel-")) || !authToken) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (streamAbortRef.current || document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const payload = await consoleApi<{ session: BackendSession }>(authToken, `sessions/${encodeURIComponent(selectedSessionId)}`);
          const found = payload.session;
          if (active && found && !streamAbortRef.current) setSessions(previous => previous.map(session => session.id === found.id ? fromBackendSession(found) : session));
          const result = await consoleApi<{ runs: { session_id: string; status: string }[] }>(authToken, "runs");
          const run = result.runs.find(run => run.session_id === selectedSessionId);
          if (run && !["running", "waiting_approval"].includes(run.status)) window.clearInterval(timer);
        } catch { /* Reconnect on the next tick while the run remains active. */ }
      })();
    }, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [view, selectedSessionId, authToken]);

  const filteredSessions = sessions.filter(session => !isSessionDraft(session) && session.title.toLowerCase().includes(sessionSearch.toLowerCase())).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const actionSession = sessions.find(session => session.id === sessionAction?.id);
  const prepareSessionAction = (session: Session, kind: "rename" | "delete") => {
    setSessionMessage(""); setRenameTitle(session.title); setSessionAction({ kind, id: session.id });
  };
  const toggleSessionPin = async (session: Session) => {
    if (sessionBusyId) return;
    const epoch = accountEpochRef.current;
    setSessionBusyId(session.id); setSessionMessage("");
    try {
      if (authToken) await consoleApi(authToken, `sessions/${session.id}`, "PUT", { pinned: !session.pinned, create_if_missing: true });
      if (epoch !== accountEpochRef.current) return;
      updateSession(session.id, item => ({ ...item, pinned: !session.pinned, persisted: !!authToken || item.persisted }));
      toast.success(session.pinned ? "会话已取消置顶。" : "会话已置顶。");
    } catch (e) { if (epoch === accountEpochRef.current) setSessionMessage((e as Error).message); }
    finally { setSessionBusyId(""); }
  };
  const openSession = async (id: string) => {
    setSessionMessage("");
    try {
      const payload = await consoleApi<{ session: BackendSession }>(authToken, `sessions/${encodeURIComponent(id)}`);
      const found = payload.session;
      if (!found) throw new Error("会话不可用。");
      setSessions(previous => [fromBackendSession(found), ...previous.filter(session => session.id !== id)]);
      setCurrentSessionId(id); setView("task"); setMobileNav(false);
    } catch (e) { setSessionMessage((e as Error).message); }
  };
  const editSession = async () => {
    if (!actionSession || !sessionAction || sessionBusyId) return;
    const target = actionSession;
    const kind = sessionAction.kind;
    const title = renameTitle.trim();
    if (kind === "rename" && (!title || title.length > 100)) { setSessionMessage("标题需为 1–100 个字符。"); return; }
    const epoch = accountEpochRef.current;
    setSessionBusyId(target.id); setSessionMessage("");
    try {
      if (authToken && (kind === "rename" || target.persisted || target.messages.length)) await consoleApi(authToken, `sessions/${target.id}`, kind === "delete" ? "DELETE" : "PUT", kind === "rename" ? { title, create_if_missing: true } : undefined);
      if (epoch !== accountEpochRef.current) return;
      if (kind === "rename") updateSession(target.id, session => ({ ...session, title, customTitle: true, persisted: !!authToken || session.persisted }));
      else {
        const remaining = sessions.filter(session => session.id !== target.id);
        const next = remaining.length ? remaining : seedSessions();
        setSessions(next);
        if (selectedSessionId === target.id) setCurrentSessionId(next[0].id);
      }
      setSessionAction(null); toast.success(kind === "rename" ? "会话标题已更新。" : "会话已删除。");
    } catch (e) { if (epoch === accountEpochRef.current) setSessionMessage((e as Error).message); }
    finally { setSessionBusyId(""); }
  };
  const stopRun = async () => {
    streamAbortRef.current?.abort();
    if (currentSession && (currentSession.id.startsWith("run-") || currentSession.id.startsWith("channel-"))) {
      try { await consoleApi(authToken, `sessions/${currentSession.id}/stop`, "POST"); }
      catch (e) { setSessionMessage((e as Error).message); return; }
    }
    if (currentSession) updateSession(currentSession.id, session => ({ ...session, status: "ready", pendingApproval: undefined, messages: session.messages.map(message => ({ ...message, status: "ready" })) }));
  };

  const updateSession = (sessionId: string, updater: (session: Session) => Session) => {
    setSessions((previous) =>
      previous.map((session) => (session.id === sessionId ? updater(session) : session)),
    );
  };

  const createTask = (title = "新任务 · 主 Agent", opening?: string) => {
    const fresh = defaultSession();
    const next = {
      ...fresh,
      title,
      subtitle: opening ? "由定时任务创建的新会话" : fresh.subtitle,
      messages: opening
        ? [
            ...fresh.messages,
            {
              id: createId("msg"),
              role: "system" as Role,
              content: opening,
            },
          ]
        : fresh.messages,
    };

    setSessions((previous) => [next, ...previous.filter(session => !isSessionDraft(session))]);
    setCurrentSessionId(next.id);
    setInput("");
    setSessionMessage("");
    setView("task");
    setMobileNav(false);
  };

  const startAgentChat = async (agent: AgentProfile, carryDraft = false) => {
    const fresh: Session = { ...defaultSession(), title: `${agent.name} · ${t("新对话")}`, agentId: agent.id, agentName: agent.name, agentAvatar: agent.config.avatar ?? "✦", skillIds: [], mcpIds: [], mockShopIds: [] };
    setSessions(previous => [fresh, ...previous.filter(session => !isSessionDraft(session)).map(session => session.id === currentSession?.id ? { ...session, draftInput: input } : session)]);
    setCurrentSessionId(fresh.id);
    setInput(carryDraft ? input : "");
    setView("task");
    setMobileNav(false);
    setSessionMessage("");
  };
  const selectChatAgent = async (agent: AgentProfile) => {
    if (!currentSession || (currentSession.agentId ?? "main") === agent.id) return;
    if (currentSession.messages.some(message => message.role === "user")) { await startAgentChat(agent, true); return; }
    if (isSessionDraft(currentSession)) {
      updateSession(currentSession.id, session => ({ ...session, agentId: agent.id, agentName: agent.name, agentAvatar: agent.config.avatar ?? "✦", skillIds: [], mcpIds: [], mockShopIds: [] }));
      return;
    }
    if (agentChatBusyRef.current) return;
    agentChatBusyRef.current = true;
    const epoch = accountEpochRef.current;
    try {
      await consoleApi(authToken, `sessions/${currentSession.id}/agent`, "PUT", { agent_id: agent.id });
      if (epoch !== accountEpochRef.current) return;
      updateSession(currentSession.id, session => ({ ...session, persisted: true, agentId: agent.id, agentName: agent.name, agentAvatar: agent.config.avatar ?? "✦", skillIds: [], mcpIds: [], mockShopIds: [] }));
      setSessionMessage("");
    } catch (e) { if (epoch === accountEpochRef.current) setSessionMessage((e as Error).message); }
    finally { agentChatBusyRef.current = false; }
  };

  const appendEvent = (sessionId: string, event: Omit<StreamEvent, "id" | "ts">) => {
    updateSession(sessionId, (session) => ({
      ...session,
      events: [
        ...session.events,
        {
          ...event,
          id: createId("event"),
          ts: nowLabel(),
        },
      ].slice(-18),
      updatedAt: new Date().toISOString(),
    }));
  };

  const appendAssistantText = (sessionId: string, messageId: string, text: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: `${message.content}${text}`,
              parts: appendTextPart(message.parts ?? [], text),
            }
          : message,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const submitAuth = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setAuthMessage("");

    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: authUsername.trim(),
        password: authPassword,
      }),
    });
    const payload = (await response.json()) as AuthResponse;

    if (!response.ok || !("user" in payload)) {
      setAuthMessage(payload.detail ?? "登录失败。");
      return;
    }

    setSessionsHydrated(false);
    setSessions(seedSessions());
    accountEpochRef.current++;
    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    window.localStorage.setItem(authStorageKey, JSON.stringify(payload));
    toast.success(authMode === "login" ? "登录成功。" : "注册成功。");
    setShowAuthModal(false);
    setAuthPassword("");
    setAuthMessage("");
    await loadModelSettings(payload.token);
    await hydrateBackendSessions(payload.token);
  };

  const logout = () => {
    streamAbortRef.current?.abort();
    accountEpochRef.current++;
    setSessionsHydrated(false);
    window.localStorage.removeItem(authStorageKey);
    setAuthToken("");
    setCurrentUser(null);
    setModelSettings([]);
    setSelectedModelId("");
    setView("task");
    hydrateLocalSessions();
    toast.success("已退出登录。");
  };

  const saveModelSetting = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setModelMessage("");

    if (!authToken) {
      setModelMessage("请先登录。");
      setShowAuthModal(true);
      return;
    }

    const response = await fetch("/api/models", {
      method: editingModelId ? "PUT" : "POST",
      headers: {
        "content-type": "application/json",
        ...authorizationHeaders(),
      },
      body: JSON.stringify({ ...modelForm, id: editingModelId || undefined }),
    });
    const payload = (await response.json()) as ModelsResponse;

    if (!response.ok || !("models" in payload)) {
      setModelMessage(payload.detail ?? "保存模型设置失败。");
      return;
    }

    setModelSettings(payload.models);
    setSelectedModelId(
      payload.models.find((model) => model.isDefault)?.id ?? payload.models[0]?.id ?? "",
    );
    setModelForm(emptyModelForm());
    setEditingModelId("");
    setModelMessage(editingModelId ? "模型设置已更新。" : "模型设置已保存。");
  };

  const changeProvider = (provider: SupportedProvider) => {
    setModelForm(emptyModelForm(provider));
    setEditingModelId("");
    setModelMessage("");
  };

  const editModelSetting = (model: ModelSetting) => {
    setEditingModelId(model.id);
    setModelForm({
      provider: model.provider,
      displayName: model.displayName,
      modelName: model.modelName,
      endpoint: model.endpoint,
      apiKey: "",
      makeDefault: model.isDefault,
    });
    setModelMessage("编辑时 API Key 留空会保留原密钥。");
  };

  const cancelModelEdit = () => {
    setEditingModelId("");
    setModelForm(emptyModelForm());
    setModelMessage("");
  };

  const deleteModelSetting = async (model: ModelSetting) => {
    if (!authToken) return;
    if (!window.confirm(`确定删除模型配置「${model.displayName || model.modelName}」吗？`)) return;

    const response = await fetch("/api/models", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...authorizationHeaders(),
      },
      body: JSON.stringify({ id: model.id }),
    });
    const payload = (await response.json()) as ModelsResponse;
    if (!response.ok || !("models" in payload)) {
      setModelMessage(payload.detail ?? "删除模型设置失败。");
      return;
    }

    setModelSettings(payload.models);
    setSelectedModelId(payload.models.find((item) => item.isDefault)?.id ?? payload.models[0]?.id ?? "");
    setModelTestStates((previous) => {
      const next = { ...previous };
      delete next[model.id];
      return next;
    });
    if (editingModelId === model.id) cancelModelEdit();
    setModelMessage("模型配置已删除。");
  };

  const testModelSetting = async (model: ModelSetting) => {
    toast.loading("正在测试模型连接…", `model-test-${model.id}`);
    setModelTestStates((previous) => ({
      ...previous,
      [model.id]: { status: "testing", message: "正在通过 AgentScope 发起真实请求…" },
    }));

    try {
      const response = await fetch("/api/models/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authorizationHeaders(),
        },
        body: JSON.stringify({ id: model.id }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        latencyMs?: number;
        detail?: string;
      };
      if (response.ok && payload.ok) toast.success(`连接成功 · ${payload.latencyMs ?? 0} ms`, `model-test-${model.id}`);
      else toast.error(payload.detail ?? "连接测试失败。", `model-test-${model.id}`);
      setModelTestStates((previous) => ({
        ...previous,
        [model.id]: response.ok && payload.ok
          ? { status: "success", message: `连接成功 · ${payload.latencyMs ?? 0} ms` }
          : { status: "error", message: payload.detail ?? "连接测试失败。" },
      }));
    } catch {
      toast.error("无法连接 AgentScope service。", `model-test-${model.id}`);
      setModelTestStates((previous) => ({
        ...previous,
        [model.id]: { status: "error", message: "无法连接 AgentScope service。" },
      }));
    }
  };

  const setDefaultModel = async (modelId: string) => {
    setSelectedModelId(modelId);
    if (!authToken || !modelId) return;

    const response = await fetch("/api/models/default", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authorizationHeaders(),
      },
      body: JSON.stringify({ id: modelId }),
    });
    const payload = (await response.json()) as ModelsResponse;

    if (!response.ok || !("models" in payload)) {
      setModelMessage(payload.detail ?? "设置默认模型失败。");
      return;
    }

    setModelSettings(payload.models);
    setSelectedModelId(modelId);
    setModelMessage("默认模型已更新。");
  };

  const streamAgent = async (
    sessionId: string,
    userText: string,
    assistantMessageId: string,
    approval?: { id: string; approved: boolean },
    fileContext?: { files: StudioFile[]; references: string[] },
  ) => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    // This function is invoked by send/approval handlers, never during render.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    streamAbortRef.current = controller;

    updateSession(sessionId, (session) => ({
      ...session,
      status: "streaming",
      pendingApproval: undefined,
      messages: session.messages.map((message) =>
        message.id === assistantMessageId ? { ...message, status: "streaming", activity: approval && message.activity ? { ...message.activity, status: "running", sampledAt: startedAt } : { id: assistantMessageId, startedAt, sampledAt: startedAt, elapsedMs: 0, status: "running" }, parts: message.parts?.map(part => part.type === "tool-call" && part.approval && approval ? { ...part, approval: { ...part.approval, approved: approval.approved } } : part) } : message,
      ),
    }));

    let interrupted: "cancelled" | "error" | "incomplete" = "incomplete";
    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: userText,
          authToken,
          modelId: selectedModel?.id,
          approval,
          agentId: approval || sessionId.startsWith("run-") || sessionId.startsWith("channel-") ? undefined : sessions.find(session => session.id === sessionId)?.agentId ?? "main",
          fileIds: approval ? undefined : fileContext?.files.map(file => file.id),
          fileRefIds: approval ? undefined : fileContext?.references,
          skillIds: approval || sessionId.startsWith("run-") || sessionId.startsWith("channel-") ? undefined : sessions.find(session => session.id === sessionId)?.skillIds ?? [],
          mcpIds: approval || sessionId.startsWith("run-") || sessionId.startsWith("channel-") ? undefined : sessions.find(session => session.id === sessionId)?.mcpIds ?? [],
          model: selectedModel
            ? {
                id: selectedModel.id,
                provider: selectedModel.provider,
                name: selectedModel.modelName,
                endpoint: selectedModel.endpoint,
              }
            : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(payload.detail ?? `请求失败（HTTP ${response.status}）`);
      }
      if (!response.body) {
        throw new Error("No stream body returned.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        frames.forEach((frame) => {
          const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
          const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
          if (!eventLine || !dataLine) return;

          const eventName = eventLine.replace("event:", "").trim();
          const payload = JSON.parse(dataLine.replace("data:", "").trim()) as ServerEvent;

          if (payload.type === "run_activity") {
            updateSession(sessionId, session => ({ ...session, messages: session.messages.map(message => message.id === assistantMessageId ? { ...message, activity: { ...payload.activity, sampledAt: Date.now() } } : message) }));
            return;
          }
          if (payload.type === "token_usage") {
            updateSession(sessionId, session => ({ ...session, messages: session.messages.map(message => message.id === assistantMessageId ? { ...message, tokenUsage: payload.usage } : message) }));
            return;
          }
          if (payload.type === "files_updated") {
            updateSession(sessionId, session => ({ ...session, messages: session.messages.map(message => message.id === assistantMessageId ? { ...message, files: payload.files } : message) }));
            return;
          }
          if (payload.type === "message_parts") {
            updateSession(sessionId, session => ({ ...session, messages: session.messages.map(message => message.id === assistantMessageId ? { ...message, parts: payload.parts } : message) }));
            return;
          }

          if (eventName === "token" && payload.type === "token") {
            appendAssistantText(sessionId, assistantMessageId, payload.text);
            return;
          }

          if (eventName === "approval_required" && payload.type === "approval_required") {
            appendEvent(sessionId, {
              type: "approval",
              title: payload.title,
              detail: payload.detail,
              level: "warning",
            });
            updateSession(sessionId, (session) => ({
              ...session,
              status: "waiting_approval",
              pendingApproval: payload.approval,
              messages: session.messages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, status: "waiting_approval" }
                  : message,
              ),
            }));
            return;
          }

          if (eventName === "done" && payload.type === "done") {
            if (!approval && payload.level !== "warning") updateSession(sessionId, session => ({ ...session, skillIds: [], mcpIds: [], mockShopIds: [] }));
            if (payload.level === "warning") setSessionMessage(payload.detail);
            appendEvent(sessionId, {
              type: "done",
              title: payload.title,
              detail: payload.detail,
              level: payload.level ?? "success",
            });
            updateSession(sessionId, (session) => ({
              ...session,
              status: "ready",
              messages: session.messages.map((message) =>
                message.id === assistantMessageId ? { ...message, status: "ready" } : message,
              ),
            }));
            return;
          }

          if ("title" in payload && "detail" in payload) {
            appendEvent(sessionId, {
              type: payload.type as StreamEvent["type"],
              title: payload.title,
              detail: payload.detail,
              level: "level" in payload ? payload.level : undefined,
            });
          }
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        interrupted = "cancelled";
        updateSession(sessionId, session => ({ ...session, status: "ready", messages: session.messages.map(message => message.id === assistantMessageId ? { ...message, status: "ready" } : message) }));
        return;
      }
      interrupted = "error";
      setSessionMessage("流式连接中断，已保留当前会话状态，可重新发送或继续。");
      appendEvent(sessionId, {
        type: "state",
        title: "Stream interrupted",
        detail: "流式连接中断，已保留当前会话状态，可重新发送或继续。",
        level: "warning",
      });
      updateSession(sessionId, (session) => ({ ...session, status: "ready" }));
    } finally {
      updateSession(sessionId, session => ({ ...session,
        status: session.status === "streaming" ? "ready" : session.status,
        messages: session.messages.map(message => message.id === assistantMessageId && (message.status === "streaming" || message.activity?.status === "running") ? { ...message, status: "ready", activity: message.activity?.status === "running" ? settleRun(message.activity, interrupted) : message.activity } : message),
      }));
      updateSession(sessionId, session => ({ ...session, messages: session.messages.map(message => message.id === assistantMessageId && message.tokenUsage?.status === "running" ? { ...message, tokenUsage: { ...message.tokenUsage, status: "incomplete" } } : message) }));
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
    }
  };

  const sendMessage = async (event?: FormEvent<HTMLFormElement>, textOverride?: string, files: StudioFile[] = [], references: string[] = []) => {
    event?.preventDefault();
    if (!currentSession || (!(textOverride ?? input).trim() && !files.length) || currentSession.status !== "ready") return;
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    if (!selectedModel) {
      setSettingsTab("models");
      setView("settings");
      setModelMessage("先保存一条模型配置，再开始 Agent 对话。");
      return;
    }

    let resources: { id: string; kind: string; name: string }[] = [];
    if (currentSession.skillIds?.length || currentSession.mcpIds?.length) {
      try {
        const options = await consoleApi<Record<string, { id: string; name: string }[]>>(authToken, `chat-resource-options?agent_id=${encodeURIComponent(currentSession.agentId ?? "main")}&session_id=${encodeURIComponent(currentSession.id)}`);
        resources = ([ ["skill_ids", "skill", currentSession.skillIds], ["mcp_ids", "mcp", currentSession.mcpIds] ] as const).flatMap(([key, kind, ids]) => (ids ?? []).map(id => ({ id, kind, name: options[key]?.find(item => item.id === id)?.name ?? t("资源不可用") })));
      } catch { setSessionMessage("资源加载失败，请重试。"); return; }
    }
    const userText = (textOverride ?? input).trim() || "请处理所附文件。";
    const assistantMessageId = createId("msg");
    setInput("");

    updateSession(currentSession.id, (session) => ({
      ...session,
      title: !session.customTitle && session.messages.length <= 1 ? userText.slice(0, 20) : session.title,
      messages: [
        ...session.messages,
        { id: createId("msg"), role: "user", content: userText, files, resources, createdAt: new Date().toISOString() },
        { id: assistantMessageId, role: "assistant", content: "", status: "streaming", createdAt: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    }));

    await streamAgent(currentSession.id, userText, assistantMessageId, undefined, { files, references });
  };

  const continueWithApproval = async (approved: boolean) => {
    if (!currentSession?.pendingApproval) return;
    const lastAssistant = [...currentSession.messages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistant) return;

    await streamAgent(
      currentSession.id,
      currentSession.messages.filter((message) => message.role === "user").at(-1)?.content ?? "",
      lastAssistant.id,
      {
        id: currentSession.pendingApproval.id,
        approved,
      },
    );
  };

  const primaryNavItems: Array<{
    key: NavView;
    label: string;
    icon: typeof DiamondPlus;
    create?: boolean;
  }> = [
    { key: "task", label: "新建任务", icon: DiamondPlus, create: true },
    { key: "overview", label: "工作台概览", icon: FolderOpen },
    { key: "plugins", label: "能力市场", icon: Blocks },
    { key: "schedule", label: "自动化", icon: AlarmClock },
    { key: "knowledge", label: "知识库", icon: Database },
  ];

  return (
    <main className={`shell figmaShell ${mobileNav ? "navOpen" : ""}`}>
      {mobileNav && <button className="navBackdrop" aria-label={t("关闭导航")} onClick={() => setMobileNav(false)} />}
      <aside className="sidebar figmaSidebar" aria-label={t("XIXI Agent Studio 导航")}>
        <div className="brand"><div className="brandMark"><Image src="/xixi-agent-logo.png" alt="XIXI Agent Studio Logo" width={36} height={36} unoptimized /></div><div><h1>XIXI Agent Studio</h1><span>PERSONAL AGENT WORKSPACE</span></div></div>

        <p className="navGroupLabel">{t("工作空间")}</p>

        <nav className="primaryNav">
          {primaryNavItems.map((item, index) => {
            const Icon = item.icon;

            if (item.key === "plugins") return <CapabilityNav key={item.key}
              active={view === "plugins"} value={capabilityTab}
              onNavigate={tab => { if (tab) setCapabilityTab(tab); setView("plugins"); setMobileNav(false); }} />;

            return (
              <button
                key={`${item.label}-${index}`}
                className={
                  item.key === view
                    ? "navItem active"
                    : "navItem"
                }
                onClick={() => { if (item.create) createTask(); else setView(item.key); setMobileNav(false); }}
              >
                <span className="navIcon">
                  <Icon />
                </span>
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <section className="sessionPane"><div className="paneTitle"><span>{t("最近会话")}</span><button aria-label={t("刷新会话")} onClick={() => void hydrateBackendSessions()}>↻</button></div>
          <input className="sessionSearch" aria-label={t("搜索会话")} placeholder={t("搜索会话…")} value={sessionSearch} onChange={event => setSessionSearch(event.target.value)} />
          <div className="sessionList">{filteredSessions.map(session => <div key={session.id} className={`sessionItem ${session.id === selectedSessionId && view === "task" ? "selected" : ""}`}>
            <button className="sessionOpen" title={session.title} onClick={() => { if (currentSession) updateSession(currentSession.id, item => ({ ...item, draftInput: input })); setCurrentSessionId(session.id); setInput(session.draftInput ?? ""); setView("task"); setMobileNav(false); }}>{session.pinned ? <Pin size={12} className="sessionPin" aria-label={t("已置顶")} /> : <span className="sessionDot" />}<strong>{session.title}</strong>{session.status !== "ready" && <em>{session.status === "waiting_approval" ? t("待确认") : t("运行中")}</em>}</button>
            <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="sessionMenuTrigger" aria-label={`${t("管理会话")}：${session.title}`} disabled={sessionBusyId === session.id}><MoreHorizontal size={16} /></button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" className="xixiDropdownPopup" align="start" side="right" sideOffset={8}>
              <DropdownMenuItem onSelect={() => void toggleSessionPin(session)} disabled={!!sessionBusyId}>{session.pinned ? <PinOff /> : <Pin />}{t(session.pinned ? "取消置顶" : "置顶会话")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => prepareSessionAction(session, "rename")} disabled={session.status !== "ready" || !!sessionBusyId}><Pencil />{t("重命名会话")}</DropdownMenuItem>
              <DropdownMenuItem className="sessionDeleteItem" onSelect={() => prepareSessionAction(session, "delete")} disabled={session.status !== "ready" || !!sessionBusyId}><Trash2 />{t("删除会话")}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>)}</div>
        </section>


        <button
          className={view === "settings" ? "profile active" : "profile"}
          onClick={() => {
            if (!currentUser) {
              setShowAuthModal(true);
              return;
            }
            setSettingsTab("profile");
            setView("settings");
          }}
        >
          <span className="navIcon">
            <SquareUser />
          </span>
          <strong>{currentUser ? currentUser.username : t("登录你的工作空间")}</strong>
          <span className={t(`serviceBadge profileService ${serviceStatus === "服务在线" ? "online" : ""}`)}><i />{t(serviceStatus)}</span>
        </button>
      </aside>

      <section className="workspace figmaWorkspace">
        <button className="mobileMenu scheduleMobileNav" aria-label={t("展开导航")} onClick={() => setMobileNav(true)}>☰</button>

        {view === "task" && currentSession && <div className="chatHeading"><span>{(currentSession.messages.length || currentSession.customTitle) ? currentSession.title : t("新对话")}</span>{!isSessionDraft(currentSession) && <div><button className="textButton" disabled={currentSession.status !== "ready"} onClick={() => prepareSessionAction(currentSession, "rename")}>{t("重命名")}</button><button className="textButton" onClick={() => downloadFile(`${currentSession.title}.md`, currentSession.messages.map(message => t(`## ${message.role === "user" ? t("你") : "Agent"}\n\n${message.content}`)).join("\n\n"))}>{t("导出")}</button><button className="textButton danger" disabled={currentSession.status !== "ready"} onClick={() => prepareSessionAction(currentSession, "delete")}>{t("删除")}</button></div>}</div>}
        {view === "task" && currentSession && (
          <AssistantConversation accountId={currentUser?.id ?? "guest"} token={authToken} sessionId={currentSession.id} key={currentSession.id} messages={currentSession.messages} status={currentSession.status} input={input} onInputChange={setInput} onSend={(text, files, references) => sendMessage(undefined, text, files, references)} onCancel={stopRun} onApproval={continueWithApproval}
            agentControl={<AgentPicker key={`${currentSession.id}:${currentUser?.id}`} token={authToken} id={currentSession.agentId ?? "main"} name={currentSession.agentName} avatar={currentSession.agentAvatar} disabled={currentSession.status !== "ready" || currentSession.id.startsWith("run-") || currentSession.id.startsWith("channel-")} hasHistory={currentSession.messages.some(message => message.role === "user")} onSelect={selectChatAgent} onManage={() => { setCapabilityTab("agent"); setView("plugins"); }} />}
            welcome={<div className="heroCopy"><div className="heroMark"><Image src="/xixi-agent-logo.png" alt="XIXI Agent Studio" width={76} height={76} unoptimized /></div><p className="eyebrow">YOUR PERSONAL AGENT</p><h2>{t("你好，")}{currentUser?.username ?? "欢迎来到 XIXI"}</h2><p>{t("把想法交给我，一起让它发生。")}</p><div className="quickPrompts">{[t("帮我梳理这个项目的下一步计划"), t("检索知识库，整理重点信息"), t("根据我的记忆与偏好制定工作方案")].map(prompt => <button key={prompt} onClick={() => setInput(prompt)}><Sparkles /><span>{prompt}</span><b>↗</b></button>)}</div></div>}
            tags={<ChatSkillPicker key={`tags-${currentSession.id}-${currentUser?.id}-${currentSession.agentId}`} token={authToken} agentId={currentSession.agentId ?? "main"} sessionId={currentSession.id} shopValue={currentSession.mockShopIds ?? []} onShopChange={ids => updateSession(currentSession.id, session => ({ ...session, mockShopIds: ids }))} mcpValue={currentSession.mcpIds ?? []} onMcpChange={ids => updateSession(currentSession.id, session => ({ ...session, mcpIds: ids }))} onManageMcps={() => { setCapabilityTab("mcp"); setView("plugins"); }} value={currentSession.skillIds ?? []} onChange={ids => updateSession(currentSession.id, session => ({ ...session, skillIds: ids }))} onManage={() => { setCapabilityTab("skill"); setView("plugins"); }} disabled={currentSession.status !== "ready" || currentSession.id.startsWith("run-") || currentSession.id.startsWith("channel-")} tagsOnly />}
            leftTools={<><ChatSkillPicker key={`picker-${currentSession.id}-${currentUser?.id}-${currentSession.agentId}`} onUpload={() => document.getElementById("chat-file-upload")?.click()} onUploadFolder={() => document.getElementById("chat-folder-upload")?.click()} onWorkflows={() => { setCapabilityTab("workflow"); setView("plugins"); }} token={authToken} agentId={currentSession.agentId ?? "main"} sessionId={currentSession.id} shopValue={currentSession.mockShopIds ?? []} onShopChange={ids => updateSession(currentSession.id, session => ({ ...session, mockShopIds: ids }))} mcpValue={currentSession.mcpIds ?? []} onMcpChange={ids => updateSession(currentSession.id, session => ({ ...session, mcpIds: ids }))} onManageMcps={() => { setCapabilityTab("mcp"); setView("plugins"); }} value={currentSession.skillIds ?? []} onChange={ids => updateSession(currentSession.id, session => ({ ...session, skillIds: ids }))} onManage={() => { setCapabilityTab("skill"); setView("plugins"); }} disabled={currentSession.status !== "ready" || currentSession.id.startsWith("run-") || currentSession.id.startsWith("channel-")} />
                    <button className="pillButton" type="button" onClick={() => setView("overview")}>
                      <FolderOpen />
                      {t("工作空间")}<ChevronDown />
                    </button></>}
            rightTools={<label className="modelSelect">
                      <Box />
                      <ModelPicker
                        value={selectedModel?.id ?? ""}
                        onValueChange={value => void setDefaultModel(value)}
                        disabled={!currentUser || modelSettings.length === 0 || currentSession.status !== "ready"}
                        aria-label={t("选择默认模型")}
                        placeholder={selectedModel ? selectedModelLabel : t(selectedModelLabel)}
                        models={modelSettings.map(model => ({ id: model.id, name: model.displayName || model.modelName, description: t(`${model.modelName}${model.isDefault ? t(" · 默认模型") : ""}`), keywords: [model.modelName, model.provider] }))}
                      />
                    </label>}
          />
        )}

        <div className="scheduleView" hidden={view !== "schedule"}>{<ScheduleConsole key={authToken} userId={currentUser?.id ?? "anonymous"} token={authToken} onLogin={() => setShowAuthModal(true)} onOpenSession={id => void openSession(id)} onModels={() => { setSettingsTab("models"); setView("settings"); }} onManageResources={tab => { setCapabilityTab(tab); setView("plugins"); }} />}</div>
        {view === "knowledge" && <KnowledgeConsole key={authToken} token={authToken} onLogin={() => setShowAuthModal(true)} />}
        {view !== "task" && view !== "settings" && view !== "schedule" && view !== "knowledge" && <StudioConsole view={view} onStartAgentChat={agent => startAgentChat(agent)} capabilityTab={capabilityTab} onCapabilityTabChange={setCapabilityTab} token={authToken} onLogin={() => setShowAuthModal(true)} onOpenSession={id => void openSession(id)} />}

        {view === "settings" && (
          <section className="settingsShell">
            <aside className="settingsSidebar" aria-label={t("个人设置导航")}>
              <button
                className={settingsTab === "profile" ? "settingsNavItem active" : "settingsNavItem"}
                onClick={() => setSettingsTab("profile")}
              >
                {t("个人中心")}</button>
              <button
                className={settingsTab === "models" ? "settingsNavItem active" : "settingsNavItem"}
                onClick={() => setSettingsTab("models")}
              >
                {t("模型设置")}</button>
              <button className={settingsTab === "channels" ? "settingsNavItem active" : "settingsNavItem"} onClick={() => setSettingsTab("channels")}>{t("远程助理")}</button>
              <button className={settingsTab === "memory" ? "settingsNavItem active" : "settingsNavItem"} onClick={() => setSettingsTab("memory")}>{t("记忆文件")}</button>
              <button className={settingsTab === "appearance" ? "settingsNavItem active" : "settingsNavItem"} onClick={() => setSettingsTab("appearance")}>{t("外观")}</button>
              <button className={settingsTab === "about" ? "settingsNavItem active" : "settingsNavItem"} onClick={() => setSettingsTab("about")}>{t("关于")}</button>
            </aside>

            {settingsTab === "memory" && <StudioConsole view="memory" capabilityTab={capabilityTab} onCapabilityTabChange={setCapabilityTab} token={authToken} onLogin={() => setShowAuthModal(true)} onOpenSession={id => void openSession(id)} />}
            {settingsTab === "appearance" && <AppearanceSettings />}
            {settingsTab === "about" && <AboutSettings />}
            {settingsTab === "channels" && <ChannelSettings key={authToken} token={authToken} onLogin={() => setShowAuthModal(true)} onModels={() => setSettingsTab("models")} onOpenSession={id => void openSession(id)} />}

            {settingsTab === "profile" && (
              <section className="contentPanel settingsContent">
                <p className="eyebrow">Account</p>
                <h3>{t("个人中心")}</h3>
                {currentUser ? (
                  <div className="profileSummary">
                    <span>{t("当前用户")}</span>
                    <strong>{currentUser.username}</strong>
                    <p>{t("登录态保存在当前浏览器；用户和 token 写入本地 AgentScope SQLite。")}</p>
                    <button type="button" onClick={logout}>
                      {t("退出登录")}</button>
                  </div>
                ) : (
                  <div className="profileSummary">
                    <span>{t("未登录")}</span>
                    <p>{t("点击左下角「请先登录」或下方按钮打开登录/注册弹窗。")}</p>
                    <button type="button" onClick={() => setShowAuthModal(true)}>
                      {t("登录 / 注册")}</button>
                  </div>
                )}
              </section>
            )}

            {settingsTab === "models" && (
              <section className="settingsContentGrid">
                <form className="contentPanel authPanel" onSubmit={saveModelSetting}>
                  <p className="eyebrow">Model access</p>
                  <h3>{editingModelId ? t("编辑模型接入") : t("新增模型接入")}</h3>
                  {!currentUser && <p className="formHint warning">{t("请先登录后再保存模型设置。")}</p>}
                  <label>
                    Provider
                    <SelectField
                      aria-label={t("模型提供方")}
                      value={modelForm.provider}
                      onValueChange={value => changeProvider(value as SupportedProvider)}
                      options={providerOptions.map(provider => ({ value: provider.value, label: t(provider.label) }))}
                    />
                  </label>
                  <p className="providerHint">{t(selectedProviderOption.hint)}{modelForm.provider === "deepseek" && <> <a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noreferrer">{t("DeepSeek 官方文档")} ↗</a></>}</p>
                  <label>
                    {t("配置名称")}<input
                      value={modelForm.displayName}
                      onChange={(event) =>
                        setModelForm((previous) => ({ ...previous, displayName: event.target.value }))
                      }
                      placeholder={modelForm.provider === "deepseek" ? t("例如：我的 DeepSeek 模型") : t("例如：我的 Kimi 主力模型")}
                    />
                  </label>
                  {modelForm.provider === "deepseek" && <label>{t("DeepSeek 模型")}<SelectField aria-label={t("DeepSeek 模型")} value={["deepseek-flash", "deepseek-v4-pro"].includes(modelForm.modelName) ? modelForm.modelName : "custom"} onValueChange={value => setModelForm(previous => ({ ...previous, modelName: value === "custom" ? "" : value }))} options={[{ value: "deepseek-flash", label: "DeepSeek Flash · deepseek-flash" }, { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro · deepseek-v4-pro" }, { value: "custom", label: t("自定义模型名称") }]} /></label>}
                  {(modelForm.provider !== "deepseek" || !["deepseek-flash", "deepseek-v4-pro"].includes(modelForm.modelName)) && <label>
                    Model
                    <input
                      value={modelForm.modelName}
                      onChange={(event) =>
                        setModelForm((previous) => ({ ...previous, modelName: event.target.value }))
                      }
                      placeholder={selectedProviderOption.defaultModel || "填写模型名称或 Endpoint ID"}
                    />
                  </label>}
                  <label>
                    Endpoint
                    <input
                      value={modelForm.endpoint}
                      onChange={(event) =>
                        setModelForm((previous) => ({ ...previous, endpoint: event.target.value }))
                      }
                      placeholder={selectedProviderOption.endpointPlaceholder || selectedProviderOption.defaultEndpoint}
                    />
                  </label>
                  <label>
                    API Key {selectedProviderOption.apiKeyOptional ? t("（可选）") : ""}
                    <input
                      type="password"
                      value={modelForm.apiKey}
                      onChange={(event) =>
                        setModelForm((previous) => ({ ...previous, apiKey: event.target.value }))
                      }
                      placeholder={editingModelId ? t("留空保留原密钥") : t("保存到本地 AgentScope SQLite")}
                    />
                  </label>
                  <label className="checkboxLine">
                    <input
                      type="checkbox"
                      checked={modelForm.makeDefault}
                      onChange={(event) =>
                        setModelForm((previous) => ({ ...previous, makeDefault: event.target.checked }))
                      }
                    />
                    {t("设为默认模型")}</label>

                  <div className="formActions">
                    <button type="submit" disabled={!currentUser}>
                      {editingModelId ? t("保存修改") : t("保存为新配置")}
                    </button>
                    {editingModelId && (
                      <button className="ghost" type="button" onClick={cancelModelEdit}>
                        {t("取消编辑")}</button>
                    )}
                  </div>
                </form>

                <section className="contentPanel modelListPanel">
                  <div className="panelHeader">
                    <div>
                      <p className="eyebrow">Saved models</p>
                      <h3>{t("已保存模型")}</h3>
                    </div>
                  </div>
                  <div className="modelList">
                    {modelSettings.length === 0 && (
                      <div className="emptyState">
                        <strong>{t("暂无模型配置")}</strong>
                        <p>{t("保存第一条模型后，新建任务 chatbox 里的模型下拉框会出现真实选项。")}</p>
                      </div>
                    )}
                    {modelSettings.map((model) => (
                      <article key={model.id} className="modelCard">
                        <div>
                          <strong>{model.displayName || model.modelName}</strong>
                          <span>
                            {model.provider} · {model.modelName}
                          </span>
                          <em>{model.endpoint || "默认 endpoint"} · {model.apiKeyPreview}</em>
                        </div>
                        <div className="modelCardActions">

                          <div>
                            <button type="button" onClick={() => void testModelSetting(model)}>
                              {modelTestStates[model.id]?.status === "testing" ? t("测试中") : t("测试连接")}
                            </button>
                            <button type="button" onClick={() => editModelSetting(model)}>{t("编辑")}</button>
                            <button type="button" onClick={() => void deleteModelSetting(model)}>{t("删除")}</button>
                            <button
                              type="button"
                              className={model.isDefault ? "modelDefault active" : "modelDefault"}
                              onClick={() => void setDefaultModel(model.id)}
                            >
                              {model.isDefault ? t("默认") : t("设为默认")}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            )}
          </section>
        )}
      </section>

      {sessionAction && actionSession && <div className="modalBackdrop"><form className="authModal" onSubmit={event => { event.preventDefault(); void editSession(); }}><div className="modalHeader"><h3>{sessionAction.kind === "rename" ? t("重命名会话") : t("删除会话")}</h3><button type="button" className="closeButton" disabled={!!sessionBusyId} onClick={() => setSessionAction(null)}>×</button></div>{sessionAction.kind === "rename" ? <label>{t("会话标题")}<input required maxLength={100} autoFocus value={renameTitle} onChange={event => setRenameTitle(event.target.value)} /></label> : <p><strong>{actionSession.title}</strong><br />{t("会话及消息将永久删除。你可以先导出一份副本。")}</p>}<button type="submit" disabled={!!sessionBusyId}>{sessionAction.kind === "rename" ? t("保存标题") : t("确认删除")}</button><button type="button" className="linkButton" disabled={!!sessionBusyId} onClick={() => setSessionAction(null)}>{t("取消")}</button></form></div>}
      {showAuthModal && (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setShowAuthModal(false)}>
          <form className="authModal" onSubmit={submitAuth} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Account</p>
                <h3>{authMode === "login" ? t("登录") : t("注册")}</h3>
              </div>
              <button type="button" className="closeButton" onClick={() => setShowAuthModal(false)}>
                ×
              </button>
            </div>
            <label>
              {t("用户名")}<input
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder={t("至少 4 位英文/数字")}
                autoFocus
              />
            </label>
            <label>
              {t("密码")}<input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder={t("至少 6 位")}
              />
            </label>

            <button type="submit">{authMode === "login" ? t("登录") : t("注册并登录")}</button>
            <button
              type="button"
              className="linkButton"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthMessage("");
              }}
            >
              {authMode === "login" ? t("没有账号？去注册") : t("已有账号？去登录")}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
