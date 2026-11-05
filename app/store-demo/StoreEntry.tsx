"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type DragEvent } from "react";
import { ArrowLeftRight, ArrowUp, Check, FileText, Paperclip, Plus, Sparkles, Store, X } from "lucide-react";
import type { AgentProfile } from "../AgentEditor";
import { TargetShopPicker, type TargetShop } from "./TargetShopPicker";
import marketPreview from "./market-preview.json";
import s from "./store-demo.module.css";

type Agent = Pick<AgentProfile, "id" | "name" | "enabled" | "config">;
type Attachment = { id: string; file: File };
type Preview = { agent: Agent; text: string; files: string[]; targetShop: TargetShop | null };
const initialAgents: Agent[] = marketPreview;
const promptGroups = [
  { id: "selection", name: "智能选品", prompts: [
    { label: "趋势爆品", text: "帮我推荐 TikTok 近 30 天内在美区的美容护理趋势爆品。" },
    { label: "新品机会", text: "帮我查看 TikTok 美妆品类中利润空间较好的新品窗口机会。请按利润空间从高到低排序，并给出推荐理由。" },
    { label: "本土现货", text: "帮我找美国本土有价格竞争优势、能快速起量的优质现货。" },
  ] },
  { id: "listing", name: "一键刊登", prompts: [
    { label: "新品上架", text: "根据我提供的商品资料，整理适合 TikTok Shop 美区的刊登草稿，包含标题、卖点、详情描述和待补充的商品属性。" },
    { label: "标题优化", text: "帮我优化这款商品的标题和核心卖点，让表达更符合目标市场买家的搜索与阅读习惯。" },
    { label: "多语刊登", text: "帮我把这款商品资料整理成英文刊登文案，保留准确的规格参数，并列出需要确认的信息。" },
  ] },
  { id: "opening", name: "开店引导", prompts: [
    { label: "平台选择", text: "我想开始做跨境电商，请结合我的预算、货源和目标市场，帮我比较适合入驻的平台。" },
    { label: "开店准备", text: "我准备开一家 TikTok Shop，请帮我梳理需要核实的入驻条件、准备资料和开店步骤。" },
    { label: "起步计划", text: "帮我制定新店前 30 天的经营计划，按周拆解选品、商品上架、内容准备和复盘任务。" },
  ] },
] as const;
type PromptGroup = typeof promptGroups[number]["id"];

function Artwork({ agent }: { agent: Agent }) {
  const [failed, setFailed] = useState(false);
  return <div className={s.artwork}>
    {agent.config.cover_url && !failed ?
      // The same artwork field is used by the capability market.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={agent.config.cover_url} alt="" onError={() => setFailed(true)} /> :
      <span className={s.artFallback}><Store size={34} strokeWidth={1.3} /><span>{agent.name.split(" ")[0]}</span></span>}
  </div>;
}

export default function StoreEntry({ embedded = false, token = "", accountId = "guest" }: { embedded?: boolean; token?: string; accountId?: string }) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [target, setTarget] = useState<{ agentId: string; accountId: string; shop: TargetShop | null } | null>(null);
  const [selectedId, setSelectedId] = useState("official-shopee");
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sending, setSending] = useState(false);
  const [promptGroup, setPromptGroup] = useState<PromptGroup>("selection");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const switchRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepth = useRef(0);
  const current = agents.find(agent => agent.id === selectedId) ?? agents[0];

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarket() {
      try {
        if (!token) return;
        const response = await fetch("/api/console/agents", { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok) throw new Error("market unavailable");
        const result = await response.json() as { agents: Agent[] };
        if (controller.signal.aborted) return;
        setAgents(result.agents.filter(agent => agent.enabled));
      } catch {
        // Keep the official preview catalogue available when the market is offline.
      }
    }
    void loadMarket();
    return () => controller.abort();
  }, [token]);

  useEffect(() => () => { if (sendTimer.current) clearTimeout(sendTimer.current); }, []);
  useEffect(() => {
    const element = inputRef.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(Math.max(element.scrollHeight, 130), 300)}px`; }
  }, [text]);
  useEffect(() => {
    if (!expanded) return;
    const selected = panelRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    const row = selected?.parentElement;
    if (selected && row) {
      const cardBounds = selected.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      row.scrollLeft += cardBounds.left - rowBounds.left - (row.clientWidth - cardBounds.width) / 2;
    }
    const timer = setTimeout(() => selected?.focus({ preventScroll: true }), 180);
    return () => clearTimeout(timer);
  }, [expanded]);

  function choose(agent: Agent) {
    if (agent.id !== current?.id) setTarget(null);
    setSelectedId(agent.id);
    setExpanded(false);
    setError("");
    inputRef.current?.focus();
  }

  function addFiles(incoming: File[]) {
    const valid = incoming.filter(file => file.size <= 20 * 1024 * 1024);
    setFiles(previous => {
      const unique = valid.filter(file => !previous.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified));
      return [...previous, ...unique.map(file => ({ id: crypto.randomUUID(), file }))].slice(0, 10);
    });
    setError(valid.length !== incoming.length ? "单个附件请控制在 20 MB 以内。" : files.length + incoming.length > 10 ? "每次最多添加 10 个附件。" : "");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    inputRef.current?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length) { event.preventDefault(); addFiles(pasted); }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault(); dragDepth.current = 0; setDragging(false);
    if (!sending) addFiles(Array.from(event.dataTransfer.files));
  }

  function submit() {
    if ((!text.trim() && !files.length) || sending || !current) return;
    setSending(true); setError("");
    const next = { agent: current, text: text.trim(), files: files.map(item => item.file.name), targetShop: target?.agentId === current.id && target.accountId === accountId ? target.shop : null };
    sendTimer.current = setTimeout(() => { setPreview(next); setSending(false); }, 450);
  }

  function agentCard(agent: Agent, index: number) {
    const selected = current?.id === agent.id;
    return <button key={agent.id} type="button" className={`${s.agentCard} ${selected ? s.selected : ""}`} aria-pressed={selected} onClick={() => choose(agent)} style={{ "--card-index": index } as CSSProperties} title={agent.config.description}>
      <Artwork agent={agent} />
      {selected && <span className={s.selectedBadge} aria-label="已选择"><Check size={13} strokeWidth={3} /></span>}
      <span className={s.cardName}>{agent.name}</span>
    </button>;
  }

  return <div className={`${s.page}${embedded ? ` ${s.embedded}` : ""}`}>
    <main className={s.main}>
      <section className={s.workspace} aria-label="创建店铺经营任务">
        <div className={s.agentStage} data-expanded={expanded}>
          <div className={s.collapsed} aria-hidden={expanded} inert={expanded}>
            <button ref={switchRef} type="button" className={s.deck} aria-label={`切换智能体，当前为${current?.name ?? "暂无可用智能体"}`} aria-expanded={expanded} aria-controls="store-agent-panel" onClick={() => setExpanded(true)} disabled={!current || sending}>
              <span className={`${s.backCard} ${s.backCardFar}`} /><span className={`${s.backCard} ${s.backCardNear}`} />
              <span className={s.frontCard}>{current && <Artwork agent={current} />}<span className={s.deckName}>{current?.name ?? "暂无可用智能体"}</span></span>
              <span className={s.switchIcon}><ArrowLeftRight size={16} /></span>
            </button>
            <div className={s.greeting}>
              <h1>你好，需要我帮你做什么？</h1>
            </div>
          </div>
          <div id="store-agent-panel" ref={panelRef} className={s.expanded} aria-hidden={!expanded} inert={!expanded} onKeyDown={event => { if (event.key === "Escape") { setExpanded(false); requestAnimationFrame(() => switchRef.current?.focus({ preventScroll: true })); } }}>
            <div className={s.pickerHeading}><span>这次，让谁来接手？</span><button type="button" aria-label="收起智能体选择" onClick={() => { setExpanded(false); requestAnimationFrame(() => switchRef.current?.focus()); }}><X size={16} /></button></div>
            <div className={s.cardRow} aria-label="选择智能体，可横向滚动">{agents.map((agent, index) => agentCard(agent, index))}</div>
          </div>
        </div>

        <form className={`${s.composer} ${dragging ? s.dragging : ""}`} onSubmit={event => { event.preventDefault(); submit(); }} onDragEnter={event => { event.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={onDrop} aria-busy={sending}>
          <label className={s.srOnly} htmlFor="store-task">描述你的店铺经营任务</label>
          <textarea id="store-task" ref={inputRef} value={text} onChange={event => { setText(event.target.value); setPreview(null); }} onPaste={onPaste} disabled={sending} rows={4} placeholder="比如：帮我看看最近销量为什么下降，接下来该怎么调整…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
          {files.length > 0 && <div className={s.attachments}>{files.map(item => <div key={item.id} className={s.file}><span className={s.fileIcon}><FileText size={19} /></span><span><strong title={item.file.name}>{item.file.name}</strong><small>{item.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(item.file.size / 1024))} KB` : `${(item.file.size / 1024 / 1024).toFixed(1)} MB`} · 已添加</small></span><button type="button" aria-label={`移除附件 ${item.file.name}`} disabled={sending} onClick={() => setFiles(previous => previous.filter(file => file.id !== item.id))}><X size={13} /></button></div>)}</div>}
          <div className={s.tools}>
            <div className={s.leftTools}><button type="button" className={s.add} aria-label="添加附件" title="添加附件，也可拖入文件" onClick={() => fileRef.current?.click()} disabled={sending}><Plus size={22} strokeWidth={1.6} /></button><input ref={fileRef} type="file" multiple hidden onChange={onFileChange} />{current && current.id !== "main" && <TargetShopPicker key={`${accountId}:${current.id}`} agentId={current.id} agentName={current.name} value={target?.agentId === current.id && target.accountId === accountId ? target.shop : null} disabled={sending} onChange={shop => { setTarget({ agentId: current.id, accountId, shop }); setPreview(null); }} />}</div>
            <div className={s.rightTools}><button type="button" onClick={submit} className={s.send} aria-label="发送任务" disabled={(!text.trim() && !files.length) || sending || !current}>{sending ? <span className={s.spinner} /> : <ArrowUp size={23} strokeWidth={1.8} />}</button></div>
          </div>
          {dragging && <div className={s.dropOverlay}><Paperclip size={25} /><strong>松开，添加经营资料</strong></div>}
        </form>
        <div aria-live="polite">{error && <p role="alert" className={s.error}>{error}</p>}{preview && <div className={s.receipt}><span className={s.receiptIcon}><Check size={18} /></span><div><strong>任务预览 · {preview.agent.name}</strong><p>{preview.text || "处理所附经营资料"}{preview.files.length > 0 && ` · ${preview.files.length} 个附件`}</p><small>目标店铺：{preview.targetShop?.name ?? "不指定店铺"}。后续未指定店铺的任务沿用当前选择。<br />当前仅预览交互，附件未上传，未创建真实会话。</small></div><button type="button" aria-label="关闭任务预览" onClick={() => setPreview(null)}><X size={16} /></button></div>}</div>
        <section className={s.promptGuide} aria-labelledby="store-prompt-heading">
          <h2 id="store-prompt-heading">尝试以下提示词</h2>
          <div className={s.promptTabs} role="tablist" aria-label="提示词分类">
            {promptGroups.map((group, index) => <button key={group.id} id={`store-prompt-tab-${group.id}`} type="button" role="tab" aria-selected={promptGroup === group.id} aria-controls={`store-prompt-panel-${group.id}`} tabIndex={promptGroup === group.id ? 0 : -1} onClick={() => setPromptGroup(group.id)} onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % promptGroups.length : event.key === "ArrowLeft" ? (index + promptGroups.length - 1) % promptGroups.length : event.key === "Home" ? 0 : event.key === "End" ? promptGroups.length - 1 : null;
              if (next === null) return;
              event.preventDefault(); setPromptGroup(promptGroups[next].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}>{group.name}</button>)}
          </div>
          {promptGroups.map(group => <div key={group.id} id={`store-prompt-panel-${group.id}`} role="tabpanel" aria-labelledby={`store-prompt-tab-${group.id}`} hidden={promptGroup !== group.id} className={s.promptList}>
            {group.prompts.map(prompt => <button key={prompt.label} type="button" className={s.promptItem} disabled={sending} onClick={() => { setText(prompt.text); setPreview(null); setError(""); inputRef.current?.focus(); }}>
              <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" /><span><strong>【{prompt.label}】</strong>{prompt.text}</span>
            </button>)}
          </div>)}
        </section>
      </section>
    </main>
  </div>;
}
