"use client";

import { Hint } from "@/components/hero-ui/tooltip";
import { useFeedbackState, useToast } from "@/components/OperationFeedback";
/* eslint-disable @next/next/no-img-element -- Authenticated thumbnails are short-lived blob URLs. */
/* File controls use assistant-ui attachment primitives and its Radix component foundation. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAui,
  useAuiState,
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
} from "@assistant-ui/react";
import { Tabs } from "@/components/hero-ui/tabs";
import { AlertDialog } from "@/components/hero-ui/dialog";
import {
  FileText,
  Download,
  RefreshCw,
  X,
  Files,
  Link2,
  Trash2,
  LoaderCircle,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/hero-ui/dropdown-menu";
import { fileJson, fileRequest, fileSize, type StudioFile } from "./file-api";
import { FilePreview } from "./FilePreview";

type Reference = {
  key: string;
  id: string;
  name: string;
  token: string;
  available: boolean;
};
import { useFiles } from "./file-context";
export { FileProvider } from "./file-context";

export function useFileController(
  token: string,
  sessionId: string,
  input: string,
  onInputChange: (text: string) => void,
  accountId: string,
) {
  const toast = useToast();
  const [files, setFiles] = useState<StudioFile[]>([]);
  const [error, setError] = useFeedbackState("auto");
  const [references, setReferences] = useState<Reference[]>([]);
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<StudioFile[]>([]);
  const [active, setActive] = useState("files");
  const [width, setWidth] = useState(480);
  const [grid, setGrid] = useState(false);
  const [sort, setSort] = useState("updated");
  const [loaded, setLoaded] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<StudioFile | null>(null);
  const uploaded = useRef(new Map<string, StudioFile>());
  const slots = useRef(new Set<string>());
  const [uploadRecords, setUploadRecords] = useState(
    new Map<string, StudioFile>(),
  );
  const controllers = useRef(new Map<string, AbortController>());
  const composerInput = useRef<HTMLTextAreaElement | null>(null);
  const stateKey = `xixi-file-panel:${accountId || "guest"}:${sessionId}`;
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(stateKey) || "null");
        if (saved) {
          setOpen(!!saved.open);
          setTabs(saved.tabs || []);
          setActive(saved.active || "files");
          setWidth(Math.max(320, Math.min(saved.width || 480, 900)));
          setGrid(!!saved.grid);
          setSort(saved.sort || "updated");
        }
      } catch {}
      try {
        const draft = JSON.parse(
          localStorage.getItem(`${stateKey}:draft`) || "null",
        ) as {
          uploads?: [string, StudioFile][];
          references?: Reference[];
          text?: string;
        } | null;
        if (draft) {
          const entries = draft.uploads || [];
          uploaded.current = new Map(entries);
          slots.current = new Set(entries.map(([id]) => id));
          setUploadRecords(new Map(entries));
          setReferences(draft.references || []);
          if (typeof draft.text === "string") onInputChange(draft.text);
        }
      } catch {}
      setLoaded(stateKey);
    });
  }, [stateKey, onInputChange]);
  useEffect(() => {
    if (loaded === stateKey)
      localStorage.setItem(
        stateKey,
        JSON.stringify({ open, tabs, active, width, grid, sort }),
      );
  }, [loaded, stateKey, open, tabs, active, width, grid, sort]);
  useEffect(() => {
    if (loaded === stateKey)
      localStorage.setItem(
        `${stateKey}:draft`,
        JSON.stringify({
          uploads: [...uploadRecords],
          references,
          text: input,
        }),
      );
  }, [loaded, stateKey, uploadRecords, references, input]);
  const refresh = async () => {
    if (!token) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const result = await fileJson<{ files: StudioFile[] }>(
        token,
        `sessions/${encodeURIComponent(sessionId)}`,
      );
      setFiles(result.files);
      setError("");
      setReferences((previous) =>
        previous.map((ref) => ({
          ...ref,
          available: result.files.some((file) => file.id === ref.id),
        })),
      );
    } catch {
      setError("文件列表加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [token, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
    },
    [],
  );
  const preview = async (file: StudioFile) => {
    // Open identity first, so an unavailable historical card still displays the uniform notice.
    setTabs((previous) =>
      previous.some((item) => item.id === file.id)
        ? previous.map((item) => (item.id === file.id ? { ...file } : item))
        : [...previous, file],
    );
    setActive(file.id);
    setOpen(true);
  };
  const reference = async (
    file: StudioFile,
    match?: { start: number; end: number },
  ) => {
    try {
      const result = await fileJson<{ file: StudioFile }>(token, file.id);
      const value = result.file;
      const textToken = `@{${value.name}}`;
      const current = composerInput.current;
      const start = match?.start ?? current?.selectionStart ?? input.length;
      const end = match?.end ?? current?.selectionEnd ?? input.length;
      onInputChange(input.slice(0, start) + textToken + " " + input.slice(end));
      setReferences((previous) => [
        ...previous,
        {
          key: crypto.randomUUID(),
          id: value.id,
          name: value.name,
          token: textToken,
          available: true,
        },
      ]);
      requestAnimationFrame(() => {
        current?.focus();
        current?.setSelectionRange(
          start + textToken.length + 1,
          start + textToken.length + 1,
        );
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const removeReference = (key: string) => {
    const ref = references.find((item) => item.key === key);
    if (ref) onInputChange(input.replace(ref.token, ""));
    setReferences((previous) => previous.filter((item) => item.key !== key));
  };
  const inputChanged = (text: string) => {
    onInputChange(text);
    const counts = new Map<string, number>();
    setReferences((previous) =>
      previous.filter((ref) => {
        const count = text.split(ref.token).length - 1;
        const used = counts.get(ref.token) || 0;
        counts.set(ref.token, used + 1);
        return used < count;
      }),
    );
  };
  const download = async (file: StudioFile) => {
    try {
      const response = await fileRequest(
        token,
        `${file.id}/content?download=true`,
      );
      if (Number(response.headers.get("x-file-version")) !== file.version)
        setError("文件已更新，下载的是最新版本。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      toast.success("文件已准备下载。");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message || "文件下载失败，请重试。");
    }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await fileJson(token, deleting.id, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: deleting.version }),
      });
      setDeleting(null);
      toast.success("文件已删除。");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("文件已更新")) {
        try {
          const result = await fileJson<{ file: StudioFile }>(
            token,
            deleting.id,
          );
          setDeleting(result.file);
        } catch {}
      }
    }
  };
  const adapter = useMemo<AttachmentAdapter>(
    () => ({
      accept: "*",
      async *add({ file }) {
        const id = crypto.randomUUID();
        if (slots.current.size >= 20) {
          setError("单条消息最多 20 个附件。");
          throw new Error("单条消息最多 20 个附件。");
        }
        slots.current.add(id);
        const controller = new AbortController();
        controllers.current.set(id, controller);
        const attachment = {
          id,
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : "document",
          contentType: file.type,
          file,
        };
        yield {
          ...attachment,
          status: { type: "running", reason: "uploading", progress: 0 },
        } as PendingAttachment;
        try {
          if (!token) throw new Error("请先登录后上传文件。");
          if (uploaded.current.size >= 20)
            throw new Error("单条消息最多 20 个附件。");
          const form = new FormData();
          form.append("session_id", sessionId);
          form.append("file", file);
          if ((file as File & { studioFolder?: boolean }).studioFolder)
            form.append("folder", "true");
          const result = await fileJson<{ file: StudioFile }>(token, "upload", {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
          toast.success(`${file.name} 上传成功。`);
          uploaded.current.set(id, result.file);
          setUploadRecords(new Map(uploaded.current));
          setFiles((previous) => [
            result.file,
            ...previous.filter((item) => item.id !== result.file.id),
          ]);
          yield {
            ...attachment,
            status: { type: "requires-action", reason: "composer-send" },
          } as PendingAttachment;
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            toast.error((e as Error).message || "文件上传失败。");
            yield {
              ...attachment,
              status: {
                type: "incomplete",
                reason: "error",
                message: (e as Error).message,
              },
            } as PendingAttachment;
          }
        } finally {
          controllers.current.delete(id);
        }
      },
      async send(attachment) {
        const file = uploaded.current.get(attachment.id);
        if (!file) throw new Error("附件尚未上传完成。");
        await fileJson(token, file.id);
        return {
          ...attachment,
          status: { type: "complete" },
          content: [
            { type: "text", text: `[文件：${file.name}，ID：${file.id}]` },
          ],
        } as CompleteAttachment;
      },
      async remove(attachment) {
        controllers.current.get(attachment.id)?.abort();
        const file = uploaded.current.get(attachment.id);
        slots.current.delete(attachment.id);
        uploaded.current.delete(attachment.id);
        setUploadRecords(new Map(uploaded.current));
        if (file) {
          setReferences((previous) =>
            previous.filter((ref) => ref.id !== file.id),
          );
          onInputChange(
            (composerInput.current?.value || "")
              .split(`@{${file.name}}`)
              .join(""),
          );
        }
      },
    }),
    [token, sessionId, onInputChange, toast, setError],
  );
  const clearUploads = () => {
    uploaded.current.clear();
    slots.current.clear();
    setUploadRecords(new Map());
  };
  return {
    clearUploads,
    token,
    sessionId,
    files,
    setFiles,
    error,
    setError,
    references,
    setReferences,
    open,
    setOpen,
    tabs,
    setTabs,
    active,
    setActive,
    width,
    setWidth,
    grid,
    setGrid,
    sort,
    setSort,
    loading,
    refresh,
    preview,
    reference,
    removeReference,
    inputChanged,
    download,
    deleting,
    setDeleting,
    confirmDelete,
    adapter,
    uploaded,
    uploadRecords,
    composerInput,
  };
}

export function FileCard({ file }: { file: StudioFile }) {
  const workspace = useFiles();
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    if (
      !file.available ||
      !(file.mime.startsWith("image/") || file.mime.startsWith("video/"))
    )
      return;
    let active = true;
    let url = "";
    void fileRequest(workspace.token, `${file.id}/thumbnail`)
      .then((response) => response.blob())
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setThumbnail(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, file.version, file.available, file.mime, workspace.token]);
  return (
    <div className={`studio-file-card ${!file.available ? "unavailable" : ""}`}>
      <button
        type="button"
        className="studio-file-open"
        onClick={() => void workspace.preview(file)}
      >
        <>
          {thumbnail ? (
            <img className="studio-file-thumbnail" src={thumbnail} alt="" />
          ) : (
            <FileText size={22} />
          )}
        </>
        <span>
          <strong>{file.name}</strong>
          <small>
            {fileSize(file.size)} · v{file.version}
            {!file.available ? " · 文件暂无法查看。" : ""}
          </small>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="studio-icon"
            aria-label={`文件操作：${file.name}`}
          >
            ···
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="xixiDropdownPopup" align="end">
          <DropdownMenuItem onSelect={() => void workspace.preview(file)}>
            预览
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!file.available}
            onSelect={() => void workspace.reference(file)}
          >
            <Link2 />
            引用
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!file.available}
            onSelect={() => void workspace.download(file)}
          >
            <Download />
            下载
          </DropdownMenuItem>
          {file.kind !== "folder" && (
            <DropdownMenuItem
              disabled={!file.available}
              onSelect={() => {
                workspace.setError("");
                workspace.setDeleting(file);
              }}
            >
              <Trash2 />
              删除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DraftAttachment() {
  const attachment = useAuiState((s) => s.attachment);
  const workspace = useFiles();
  const file = workspace.uploadRecords.get(attachment.id);
  return (
    <AttachmentPrimitive.Root className="studio-draft-file">
      <button
        type="button"
        disabled={!file}
        onClick={() => file && void workspace.preview(file)}
      >
        {attachment.status.type === "running" ? (
          <LoaderCircle className="studio-spin" size={18} />
        ) : (
          <FileText size={18} />
        )}
        <AttachmentPrimitive.Name />
      </button>
      {attachment.status.type === "incomplete" && (
        <span role="alert">{attachment.status.message || "上传失败"}</span>
      )}
      <AttachmentPrimitive.Remove
        className="studio-icon"
        aria-label={`移除附件 ${attachment.name}`}
      >
        <X size={14} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

export function MessageFiles() {
  const files = useAuiState(
    (s) => (s.message.metadata.custom.studioFiles || []) as StudioFile[],
  );
  const role = useAuiState((s) => s.message.role);
  const cards = (
    <div className="studio-message-files">
      {files.map((file) => (
        <FileCard file={file} key={file.id} />
      ))}
    </div>
  );
  return !files.length ? null : role === "user" ? (
    <details className="studio-uploaded-files" open={files.length <= 3}>
      <summary>附件 · {files.length}</summary>
      {cards}
    </details>
  ) : (
    cards
  );
}

export function ComposerFiles() {
  const workspace = useFiles();
  const aui = useAui();
  const attachments = useAuiState((s) => s.composer.attachments);
  useEffect(() => {
    for (const [id, file] of workspace.uploadRecords) {
      if (
        !aui.composer
          .getState()
          .attachments.some((attachment) => attachment.id === id)
      ) {
        void aui.composer.addAttachment({
          id,
          type: file.mime.startsWith("image/") ? "image" : "document",
          name: file.name,
          contentType: file.mime,
          content: [
            { type: "text", text: `[文件：${file.name}，ID：${file.id}]` },
          ],
        });
      }
    }
  }, [aui, workspace.uploadRecords, workspace.error]);

  const options = [
    ...new Map(
      [...workspace.files, ...workspace.uploadRecords.values()].map((file) => [
        file.id,
        file,
      ]),
    ).values(),
  ].filter(
    (file) =>
      (file.origin === "artifact" ||
        !!file.message_id ||
        [...workspace.uploadRecords.values()].some(
          (upload) => upload.id === file.id,
        )) &&
      file.available,
  );
  const mentionAdapter = {
    categories: () => [],
    categoryItems: () => [],
    search: (query: string) =>
      options
        .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 30)
        .map((file) => ({
          id: file.id,
          type: "file",
          label: file.name,
          description: fileSize(file.size),
        })),
  };
  return (
    <>
      <ComposerPrimitive.AddAttachment
        id="chat-file-upload"
        style={{ display: "none" }}
        multiple
      />
      <div className="studio-draft-files">
        <ComposerPrimitive.Attachments
          components={{ Attachment: DraftAttachment }}
        />
      </div>
      {workspace.references.length > 0 && (
        <div className="studio-file-references">
          {workspace.references.map((ref) => (
            <span key={ref.key} className={ref.available ? "" : "invalid"}>
              <Link2 size={13} />
              {ref.name}
              {!ref.available && "（已失效）"}
              <button
                type="button"
                className="studio-icon"
                aria-label={`移除引用 ${ref.name}`}
                onClick={() => workspace.removeReference(ref.key)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <ComposerPrimitive.TriggerPopover
        char="@"
        adapter={mentionAdapter}
        className="studio-reference-menu"
        aria-label="引用文件"
      >
        <ComposerPrimitive.TriggerPopover.Directive
          formatter={{
            serialize: (item) => `@{${item.label}}`,
            parse: (text) => [{ kind: "text", text }],
          }}
          onInserted={(item) => {
            workspace.inputChanged(aui.composer.getState().text);
            const key = crypto.randomUUID();
            workspace.setReferences((previous) => [
              ...previous,
              {
                key,
                id: item.id,
                name: item.label,
                token: `@{${item.label}}`,
                available: true,
              },
            ]);
            void fileJson(workspace.token, item.id).catch(() => {
              workspace.setReferences((previous) =>
                previous.map((ref) =>
                  ref.key === key ? { ...ref, available: false } : ref,
                ),
              );
              workspace.setError("引用的文件已失效，请移除或重新上传。");
            });
          }}
        />
        <ComposerPrimitive.TriggerPopoverItems>
          {(items) =>
            items.length ? (
              items.map((item, index) => (
                <ComposerPrimitive.TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                >
                  <FileText size={15} />
                  {item.label}
                </ComposerPrimitive.TriggerPopoverItem>
              ))
            ) : (
              <p>暂无可引用文件。</p>
            )
          }
        </ComposerPrimitive.TriggerPopoverItems>
      </ComposerPrimitive.TriggerPopover>
      <input
        type="file"
        id="chat-folder-upload"
        hidden
        multiple
        {...{ webkitdirectory: "" }}
        onChange={async (event) => {
          const selected = Array.from(event.target.files || []);
          event.target.value = "";
          if (!selected.length) return;
          try {
            if (attachments.length >= 20 || selected.length > 1000)
              throw new Error(
                "文件夹最多包含 1000 个文件，单条消息最多 20 个附件。",
              );
            if (selected.reduce((sum, file) => sum + file.size, 0) > 1e9)
              throw new Error("文件夹超过 1 GB。");
            const { zip } = await import("fflate");
            const entries: Record<string, Uint8Array> = {};
            for (const file of selected) {
              const path = file.webkitRelativePath || file.name;
              if (path.split("/").length > 10 || path.split("/").includes(".."))
                throw new Error("文件夹最多 10 层。");
              entries[path] = new Uint8Array(await file.arrayBuffer());
            }
            const bytes = await new Promise<Uint8Array>((resolve, reject) =>
              zip(entries, (error, data) =>
                error ? reject(error) : resolve(data),
              ),
            );
            const folder = new File(
              [bytes as Uint8Array<ArrayBuffer>],
              `${selected[0].webkitRelativePath.split("/")[0]}.zip`,
              { type: "application/zip" },
            ) as File & { studioFolder: boolean };
            folder.studioFolder = true;
            await aui.composer.addAttachment(folder);
          } catch (error) {
            workspace.setError((error as Error).message);
          }
        }}
      />
    </>
  );
}

export function FilePanel() {
  const workspace = useFiles();
  const tabList = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (workspace.open)
      tabList.current
        ?.querySelector('[data-state="active"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [workspace.active, workspace.open, workspace.tabs.length]);
  const artifacts = workspace.files
    .filter((file) => file.origin === "artifact")
    .sort((a, b) =>
      workspace.sort === "name"
        ? a.name.localeCompare(b.name)
        : workspace.sort === "size"
          ? b.size - a.size
          : b.updated_at.localeCompare(a.updated_at) ||
            a.name.localeCompare(b.name),
    );
  const close = (id: string) => {
    const index = workspace.tabs.findIndex((file) => file.id === id);
    const remaining = workspace.tabs.filter((file) => file.id !== id);
    workspace.setTabs(remaining);
    if (workspace.active === id)
      workspace.setActive(
        remaining[index]?.id || remaining[index - 1]?.id || "files",
      );
  };
  return (
    <>
      <AlertDialog.Root
        open={!!workspace.deleting}
        onOpenChange={(open) => {
          if (!open) workspace.setDeleting(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="studio-dialog-overlay" />
          <AlertDialog.Content className="studio-confirm">
            <AlertDialog.Title>确认删除此文件？</AlertDialog.Title>
            <AlertDialog.Description>
              删除后将无法查看或使用。历史消息中的卡片会保留。
            </AlertDialog.Description>

            <div>
              <AlertDialog.Cancel asChild>
                <button type="button">取消</button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className="danger"
                onClick={() => void workspace.confirmDelete()}
              >
                确认删除
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {workspace.open && (
        <aside className="studio-file-panel" style={{ width: workspace.width }}>
          <div
            className="studio-file-resize"
            role="separator"
            aria-label="调整文件面板宽度"
            aria-orientation="vertical"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft")
                workspace.setWidth(Math.min(900, workspace.width + 20));
              if (event.key === "ArrowRight")
                workspace.setWidth(Math.max(320, workspace.width - 20));
            }}
            onPointerDown={(event) => {
              const start = event.clientX,
                width = workspace.width;
              const move = (move: PointerEvent) =>
                workspace.setWidth(
                  Math.max(
                    320,
                    Math.min(
                      window.innerWidth * 0.65,
                      width + start - move.clientX,
                    ),
                  ),
                );
              const end = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", end);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", end);
            }}
          />
          <Tabs.Root
            value={workspace.active}
            onValueChange={workspace.setActive}
            className="studio-file-tabs"
          >
            <div className="studio-file-tabbar">
              <Tabs.List ref={tabList}>
                <Tabs.Trigger value="files">
                  <Files size={15} />
                  文件
                </Tabs.Trigger>
                {workspace.tabs.map((file) => (
                  <Tabs.Trigger key={file.id} value={file.id} aria-label={file.name} className="studio-file-tab">
                    <Hint content={file.name}><span>{file.name}</span></Hint>
                    <button type="button" aria-label={`关闭预览 ${file.name}`} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); close(file.id); }}><X size={12} /></button>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <button
                type="button"
                className="studio-icon"
                aria-label="收起文件面板"
                onClick={() => workspace.setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <Tabs.Content value="files" className="studio-file-list">
              <div className="studio-file-toolbar">
                <span>AI 文件产物 · {artifacts.length}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button">排序</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="xixiDropdownPopup">
                    {[
                      ["updated", "更新时间"],
                      ["name", "文件名"],
                      ["size", "大小"],
                    ].map(([value, label]) => (
                      <DropdownMenuItem
                        key={value}
                        onSelect={() => workspace.setSort(value)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  className="studio-icon"
                  aria-label="切换文件展示方式"
                  onClick={() => workspace.setGrid(!workspace.grid)}
                >
                  {workspace.grid ? (
                    <List size={16} />
                  ) : (
                    <LayoutGrid size={16} />
                  )}
                </button>
                <button
                  type="button"
                  className="studio-icon"
                  aria-label="刷新文件列表"
                  onClick={() => void workspace.refresh()}
                >
                  <RefreshCw
                    size={15}
                    className={workspace.loading ? "studio-spin" : ""}
                  />
                </button>
              </div>

              {!artifacts.length && !workspace.error && (
                <p className="studio-file-empty">
                  {workspace.loading
                    ? "正在加载文件…"
                    : "当前会话暂无 AI 文件产物。"}
                </p>
              )}
              <div className={workspace.grid ? "studio-file-grid" : ""}>
                {artifacts.map((file) => (
                  <FileCard key={file.id} file={file} />
                ))}
              </div>
            </Tabs.Content>
            {workspace.tabs.map((file) => (
              <Tabs.Content
                forceMount
                hidden={workspace.active !== file.id}
                value={file.id}
                key={file.id}
                className="studio-preview-tab"
              >
                <FilePreview
                  file={file}
                  active={workspace.active === file.id}
                />
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </aside>
      )}
    </>
  );
}
