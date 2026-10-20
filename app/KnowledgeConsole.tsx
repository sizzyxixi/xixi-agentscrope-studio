"use client";

import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/hero-ui/dialog";
import { Database, FileText, LockKeyhole, Plus, Upload, ArrowLeft, Search, RefreshCw } from "lucide-react";
import { consoleApi } from "./StudioConsole";
import { SelectField } from "@/components/SelectField";
import { usePreferences } from "@/components/PreferencesProvider";

type Embedding = { provider: string; model: string; base_url: string; dimensions: number; api_key?: string; has_key?: boolean };
type Base = { id: string; name: string; description: string; enabled: boolean; embedding: Embedding; documents: {status: string; count: number}[] };
type Official = { id: string; name: string; description: string; name_en: string; description_en: string };
type Doc = { id: string; name: string; status: string; error: string; chunks: number };
type Hit = { knowledge_base: string; document: string; page?: number; sheet?: string; chunk: number; score: number; content: string };
type DocDraft = { id?: string; name: string; content: string; editable: boolean };
type BaseDraft = Omit<Base, "id" | "documents"> & { id?: string };
const statusNames: Record<string, string> = { queued: "排队中", indexing: "索引中", ready: "已就绪", failed: "索引失败", needs_config: "待配置模型", disabled: "已停用" };
const freshBase = (): BaseDraft => ({ name: "", description: "", enabled: true, embedding: { provider: "platform", model: "", base_url: "", dimensions: 1024, api_key: "" } });

export default function KnowledgeConsole({ token, onLogin }: { token: string; onLogin: () => void }) {
  const { t, language } = usePreferences();
  const toast = useToast();
  const [tab, setTab] = useState<"personal" | "official">("personal");
  const [bases, setBases] = useState<Base[]>([]);
  const [official, setOfficial] = useState<Official[]>([]);
  const [platformReady, setPlatformReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [draft, setDraft] = useState<BaseDraft | null>(null);
  const [docDraft, setDocDraft] = useState<DocDraft | null>(null);
  const [, setError] = useFeedbackState("error");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{hits: Hit[]; warnings: string[]} | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "base" | "document"; id: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const active = bases.find(base => base.id === selected);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const data = await consoleApi<{ personal: Base[]; official: Official[]; platform_configured: boolean }>(token, "knowledge-bases");
    let documents: Doc[] = [];
    if (selected) {
      const detail = await consoleApi<{ documents: Doc[] }>(token, `knowledge-bases/${selected}/documents`);
      documents = detail.documents;
    }
    if (version !== requestVersion.current) return;
    setBases(data.personal); setOfficial(data.official); setPlatformReady(data.platform_configured); setDocs(documents);
  }, [token, selected]);
  useEffect(() => {
    if (!token) return;
    let live = true;
    void Promise.resolve().then(refresh).catch(e => { if (live) setError((e as Error).message); }).finally(() => { if (live) setLoading(false); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(() => {}); }, 3000);
    return () => { live = false; window.clearInterval(timer); };
  }, [token, refresh, setError]);
  const run = async (id: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(id); setError("");
    try { await action(); const message = ({ "save-base": "知识库已保存。", "save-doc": "文档已保存，正在建立索引。", upload: "文档已上传，正在解析。", delete: "已删除。" } as Record<string, string>)[id]; if (message) toast.success(message); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const openBase = (id: string) => { setTab("personal"); setSelected(id); setDocs([]); setResult(null); setQuestion(""); setError(""); };
  const saveBase = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    void run("save-base", async () => {
      const data = await consoleApi<{knowledge_base: Base}>(token, `knowledge-bases${draft.id ? `/${draft.id}` : ""}`, draft.id ? "PUT" : "POST", draft);
      setDraft(null); await refresh();
      if (!draft.id) openBase(data.knowledge_base.id);
    });
  };
  const saveDoc = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !docDraft) return;
    void run("save-doc", async () => {
      await consoleApi(token, `knowledge-bases/${selected}/documents${docDraft.id ? `/${docDraft.id}` : ""}`, docDraft.id ? "PUT" : "POST", docDraft);
      setDocDraft(null); setResult(null); await refresh();
    });
  };
  const upload = async (file?: File) => {
    if (!file || !selected) return;
    await run("upload", async () => {
      if (file.size > 10 * 1024 * 1024) throw new Error(t("文件不能超过10MB。"));
      const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error(t("文件读取失败。"))); reader.readAsDataURL(file); });
      await consoleApi(token, `knowledge-bases/${selected}/documents`, "POST", { name: file.name, base64: encoded });
      setResult(null); await refresh();
    });
  };
  const editDoc = (doc: Doc) => void run(doc.id, async () => {
    const data = await consoleApi<DocDraft>(token, `knowledge-bases/${selected}/documents/${doc.id}`);
    setDocDraft(data);
  });
  const remove = () => {
    if (!deleteTarget) return;
    void run("delete", async () => {
      const target = deleteTarget;
      await consoleApi(token, target.kind === "base" ? `knowledge-bases/${target.id}` : `knowledge-bases/${selected}/documents/${target.id}`, "DELETE");
      setDeleteTarget(null); setResult(null);
      if (target.kind === "base") { setSelected(null); setDocs([]); setBases(items => items.filter(item => item.id !== target.id)); }
      else await refresh();
    });
  };
  const localOfficial = (item: Official) => ({ name: language === "en" ? item.name_en || item.name : item.name, description: language === "en" ? item.description_en || item.description : item.description });
  const count = (base: Base, state?: string) => base.documents.filter(item => !state || item.status === state).reduce((sum, item) => sum + item.count, 0);
  if (!token) return <section className="consolePage"><div className="consoleLogin"><Database size={32} /><h3>{t("知识库")}</h3><p>{t("登录后管理个人知识库，并在会话中使用官方知识库。")}</p><button className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</button></div></section>;
  return <section className="consolePage knowledgeConsole">
    <div className="knowledgeHeading"><div>{active && <button type="button" className="textButton knowledgeBack" onClick={() => { setSelected(null); setResult(null); }}><ArrowLeft size={14} />{t("返回知识库")}</button>}<h2>{active?.name ?? t("知识库")}</h2><p>{active?.description ?? t("管理你的业务知识，让智能体基于可靠资料回答与执行。")}</p></div><div className="consoleActions"><button className="secondaryButton" disabled={!!busy} onClick={() => void run("refresh", refresh)}><RefreshCw size={14} />{t("刷新")}</button>{active ? <button className="secondaryButton" disabled={!!busy} onClick={() => setDraft({ ...active, embedding: { ...active.embedding, api_key: "" } })}>{t("知识库设置")}</button> : <button className="primaryButton" onClick={() => setDraft(freshBase())}>＋ {t("创建知识库")}</button>}</div></div>

    {!active ? <><div className="consoleTabs" role="tablist" aria-label={t("知识库类型")}><button role="tab" aria-selected={tab === "personal"} className={tab === "personal" ? "active" : ""} onClick={() => setTab("personal")}>{t("我的知识库")}</button><button role="tab" aria-selected={tab === "official"} className={tab === "official" ? "active" : ""} onClick={() => setTab("official")}>{t("官方知识库")}</button></div>
      <div className="resourceToolbar"><input aria-label={t("搜索知识库")} placeholder={t("搜索知识库")} value={search} onChange={event => setSearch(event.target.value)} /></div>
      {tab === "official" ? <><p className="formHint">{t("官方知识库可在会话中自动检索，此处仅展示名称和用途，不提供原文查看或下载。")}</p><div className="resourceGrid">{official.filter(item => { const local = localOfficial(item); return `${local.name} ${local.description}`.toLowerCase().includes(search.toLowerCase()); }).map(item => { const local = localOfficial(item); return <article className="resourceCard knowledgeOfficial" key={item.id}><LockKeyhole size={23} /><h3>{local.name}</h3><p>{local.description}</p></article>; })}</div></> : <>
        {!platformReady && <p className="consoleAlert">{t("平台默认 Embedding 尚未配置；你可以在知识库设置中配置自己的向量模型。")}</p>}
        {loading ? <p className="consoleLoading">{t("正在读取知识库…")}</p> : !bases.length ? <div className="consoleEmpty"><Database size={32} /><h3>{t("创建你的第一个知识库")}</h3><p>{t("上传资料或粘贴文本，完成索引后即可在会话中检索。")}</p><button className="primaryButton" onClick={() => setDraft(freshBase())}>{t("创建知识库")}</button></div> : <div className="resourceGrid">{bases.filter(base => `${base.name} ${base.description}`.toLowerCase().includes(search.toLowerCase())).map(base => <article key={base.id} className="resourceCard"><div className="resourceCardTop"><Database size={23} /><span className={`statusBadge ${base.enabled ? "success" : ""}`}>{t(base.enabled ? "已启用" : "已停用")}</span></div><h3>{base.name}</h3><p className="resourcePreview">{base.description || t("暂无用途描述")}</p><div className="resourceMeta"><span>{count(base)} {t("篇文档")}</span><span>{count(base, "ready")} {t("已就绪")}</span></div><div className="resourceCardActions"><button className="textButton accent" onClick={() => openBase(base.id)}>{t("管理文档")}</button><button className="textButton" onClick={() => setDraft({ ...base, embedding: { ...base.embedding, api_key: "" } })}>{t("设置")}</button><button className="textButton danger" onClick={() => setDeleteTarget({ kind: "base", id: base.id, name: base.name })}>{t("删除")}</button></div></article>)}</div>}
      </>}
    </> : <>
      <div className="resourceToolbar"><span>{docs.length} {t("篇文档")}</span><button className="secondaryButton" disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={14} />{t("上传文档")}</button><button className="secondaryButton" disabled={!!busy} onClick={() => setDocDraft({ name: "资料.md", content: "", editable: true })}><Plus size={14} />{t("新建文本")}</button><button className="textButton" disabled={!!busy} onClick={() => void run("reindex", async () => { await consoleApi(token, `knowledge-bases/${active.id}/reindex`, "POST", {}); setResult(null); await refresh(); })}>{t("重建索引")}</button><input ref={fileInput} hidden type="file" accept=".md,.markdown,.txt,.csv,.json,.pdf,.docx,.xlsx,.pptx" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></div>
      <p className="formHint">{t("支持 TXT、Markdown、CSV、JSON、PDF、Word、Excel、PPTX，单文件最大10MB。索引完成后参与检索。")}</p>
      <div className="knowledgeDocuments">{!docs.length ? <div className="consoleEmpty"><FileText size={30} /><p>{t("还没有文档，请上传资料或新建文本。")}</p></div> : docs.map(doc => <article className="knowledgeDocument" key={doc.id}><FileText size={20} /><div><strong>{doc.name}</strong><small>{t(statusNames[doc.status] ?? doc.status)}{doc.status === "ready" && ` · ${doc.chunks} ${t("个片段")}`}</small>{doc.error && <p className="knowledgeDocError">{t(doc.error)}</p>}</div><button className="textButton" disabled={!!busy} onClick={() => editDoc(doc)}>{t("查看 / 编辑")}</button><button className="textButton danger" disabled={!!busy} onClick={() => setDeleteTarget({ kind: "document", id: doc.id, name: doc.name })}>{t("删除")}</button></article>)}</div>
      <details className="knowledgeSearch"><summary>{t("检索测试")}</summary><p className="formHint">{t("仅测试当前个人知识库的向量召回，不调用聊天模型。")}</p><form onSubmit={event => { event.preventDefault(); void run("search", async () => { const data = await consoleApi<{ hits: Hit[]; warnings: string[] }>(token, `knowledge-bases/${active.id}/search`, "POST", { query: question }); setResult(data); data.warnings.forEach(warning => toast.warning(warning)); }); }}><input required maxLength={2000} value={question} placeholder={t("输入一个与资料有关的问题")} onChange={event => setQuestion(event.target.value)} /><button className="secondaryButton" disabled={!!busy || !question.trim()}><Search size={15} />{t(busy === "search" ? "检索中…" : "检索")}</button></form>{result && <div aria-live="polite">{!result.hits.length && <p className="formHint">{t("未召回相关片段，请检查索引状态或调整问题。")}</p>}{result.hits.map((hit, index) => <article className="knowledgeHit" key={`${hit.document}-${hit.chunk}-${index}`}><strong>{hit.document}{hit.page ? ` · ${t("页码")} ${hit.page}` : ""}{hit.sheet ? ` · ${hit.sheet}` : ""}</strong><small>{t("相似度")} {hit.score}</small><p>{hit.content}</p></article>)}</div>}</details>
    </>}
    <Dialog.Root open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><Dialog.Portal><Dialog.Overlay className="agentDialogOverlay" /><Dialog.Content className="agentDialog knowledgeDialog" onInteractOutside={event => event.preventDefault()}>{draft && <form className="agentEditorForm" onSubmit={saveBase}><header className="sectionTitle"><div><Dialog.Title>{t(draft.id ? "知识库设置" : "创建知识库")}</Dialog.Title><Dialog.Description>{t("个人资料仅供当前账号检索。修改向量模型后会重建索引。")}</Dialog.Description></div><Dialog.Close className="closeButton" disabled={!!busy} aria-label={t("关闭")}>×</Dialog.Close></header><div className="agentEditorBody"><fieldset disabled={!!busy}><label>{t("名称")} *<input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>{t("用途描述")}<textarea rows={3} maxLength={1000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><label className="checkLabel"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />{t("在会话中启用此知识库")}</label><h4>{t("向量模型配置")}</h4><SelectField aria-label={t("Embedding 服务")} value={draft.embedding.provider} onValueChange={provider => setDraft({ ...draft, embedding: { ...draft.embedding, provider } })} options={[{ value: "platform", label: t("平台默认") }, { value: "openai", label: t("OpenAI 兼容接口") }, { value: "ollama", label: "Ollama" }]} />
      {draft.embedding.provider === "platform" ? <p className="formHint">{t(platformReady ? "使用平台提供的 Embedding 服务。" : "平台默认尚未配置，请选择自己的 Embedding 服务。")}</p> : <div className="knowledgeEmbedding"><label>{t("Embedding 模型名称")} *<input required maxLength={200} value={draft.embedding.model} placeholder={draft.embedding.provider === "ollama" ? "bge-m3" : "text-embedding-v4"} onChange={event => setDraft({ ...draft, embedding: { ...draft.embedding, model: event.target.value } })} /></label><label>{t("服务地址")}<input type="url" value={draft.embedding.base_url} placeholder={draft.embedding.provider === "ollama" ? "http://127.0.0.1:11434" : "https://dashscope.aliyuncs.com/compatible-mode/v1"} onChange={event => setDraft({ ...draft, embedding: { ...draft.embedding, base_url: event.target.value } })} /></label><label>{t("向量维度")} *<input required type="number" min={1} max={8192} value={draft.embedding.dimensions} onChange={event => setDraft({ ...draft, embedding: { ...draft.embedding, dimensions: Number(event.target.value) } })} /></label>{draft.embedding.provider === "openai" && <label>API Key<input type="password" autoComplete="new-password" required={!draft.embedding.has_key} maxLength={4096} value={draft.embedding.api_key ?? ""} placeholder={t(draft.embedding.has_key ? "已保存，留空保留原密钥" : "填写 Embedding API Key")} onChange={event => setDraft({ ...draft, embedding: { ...draft.embedding, api_key: event.target.value } })} /></label>}<p className="formHint">{t("请使用支持文本嵌入的模型，维度需与模型输出一致。文档内容将发送至所配置的服务。")}</p></div>}</fieldset></div><footer className="agentEditorFooter"><button type="button" className="secondaryButton" disabled={!!busy} onClick={() => setDraft(null)}>{t("取消")}</button><button className="primaryButton" disabled={!!busy}>{t(busy ? "保存中…" : "保存")}</button></footer></form>}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!docDraft} onOpenChange={open => { if (!open && !busy) setDocDraft(null); }}><Dialog.Portal><Dialog.Overlay className="agentDialogOverlay" /><Dialog.Content className="agentDialog knowledgeDialog" onInteractOutside={event => event.preventDefault()}>{docDraft && <form className="agentEditorForm" onSubmit={saveDoc}><header className="sectionTitle"><div><Dialog.Title>{t(docDraft.editable ? "编辑知识文档" : "文档解析预览")}</Dialog.Title><Dialog.Description>{t("修改并保存后重新生成向量索引。")}</Dialog.Description></div><Dialog.Close className="closeButton" disabled={!!busy} aria-label={t("关闭")}>×</Dialog.Close></header><div className="agentEditorBody"><fieldset disabled={!!busy}><label>{t("文件名")}<input required maxLength={200} readOnly={!docDraft.editable} value={docDraft.name} onChange={event => setDocDraft({ ...docDraft, name: event.target.value })} /></label><label>{t("文档内容")}<textarea required readOnly={!docDraft.editable} rows={18} value={docDraft.content} onChange={event => setDocDraft({ ...docDraft, content: event.target.value })} /></label></fieldset></div><footer className="agentEditorFooter"><button type="button" className="secondaryButton" disabled={!!busy} onClick={() => setDocDraft(null)}>{t("关闭")}</button>{docDraft.editable && <button className="primaryButton" disabled={!!busy}>{t(busy ? "保存中…" : "保存并建立索引")}</button>}</footer></form>}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!deleteTarget} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}><Dialog.Portal><Dialog.Overlay className="agentDialogOverlay" /><Dialog.Content className="agentDialog knowledgeDelete"><Dialog.Title>{t("确认删除")}</Dialog.Title><Dialog.Description>{deleteTarget?.name} · {t("删除后停止检索并清理源文档与向量，无法恢复。")}</Dialog.Description><div className="agentEditorFooter"><button className="secondaryButton" disabled={!!busy} onClick={() => setDeleteTarget(null)}>{t("取消")}</button><button className="primaryButton" disabled={!!busy} onClick={remove}>{t("确认删除")}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
