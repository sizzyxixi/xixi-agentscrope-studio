"use client";
import { Hint } from "@/components/hero-ui/tooltip";


import { useFeedbackState } from "@/components/OperationFeedback";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog } from "@/components/hero-ui/dialog";
import { Tabs } from "@/components/hero-ui/tabs";
import {
  Download,
  RefreshCw,
  Link2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  LoaderCircle,
  Search,
} from "lucide-react";
import { fileJson, fileRequest, fileSize, type StudioFile } from "./file-api";
import { useFiles } from "./file-context";

type Preview = {
  kind: string;
  file: StudioFile;
  text?: string;
  notice?: string;
  sheets?: { name: string; rows: string[][]; total_rows?: number }[];
  entries?: { name: string; size: number; directory: boolean }[];
};
const HTML_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:; form-action 'none'; base-uri 'none'"><meta charset="utf-8">`;
function MarkdownPreview({ text }: { text: string }) {
  const runtime = useExternalStoreRuntime({
    messages: [{ id: "preview", role: "assistant" as const, content: text }],
    convertMessage: (message) => message,
    onNew: async () => {},
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessagePrimitive.Root>
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <MarkdownTextPrimitive
                className="aui-markdown"
                remarkPlugins={[remarkGfm]}
                components={{ img: () => null }}
              />
            ),
          }}
        />
      </MessagePrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
function CodePreview({ text, name }: { text: string; name: string }) {
  const [markup, setMarkup] = useState("");
  const [formatted, setFormatted] = useState(false);
  let display = text;
  if (formatted && name.endsWith(".json")) {
    try {
      display = JSON.stringify(JSON.parse(text), null, 2);
    } catch {}
  }
  useEffect(() => {
    let active = true;
    const suffix = name.split(".").pop() || "text";
    const language =
      (
        {
          js: "javascript",
          ts: "typescript",
          py: "python",
          yml: "yaml",
          htm: "html",
          sh: "bash",
        } as Record<string, string>
      )[suffix] || suffix;
    void import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(display, { lang: language, theme: "github-light" }),
      )
      .then((value) => {
        if (active) setMarkup(value);
      })
      .catch(() => {
        if (active) setMarkup("");
      });
    return () => {
      active = false;
    };
  }, [display, name]);
  return (
    <>
      <button
        type="button"
        className="studio-view-toggle"
        onClick={() => setFormatted(!formatted)}
      >
        {formatted ? "原文" : "格式化视图"}
      </button>
      {markup ? (
        <div
          className="studio-code"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      ) : (
        <pre className="studio-code">{display}</pre>
      )}
    </>
  );
}
function PdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const document = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [zoom, setZoom] = useState(1),
    [error, setError] = useFeedbackState("error"),
    [query, setQuery] = useState(""),
    [, setSearchStatus] = useFeedbackState("auto");
  useEffect(() => {
    let active = true;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist")
      .then(async (pdf) => {
        pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        task = pdf.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        const loaded = await task.promise;
        if (!active) {
          await task?.destroy();
          return;
        }
        document.current = loaded;
        setPages(loaded.numPages);
        setPage(1);
      })
      .catch(() => setError("文件暂无法查看。"));
    return () => {
      active = false;
      document.current = null;
      void task?.destroy();
    };
  }, [url, setError]);
  useEffect(() => {
    let active = true;
    let render: import("pdfjs-dist").RenderTask | undefined;
    const loaded = document.current;
    const node = canvas.current;
    if (!loaded || !node || !pages) return;
    void loaded
      .getPage(page)
      .then((pdfPage) => {
        if (!active) return;
        const viewport = pdfPage.getViewport({ scale: zoom * 1.2 });
        node.width = viewport.width;
        node.height = viewport.height;
        const context = node.getContext("2d");
        if (!context) return;
        render = pdfPage.render({
          canvas: node,
          canvasContext: context,
          viewport,
        });
        return render.promise;
      })
      .catch((error) => {
        if (error.name !== "RenderingCancelledException")
          setError("文件暂无法查看。");
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [page, pages, zoom, url, setError]);
  const search = async () => {
    if (!document.current || !query.trim()) return;
    setSearchStatus("搜索中…");
    try {
      for (let index = 1; index <= Math.min(pages, 200); index++) {
        const content = await (
          await document.current.getPage(index)
        ).getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join("");
        if (text.includes(query)) {
          setPage(index);
          setSearchStatus(`位于第 ${index} 页`);
          return;
        }
      }
      setSearchStatus(
        pages > 200
          ? "前 200 页未找到；仅搜索部分内容"
          : "未找到文字；扫描件需先 OCR。",
      );
    } catch {
      setSearchStatus("文件暂无法查看。");
    }
  };
  return (
    <div className="studio-pdf">
      <div className="studio-preview-controls">
        <button
          type="button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pages || "…"}
        </span>
        <button
          type="button"
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          aria-label="缩小"
          onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}
        >
          <ZoomOut size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="放大"
          onClick={() => setZoom(Math.min(3, zoom + 0.2))}
        >
          <ZoomIn size={16} />
        </button>
        <input
          aria-label="搜索 PDF 文字"
          placeholder="搜索文字"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
        />
        <button
          type="button"
          aria-label="搜索 PDF"
          onClick={() => void search()}
        >
          <Search size={15} />
        </button>
      </div>
      {error ? <p>暂时无法预览此文件，请重试或下载查看。</p> : <canvas ref={canvas} />}
    </div>
  );
}
function WordPreview({ url }: { url: string }) {
  const [markup, setMarkup] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      import("docx-preview"),
      fetch(url).then((response) => response.arrayBuffer()),
    ])
      .then(async ([{ renderAsync }, data]) => {
        const host = document.createElement("div");
        await renderAsync(data, host, undefined, {
          inWrapper: true,
          ignoreWidth: true,
          renderAltChunks: false,
          useBase64URL: true,
        });
        if (active) setMarkup(host.innerHTML);
      })
      .catch(() => setMarkup("文件暂无法查看。"));
    return () => {
      active = false;
    };
  }, [url]);
  return markup ? (
    <iframe
      title="Word 文件预览"
      sandbox=""
      referrerPolicy="no-referrer"
      className="studio-document-frame"
      srcDoc={
        HTML_POLICY +
        "<style>html,body{margin:0}.docx-wrapper{padding:12px!important;background:#f6f5f9!important}.docx-wrapper>section.docx{width:100%!important;max-width:100%!important;min-height:0!important;padding:28px!important;margin:0 0 14px!important;box-sizing:border-box}section.docx p{overflow-wrap:anywhere}section.docx img{max-width:100%!important;height:auto!important}</style>" +
        markup
      }
    />
  ) : (
    <p>正在加载 Word…</p>
  );
}
function ImagePreview({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(true),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const image = (
    <img
      src={url}
      alt={name}
      onError={(event) => {
        event.currentTarget.alt = "文件暂无法查看。";
      }}
    />
  );
  return (
    <>
      <button
        type="button"
        className="studio-image-open"
        onClick={() => setOpen(true)}
      >
        {image}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="studio-dialog-overlay" />
          <Dialog.Content className="studio-image-dialog">
            <Dialog.Title>{name}</Dialog.Title>
            <Dialog.Description className="studio-sr-only">
              图片预览，支持缩放和拖动。
            </Dialog.Description>
            <div className="studio-preview-controls">
              <button
                type="button"
                aria-label="缩小图片"
                onClick={() => setZoom(Math.max(0.2, zoom - 0.25))}
              >
                <ZoomOut size={18} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="放大图片"
                onClick={() => setZoom(Math.min(5, zoom + 0.25))}
              >
                <ZoomIn size={18} />
              </button>
              <Dialog.Close aria-label="关闭图片预览">
                <X size={18} />
              </Dialog.Close>
            </div>
            <div
              className="studio-image-canvas"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const start = {
                  x: event.clientX - pan.x,
                  y: event.clientY - pan.y,
                };
                event.currentTarget.onpointermove = (move) =>
                  setPan({
                    x: move.clientX - start.x,
                    y: move.clientY - start.y,
                  });
                event.currentTarget.onpointerup = (up) => {
                  (up.currentTarget as HTMLDivElement).onpointermove = null;
                };
              }}
            >
              <img
                src={url}
                alt={name}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                }}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function FilePreview({
  file,
  active,
}: {
  file: StudioFile;
  active: boolean;
}) {
  const workspace = useFiles();
  const [info, setInfo] = useState<StudioFile>(file),
    [preview, setPreview] = useState<Preview | null>(null),
    [url, setUrl] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useFeedbackState("error"),
    [sheet, setSheet] = useState(""),
    [version, setVersion] = useState(0),
    [source, setSource] = useState(false);
  const revoked = useRef("");
  const loadGeneration = useRef(0);
  const load = async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      const result = await fileJson<Preview>(
        workspace.token,
        `${file.id}/preview`,
      );
      const current = result.file;
      const binary = ["docx", "pdf", "svg", "media"].includes(result.kind);
      let next = "";
      if (binary) {
        const path = ["docx", "pdf", "svg"].includes(result.kind)
          ? `${file.id}/preview?raw=true&version=${current.version}`
          : `${file.id}/content?preview_version=${current.version}`;
        next = URL.createObjectURL(
          await (await fileRequest(workspace.token, path)).blob(),
        );
      }
      if (generation !== loadGeneration.current) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      if (revoked.current) URL.revokeObjectURL(revoked.current);
      revoked.current = next;
      setInfo(current);
      setVersion(current.version);
      setPreview(result);
      setUrl(next);
      setSheet(result.sheets?.[0]?.name || "");
    } catch {
      if (generation !== loadGeneration.current) return;
      setError("文件暂无法查看。");
      setPreview(null);
      setUrl("");
      try {
        const result = await fileJson<{ file: StudioFile }>(
          workspace.token,
          file.id,
        );
        setInfo(result.file);
      } catch {
        setInfo({ ...file, available: false });
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  };
  // Re-opening the identity checks latest metadata. Switching tabs retains the loaded snapshot.
  useEffect(() => {
    if (active) queueMicrotask(() => void load());
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active && !version) queueMicrotask(() => void load());
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (
      !workspace.files.some((item) => item.id === file.id) &&
      !workspace.loading
    ) {
      void fileJson(workspace.token, file.id).catch(() => {
        setInfo((previous) => ({ ...previous, available: false }));
        setPreview(null);
        setError("文件暂无法查看。");
      });
    }
  }, [workspace.files, setError]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      loadGeneration.current++;
      if (revoked.current) URL.revokeObjectURL(revoked.current);
    },
    [],
  );
  useEffect(() => {
    const remaining = Date.parse(info.expires_at) - Date.now();
    const revoke = () => {
      setInfo((previous) => ({ ...previous, available: false }));
      setPreview(null);
      setError("文件暂无法查看。");
      setUrl("");
      if (revoked.current) URL.revokeObjectURL(revoked.current);
    };
    let timer: number;
    const check = () => {
      const left = Date.parse(info.expires_at) - Date.now();
      if (left > 0)
        timer = window.setTimeout(check, Math.min(left, 2147483647));
      else revoke();
    };
    timer = window.setTimeout(
      check,
      Math.max(0, Math.min(remaining, 2147483647)),
    );
    return () => window.clearTimeout(timer);
  }, [info.expires_at, setError]);
  const suffix = info.name.split(".").pop()?.toLowerCase();
  const table = preview?.sheets?.find((item) => item.name === sheet);
  return (
    <>
      <header className="studio-preview-heading">
        <div>
          <Hint content={info.name}><strong >{info.name}</strong></Hint>
          <small>
            {fileSize(info.size)} · v{version || info.version} ·{" "}
            {new Date(info.updated_at).toLocaleString("zh-CN")}
          </small>
        </div>
        <div>
          <button
            type="button"
            aria-label="刷新文件预览"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={16} className={loading ? "studio-spin" : ""} />
          </button>
          <button
            type="button"
            aria-label="引用文件"
            disabled={!info.available}
            onClick={() => void workspace.reference(info)}
          >
            <Link2 size={16} />
          </button>
          <button
            type="button"
            aria-label="下载文件"
            disabled={!info.available}
            onClick={() => void workspace.download(info)}
          >
            <Download size={16} />
          </button>
        </div>
      </header>
      <div className="studio-preview-body">
        {loading ? (
          <p>
            <LoaderCircle className="studio-spin" size={18} />
            正在加载文件…
          </p>
        ) : error ? (
          <p>暂时无法预览此文件，请重试或下载查看。</p>
        ) : (
          preview && (
            <>
              {preview.notice && (
                <p className="studio-file-notice">{preview.notice}</p>
              )}
              {preview.kind === "markdown" ? (
                <Tabs.Root
                  value={source ? "source" : "rendered"}
                  onValueChange={(value) => setSource(value === "source")}
                >
                  <Tabs.List className="studio-preview-controls">
                    <Tabs.Trigger value="rendered">预览</Tabs.Trigger>
                    <Tabs.Trigger value="source">原文</Tabs.Trigger>
                  </Tabs.List>
                  <Tabs.Content value="rendered">
                    <MarkdownPreview text={preview.text || ""} />
                  </Tabs.Content>
                  <Tabs.Content value="source">
                    <CodePreview text={preview.text || ""} name={info.name} />
                  </Tabs.Content>
                </Tabs.Root>
              ) : preview.kind === "html" ? (
                <iframe
                  title={`HTML：${info.name}`}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="studio-document-frame"
                  srcDoc={HTML_POLICY + (preview.text || "")}
                />
              ) : preview.kind === "text" ? (
                <CodePreview text={preview.text || ""} name={info.name} />
              ) : preview.kind === "table" ? (
                <>
                  <Tabs.Root value={sheet} onValueChange={setSheet}>
                    <Tabs.List className="studio-preview-controls">
                      {preview.sheets?.map((value) => (
                        <Tabs.Trigger value={value.name} key={value.name}>
                          {value.name}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                  <div className="studio-table-scroll">
                    <table>
                      <tbody>
                        {table?.rows.map((row, index) => (
                          <tr key={index}>
                            <th>{index + 1}</th>
                            {row.map((cell, column) => (
                              <td key={column}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : preview.kind === "directory" ? (
                <ul className="studio-directory">
                  {preview.entries?.map((entry) => (
                    <li key={entry.name}>
                      <span>
                        {entry.directory ? "📁" : "📄"} {entry.name}
                      </span>
                      <small>{fileSize(entry.size)}</small>
                    </li>
                  ))}
                </ul>
              ) : preview.kind === "docx" ? (
                <WordPreview url={url} />
              ) : preview.kind === "pdf" || suffix === "pdf" ? (
                <PdfPreview url={url} />
              ) : preview.kind === "svg" || info.mime.startsWith("image/") ? (
                <ImagePreview url={url} name={info.name} />
              ) : info.mime.startsWith("audio/") ? (
                <audio
                  src={url}
                  controls
                  onError={() => setError("文件暂无法查看。")}
                />
              ) : info.mime.startsWith("video/") ? (
                <video
                  src={url}
                  controls
                  onError={() => setError("文件暂无法查看。")}
                />
              ) : (
                <p>文件暂无法查看。</p>
              )}
            </>
          )
        )}
      </div>
    </>
  );
}
