"use client";

import { ConversationMapAui } from "@/components/assistant-ui/elements/conversation-map.aui";
import { useToast } from "@/components/OperationFeedback";
/* eslint-disable react-hooks/refs -- The file controller passes the textarea ref through context; only handlers and effects dereference it. */

import { useEffect, useState, type ReactNode } from "react";
import { RunActivity, type RunActivityEntry, type RunActivityStatus } from "@/components/assistant-ui/elements/run-activity";
import { elapsedRunMs, type RunTiming } from "./run-activity";
import type { TokenUsage } from "./token-usage";
import { usePreferences } from "@/components/PreferencesProvider";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  ActionBarMorePrimitive,
  useExternalStoreRuntime,
  useAuiState,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
  type ReasoningMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { defaultUrlTransform } from "react-markdown";
import { useFiles } from "./file-context";
import {
  FileProvider,
  FilePanel,
  MessageFiles,
  ComposerFiles,
  useFileController,
} from "./FileWorkspace";
import { fileJson, type StudioFile } from "./file-api";
const fileRequestForSend = (token: string, id: string) => fileJson(token, id);
import {
  Brain,
  ChevronDown,
  Copy,
  MoreHorizontal,
  ArrowUp,
  Square,
  Wrench,
  Download,
  Check,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";

export type ConversationPart = Exclude<
  ThreadMessageLike["content"],
  string
>[number] & { activityAttention?: boolean };
export type ConversationMessage = {
  activity?: RunTiming | null;
  tokenUsage?: TokenUsage | null;
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: ConversationPart[];
  createdAt?: string;
  status?: "ready" | "streaming" | "waiting_approval";
  files?: StudioFile[];
  resources?: { id: string; kind: string; name: string }[];
};

function Markdown() {
  const workspace = useFiles();
  return (
    <MarkdownTextPrimitive
      className="aui-markdown"
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        /^studio-file:[a-f0-9]{32}$/.test(url) ? url : defaultUrlTransform(url)
      }
      components={{
        a: ({ href, children }) => {
          const id = /^studio-file:([a-f0-9]{32})$/.exec(href || "")?.[1];
          return id ? (
            <button
              type="button"
              className="studio-inline-reference"
              onClick={() => {
                void fileJson<{ file: StudioFile }>(workspace.token, id)
                  .then((result) => workspace.preview(result.file))
                  .catch(() => workspace.setError("文件暂无法查看。"));
              }}
            >
              {children}
            </button>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        img: ({ src, alt }) =>
          typeof src === "string" ? (
            <a href={src} target="_blank" rel="noopener noreferrer">
              {alt || "图片资源"}
            </a>
          ) : null,
      }}
    />
  );
}
function Reasoning({ timing, status }: ReasoningMessagePartProps) {
  const seconds =
    timing?.startedAt && timing?.completedAt
      ? Math.max(1, Math.round((timing.completedAt - timing.startedAt) / 1000))
      : undefined;
  return (
    <details
      className="aui-reasoning"
      open={status.type === "running" ? true : undefined}
    >
      <summary>
        <Brain size={15} />
        思考过程{seconds ? ` · ${seconds}秒` : ""}
        <ChevronDown size={14} />
      </summary>
      <div>
        <Markdown />
      </div>
    </details>
  );
}
function Tool({
  toolName,
  argsText,
  result,
  isError,
  isPreliminary,
  approval,
  status,
  respondToApproval,
}: ToolCallMessagePartProps) {
  const labels: Record<string, string> = {
    read_skill: "读取技能",
    list_skills: "查看技能列表",
    web_search: "网页搜索",
    web_fetch: "读取网页",
    read_file: "读取文件",
    create_file: "生成文件",
    convert_file: "转换文件",
    package_files: "打包文件",
  };
  const pending =
    approval && approval.approved === undefined && !approval.resolution;
  return (
    <details
      className={`aui-tool ${isError ? "aui-tool-error" : ""}`}
      open={pending ? true : undefined}
    >
      <summary>
        <Wrench size={15} />
        <span>{labels[toolName] || toolName}</span>
        <small>
          {pending
            ? "等待确认"
            : approval?.approved === false
              ? "已拒绝"
              : isError
                ? "执行失败"
                : isPreliminary ||
                    (result === undefined && status.type === "running")
                  ? "执行中"
                  : result !== undefined
                    ? "已完成"
                    : "已结束"}
        </small>
        <ChevronDown size={14} />
      </summary>
      <div>
        {argsText && <pre>{argsText}</pre>}
        {result !== undefined && (
          <pre>
            {typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2)}
          </pre>
        )}
        {pending && (
          <div className="aui-approval">
            <p>{approval.prompt || "是否允许本次工具调用？"}</p>
            <button
              type="button"
              onClick={() => void respondToApproval({ approved: true })}
            >
              确认并继续
            </button>
            <button
              type="button"
              onClick={() => void respondToApproval({ approved: false })}
            >
              拒绝
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
function CopyMessageButton({ label = "复制消息" }: { label?: string }) {
  const toast = useToast();
  const isCopied = useAuiState((s) => s.message.isCopied);
  useEffect(() => { if (isCopied) toast.success("已复制。"); }, [isCopied, toast]);
  return (
    <ActionBarPrimitive.Copy
      className="aui-copy"
      copiedDuration={5000}
      title={isCopied ? "已复制" : "复制"}
      aria-label={isCopied ? `${label}：已复制` : label}
    >
      {isCopied ? <Check size={15} /> : <Copy size={15} />}
    </ActionBarPrimitive.Copy>
  );
}

function Footer() {
  const { t } = usePreferences();
  const usage = useAuiState((s) => s.message.metadata.custom.tokenUsage) as TokenUsage | null | undefined;
  const date = useAuiState((s) => s.message.createdAt);
  return (
    <ActionBarPrimitive.Root className="aui-actions" hideWhenRunning>
      {usage && <span className="aui-token-usage" title={usage.total_tokens === null ? t("模型未返回可用的 Token 用量") : `${t("输入")} ${usage.input_tokens?.toLocaleString("en-US")} · ${t("输出")} ${usage.output_tokens?.toLocaleString("en-US")}`}>
        {t("Token 消耗：")} {usage.total_tokens === null ? t("未返回") : usage.total_tokens.toLocaleString("en-US")}
        {usage.status !== "complete" && <span>（{t(usage.status === "incomplete" ? "统计不完整" : "统计中")}）</span>}
      </span>}
      <CopyMessageButton />
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger title="更多" aria-label="更多消息操作">
          <MoreHorizontal size={17} />
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content className="aui-more" sideOffset={6}>
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item>
              <Download size={14} />
              导出 Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <time dateTime={date.toISOString()}>
        {date.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
    </ActionBarPrimitive.Root>
  );
}
const activityParts = { Text: Markdown, Reasoning, tools: { Fallback: Tool } };
function AssistantActivity() {
  const { t } = usePreferences();
  const parts = useAuiState(s => s.message.parts);
  const messageStatus = useAuiState(s => s.message.status);
  const activity = useAuiState(s => s.message.metadata.custom.activity) as RunTiming | null | undefined;
  const attentionIds = useAuiState(s => s.message.metadata.custom.activityAttentionIds) as string[] | undefined;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activity?.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activity?.status, activity?.id]);
  const status: RunActivityStatus = activity?.status ?? (messageStatus?.type === "running" ? "running" : messageStatus?.type === "requires-action" ? "requires-action" : messageStatus?.type === "incomplete" ? "incomplete" : "complete");
  const entries: RunActivityEntry[] = [];
  const attention: ReactNode[] = [];
  const answers: ReactNode[] = [];
  parts.forEach((part, index) => {
    const id = part.type === "tool-call" ? part.toolCallId : part.type === "reasoning" ? part.id ?? `reasoning-${index}` : `part-${index}`;
    const content = <MessagePrimitive.PartByIndex key={id} index={index} components={activityParts} />;
    if (part.type === "reasoning") {
      entries.push({ id, kind: "commentary", label: t("思考过程"), content });
    } else if (part.type === "tool-call") {
      const needsAttention = attentionIds?.includes(part.toolCallId) || part.approval?.display === "decision" || part.isError || ((status === "incomplete" || status === "cancelled" || status === "error") && part.result === undefined);
      if (needsAttention) attention.push(content);
      else entries.push({ id, kind: "tool", label: `${t("调用工具")} · ${part.toolName}`, content });
    } else {
      answers.push(content);
    }
  });
  if (!activity && !entries.length && !attention.length) return <MessagePrimitive.Parts components={activityParts} />;
  const labels: Record<RunActivityStatus, string> = { running: "正在响应", "requires-action": "等待工具确认", complete: "响应完成", cancelled: "已停止", incomplete: "响应未完成", error: "响应失败" };
  const seconds = activity ? (elapsedRunMs(activity, now) / 1000).toFixed(1) : null;
  return <RunActivity className="aui-run-activity" status={status} statusLabel={t(labels[status])}
    durationLabel={seconds !== null ? <span title={t("本轮响应耗时，不含等待工具确认的时间")}>· {seconds}{t("秒")}</span> : undefined}
    entries={entries} open={open} onOpenChange={setOpen} attention={attention}>
    {answers}
    {(status === "incomplete" || status === "error") && <p className="aui-run-warning" role="status">{t("本轮响应未完整结束，已保留收到的内容。")}</p>}
  </RunActivity>;
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-message aui-assistant">
      <AssistantActivity />
      <MessagePrimitive.Error />
      <MessageResources />
      <MessageFiles />
      <Footer />
    </MessagePrimitive.Root>
  );
}
function MessageResources() {
  const resources = useAuiState(state => state.message.metadata.custom.resources) as { id: string; kind: string; name: string }[] | undefined;
  return resources?.length ? <div className="composerResourceTags messageResourceTags">{resources.map(resource => <span className="composerResourceTag" key={`${resource.kind}-${resource.id}`}>{resource.name}</span>)}</div> : null;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-message aui-user">
      <div className="aui-user-bubble">
        <MessagePrimitive.Parts components={{ Text: Markdown }} />
      </div>
      <MessageResources />
      <MessageFiles />
      <ActionBarPrimitive.Root className="aui-actions aui-user-actions">
        <CopyMessageButton label="复制用户消息" />
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

export function AssistantConversation({
  messages,
  status,
  input,
  onInputChange,
  onSend,
  onCancel,
  onApproval,
  tags,
  leftTools,
  rightTools,
  welcome,
  agentControl,
  token,
  sessionId,
  accountId,
  header,
}: {
  token: string;
  sessionId: string;
  accountId: string;
  messages: ConversationMessage[];
  status: string;
  input: string;
  onInputChange: (text: string) => void;
  onSend: (
    text: string,
    files: StudioFile[],
    references: string[],
  ) => Promise<void>;
  onCancel: () => Promise<void>;
  onApproval: (approved: boolean) => Promise<void>;
  tags: ReactNode;
  leftTools: ReactNode;
  rightTools: ReactNode;
  welcome: ReactNode;
  agentControl?: ReactNode;
  header?: (filePanelToggle: ReactNode) => ReactNode;
}) {
  const { t } = usePreferences();
  const hasConversation = messages.some(message => message.role === "user");
  const workspace = useFileController(
    token,
    sessionId,
    input,
    onInputChange,
    accountId,
  );
  const fileSignature = messages
    .flatMap((message) => message.files || [])
    .map((file) => `${file.id}:${file.version}`)
    .join(",");
  useEffect(() => {
    queueMicrotask(() => void workspace.refresh());
  }, [fileSignature, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const runtime = useExternalStoreRuntime({
    messages,
    adapters: { attachments: workspace.adapter },
    isRunning: status === "streaming",
    convertMessage: (message): ThreadMessageLike => ({
      id: message.id,
      role: message.role,
      metadata: { custom: { studioFiles: message.files || [], resources: message.resources || [], tokenUsage: message.tokenUsage, activity: message.activity, activityAttentionIds: message.parts?.filter(part => part.type === "tool-call" && (part.activityAttention || part.approval?.display === "decision")).map(part => part.type === "tool-call" ? part.toolCallId : "") } },
      content: message.parts?.length ? message.parts : message.content,
      createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
      ...(message.role === "assistant"
        ? {
            status:
              message.status === "streaming"
                ? { type: "running" as const }
                : message.status === "waiting_approval"
                  ? {
                      type: "requires-action" as const,
                      reason: "tool-calls" as const,
                    }
                  : { type: "complete" as const, reason: "stop" as const },
          }
        : {}),
    }),
    onNew: async (message) => {
      if (workspace.references.some((ref) => !ref.available)) {
        workspace.setError("引用的文件已失效，请移除或重新上传。");
        throw new Error("引用的文件已失效");
      }
      const files = (message.attachments || [])
        .map((attachment) => workspace.uploaded.current.get(attachment.id))
        .filter((file): file is StudioFile => !!file);
      const references = workspace.references.map((ref) => ref.id);
      for (const id of [...references, ...files.map((file) => file.id)]) {
        await fileRequestForSend(token, id);
      }
      workspace.setReferences([]);
      workspace.clearUploads();
      await onSend(
        message.content
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n"),
        files,
        references,
      );
    },
    onCancel,
    onRespondToToolApproval: async (response) => {
      await onApproval(response.approved);
    },
  });
  useEffect(() => {
    if (runtime.thread.composer.getState().text !== input)
      runtime.thread.composer.setText(input);
  }, [input, runtime]);
  return (
    <FileProvider value={workspace}>
      <AssistantRuntimeProvider runtime={runtime}>
        {header?.(hasConversation ? <button
          type="button"
          className="iconButton conversationFilesToggle"
          onClick={() => workspace.setOpen(!workspace.open)}
          aria-label={t(workspace.open ? "收起文件侧栏" : "展开文件侧栏")}
          title={t(workspace.open ? "收起文件侧栏" : "展开文件侧栏")}
          aria-expanded={workspace.open}
        >{workspace.open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button> : null)}
        <div className="aui-workspace">
          <ThreadPrimitive.Root className="aui-thread">
            <ThreadPrimitive.Viewport className="aui-viewport">
              <ConversationMapAui side="right" className="aui-conversation-map" />
              <div className="aui-conversation-messages">
              <ThreadPrimitive.Empty>{welcome}</ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{
                  UserMessage,
                  AssistantMessage,
                  SystemMessage: AssistantMessage,
                }}
              />
              </div>
              <ThreadPrimitive.ScrollToBottom
                className="aui-scroll"
                aria-label="滚动到底部"
              >
                <ChevronDown size={18} />
              </ThreadPrimitive.ScrollToBottom>
            </ThreadPrimitive.Viewport>

            <ComposerPrimitive.AttachmentDropzone>
              <ComposerPrimitive.Root className="aui-composer">
                <ComposerPrimitive.TriggerPopoverRoot>
                  <ComposerFiles />
                  {tags}
                  <ComposerPrimitive.Input
                    ref={workspace.composerInput}
                    className="aui-input"
                    value={input}
                    onChange={(event) =>
                      workspace.inputChanged(event.target.value)
                    }
                    placeholder="来，牛马干活了～"
                    aria-label="任务消息"
                    minRows={2}
                    maxRows={8}
                    submitMode="enter"
                    addAttachmentOnPaste
                    disabled={status !== "ready"}
                  />
                  <div className="composerBar">
                    <div className="leftTools">
                      {leftTools}
                      {agentControl && <div className="aui-agent-control">{agentControl}</div>}
                    </div>
                    <div className="rightTools">
                      {rightTools}
                      {status === "streaming" ? (
                        <ComposerPrimitive.Cancel
                          className="aui-send"
                          aria-label="停止回复"
                        >
                          <Square size={16} />
                        </ComposerPrimitive.Cancel>
                      ) : (
                        <ComposerPrimitive.Send
                          className="aui-send"
                          aria-label="发送"
                          disabled={
                            status !== "ready" ||
                            workspace.references.some((ref) => !ref.available)
                          }
                        >
                          <ArrowUp size={20} />
                        </ComposerPrimitive.Send>
                      )}
                    </div>
                  </div>
                </ComposerPrimitive.TriggerPopoverRoot>
              </ComposerPrimitive.Root>
            </ComposerPrimitive.AttachmentDropzone>
          </ThreadPrimitive.Root>
          {hasConversation && <FilePanel />}
        </div>
      </AssistantRuntimeProvider>
    </FileProvider>
  );
}
