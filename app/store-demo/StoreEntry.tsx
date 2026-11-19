"use client";
import { randomId } from '../../lib/browser-id';

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Check, ChevronRight, Send, FileText, Paperclip, Plus, Sparkles, Store, X } from "lucide-react";
import type { AgentProfile } from "../AgentEditor";
import { TargetShopPicker, type TargetShop } from "./TargetShopPicker";
import marketPreview from "./market-preview.json";
import s from "./store-demo.module.css";
import { publicationAgentId, publicationPrompt, publicationProductName, publicationSkuCount, type ProductPublicationContext } from "../product-publication";

type Agent = Pick<AgentProfile, "id" | "name" | "enabled" | "config">;
type Attachment = { id: string; file: File };
export type StoreTask = { agent: Agent; text: string; files: File[]; targetShop: TargetShop | null; publication?: ProductPublicationContext };
const initialAgents: Agent[] = marketPreview;
const promptGroups = [
  { id: "selection", name: "本土现货", prompts: [
    { label: "趋势爆品", text: "帮我推荐 TikTok 近 30 天内在美区的美容护理趋势爆品。" },
    { label: "趋势爆品", text: "帮我查看 TikTok 美妆品类中利润空间较好的新品窗口机会。请按利润空间从高到低排序，并给出推荐理由。" },
    { label: "新品机会", text: "帮我找美国本土有价格竞争优势、能快速起量的优质现货。" },
    { label: "本土现货", text: "根据我提供的商品资料，整理适合 TikTok Shop 美区的刊登草稿，包含标题、卖点、详情描述和待补充的商品属性。" },
    { label: "本土现货", text: "帮我推荐 TikTok 近 30 天内在美区的美容护理趋势爆品。" },
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

function agentLabel(agent: Agent) {
  if (agent.id === "main") return { name: "MoonClaw", role: "助手" };
  const name = agent.id === "official-amazon" ? "Amazon" : agent.name.split(" ")[0];
  return { name: /^temu$/i.test(name) ? "TEMU" : name, role: /半托/.test(agent.name) ? "半托管店铺运营" : /跨境/.test(agent.name) ? "跨境店铺运营" : "店铺运营" };
}

function Artwork({ agent }: { agent: Agent }) {
  const [failed, setFailed] = useState(false);
  const src = agent.id === "main" ? "/store/moonclaw.png" : agent.config.avatar;
  return <span className={s.artwork}>
    {src && (src.startsWith("https://") || src.startsWith("/")) && !failed ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" onError={() => setFailed(true)} /> : <Store size={22} strokeWidth={1.5} />}
  </span>;
}

export default function StoreEntry({ embedded = false, token = "", accountId = "guest", onSend, publicationContext }: { embedded?: boolean; token?: string; accountId?: string; onSend?:(task:StoreTask)=>Promise<void>; publicationContext?: ProductPublicationContext }) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [target, setTarget] = useState<{ agentId: string; accountId: string; shop: TargetShop | null } | null>(() => publicationContext ? {
    agentId: publicationAgentId(publicationContext.shop.platform), accountId,
    shop: { id: publicationContext.shop.id, name: publicationContext.shop.name, site: publicationContext.shop.site, type: '', authorized: true },
  } : null);
  const [selectedId, setSelectedId] = useState(publicationContext ? publicationAgentId(publicationContext.shop.platform) : "main");
  const [text, setText] = useState(publicationContext ? publicationPrompt(publicationContext) : "");
  const [attachedPublication, setAttachedPublication] = useState(publicationContext);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [promptGroup, setPromptGroup] = useState<PromptGroup>("selection");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRowRef = useRef<HTMLDivElement>(null);
  const cardPositions = useRef<Map<string, DOMRect> | null>(null);
  const reorderAnimations = useRef<Animation[]>([]);
  const sendingRef = useRef(false);
  const dragDepth = useRef(0);
  const contextAgentId = publicationContext ? publicationAgentId(publicationContext.shop.platform) : '';
  const publicationAgent = publicationContext && !agents.some(agent=>agent.id===contextAgentId) ? { id:contextAgentId,name:`${publicationContext.shop.platform} 店铺运营`,enabled:true,config:{description:`${publicationContext.shop.platform} 店铺运营智能体`} } : null;
  const visibleAgents = publicationAgent ? [...agents,publicationAgent] : agents;
  const current = visibleAgents.find(agent => agent.id === selectedId) ?? visibleAgents[0];

  useEffect(() => {
    if (publicationContext) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
    }
  }, [publicationContext]);

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

  useEffect(() => {
    const element = inputRef.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(Math.max(element.scrollHeight, 96), 300)}px`; }
  }, [text]);

  useLayoutEffect(() => {
    const row = cardRowRef.current;
    const previous = cardPositions.current;
    cardPositions.current = null;
    if (!row || !previous) return;

    // Measure the new order after removing any interrupted animation transforms.
    reorderAnimations.current.forEach(animation => animation.cancel());
    row.scrollTo({ left: 0, behavior: "instant" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      delete row.dataset.reordering;
      return;
    }

    const animations = Array.from(row.querySelectorAll<HTMLButtonElement>("[data-agent-id]")).flatMap(card => {
      const before = previous.get(card.dataset.agentId!);
      if (!before) return [];
      const after = card.getBoundingClientRect();
      const deltaX = before.left - after.left;
      const deltaY = before.top - after.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return [];
      return [card.animate([
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 460, easing: "cubic-bezier(.22, 1, .36, 1)" })];
    });
    reorderAnimations.current = animations;
    void Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (reorderAnimations.current !== animations) return;
      delete row.dataset.reordering;
      reorderAnimations.current = [];
    });
    return () => animations.forEach(animation => animation.cancel());
  }, [current?.id]);

  function choose(agent: Agent) {
    if (agent.id !== current?.id) {
      const row = cardRowRef.current;
      if (row) {
        // Capture visible positions so quick successive selections remain smooth.
        cardPositions.current = new Map(Array.from(row.querySelectorAll<HTMLButtonElement>("[data-agent-id]"), card => [card.dataset.agentId!, card.getBoundingClientRect()]));
        row.dataset.reordering = "true";
      }
      setTarget(null);
      setAttachedPublication(undefined);
    }
    setSelectedId(agent.id);
    setError("");
    inputRef.current?.focus({ preventScroll: true });
  }

  function addFiles(incoming: File[]) {
    const valid = incoming.filter(file => file.size <= 20 * 1024 * 1024);
    setFiles(previous => {
      const unique = valid.filter(file => !previous.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified));
      return [...previous, ...unique.map(file => ({ id: randomId(), file }))].slice(0, 10);
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

  async function submit() {
    if ((!text.trim() && !files.length) || sendingRef.current || !current) return;
    sendingRef.current=true;setSending(true);setError("");
    try {
      if(!onSend)throw new Error("请从店铺经营工作台发起对话。");
      await onSend({agent:current,text:text.trim(),files:files.map(item=>item.file),publication:attachedPublication,targetShop:target?.agentId===current.id&&target.accountId===accountId?target.shop:null});
      setText("");setFiles([]);setAttachedPublication(undefined);
    } catch(error) {setError(error instanceof Error?error.message:"发送失败，请重试。");}
    finally {sendingRef.current=false;setSending(false);}
  }

  const agentOrder = ["main", "official-amazon", "official-lazada", "official-temu", "official-shein"];
  const baseAgents = [...visibleAgents].sort((a, b) => {
    const rank = (id: string) => { const index = agentOrder.indexOf(id); return index < 0 ? agentOrder.length : index; };
    return rank(a.id) - rank(b.id);
  });
  const orderedAgents = current ? [current, ...baseAgents.filter(agent => agent.id !== current.id)] : baseAgents;

  function agentCard(agent: Agent) {
    const selected = current?.id === agent.id;
    const label = agentLabel(agent);
    return <button key={agent.id} type="button" data-agent-id={agent.id} className={`${s.agentCard} ${selected ? s.selected : ""}`} aria-label={agent.name} aria-pressed={selected} disabled={sending || (!!attachedPublication && !selected)} onClick={() => choose(agent)} title={agent.config.description}>
      <Artwork agent={agent} />
      <span className={s.cardName}>{label.name}</span><span className={s.cardRole}>{label.role}</span>
      {selected && <span className={s.selectedBadge} aria-label="已选择"><Check size={10} strokeWidth={2} /></span>}
    </button>;
  }

  return <div className={`${s.page}${embedded ? ` ${s.embedded}` : ""}`}>
    <main className={s.main}>
      <section className={s.workspace} aria-label="创建店铺经营任务">
        <div className={s.agentStage}>
          <div className={s.greeting}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.mascot} src="/store/mascot.png" alt="" />
            <h1>你好，<br />需要我帮你做什么</h1>
          </div>
          <div className={s.agentPicker}>
            <div ref={cardRowRef} className={s.cardRow} aria-label="选择经营智能体，可横向滚动">{orderedAgents.map(agentCard)}</div>
            <button type="button" className={s.nextAgents} aria-label="查看更多智能体" onClick={() => cardRowRef.current?.scrollBy({ left: 208, behavior: "smooth" })}><ChevronRight size={17} /></button>
          </div>
        </div>

        <form className={`${s.composer} ${dragging ? s.dragging : ""}`} onSubmit={event => { event.preventDefault(); submit(); }} onDragEnter={event => { event.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={onDrop} aria-busy={sending}>
          <label className={s.srOnly} htmlFor="store-task">描述你的店铺经营任务</label>
          <textarea id="store-task" ref={inputRef} value={text} onChange={event => { setText(event.target.value); }} onPaste={onPaste} disabled={sending} rows={3} placeholder={attachedPublication?"补充商品刊登要求…":"比如：帮我看看最近销量为什么下降，接下来该怎么调整…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
          {attachedPublication && <section className={s.publicationProducts} aria-label="已带入商品">
            <div className={s.publicationSummary}>{attachedPublication.products.length} 个商品 · {publicationSkuCount(attachedPublication)} 个 SKU</div>
            <div className={s.attachments}>{attachedPublication.products.map(product => <div key={product.id} className={`${s.file} ${s.productAttachment}`}>
              <span className={s.productThumb}>{product.image ? <Image src={product.image} alt={publicationProductName(product)} width={42} height={42} unoptimized/> : <Store size={22}/>}</span>
              <span><strong title={publicationProductName(product)}>{publicationProductName(product)}</strong><small title={product.skus.map(sku => sku.sku_code).join('、')}>{product.skus.length} 个 SKU · {product.skus.map(sku => sku.sku_code).join('、')}</small></span>
              <button type="button" aria-label={`移除带入商品 ${publicationProductName(product)}`} disabled={sending} onClick={() => setAttachedPublication(old => { if (!old) return old; const products = old.products.filter(item => item.id !== product.id); return products.length ? { ...old, products } : undefined; })}><X size={13}/></button>
            </div>)}</div>
          </section>}
          {files.length > 0 && <div className={s.attachments}>{files.map(item => <div key={item.id} className={s.file}><span className={s.fileIcon}><FileText size={19} /></span><span><strong title={item.file.name}>{item.file.name}</strong><small>{item.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(item.file.size / 1024))} KB` : `${(item.file.size / 1024 / 1024).toFixed(1)} MB`} · 已添加</small></span><button type="button" aria-label={`移除附件 ${item.file.name}`} disabled={sending} onClick={() => setFiles(previous => previous.filter(file => file.id !== item.id))}><X size={13} /></button></div>)}</div>}
          <div className={s.tools}>
            <div className={s.leftTools}><button type="button" className={s.add} aria-label="添加附件" title="添加附件，也可拖入文件" onClick={() => fileRef.current?.click()} disabled={sending}><Plus size={22} strokeWidth={1.6} /></button><input ref={fileRef} type="file" multiple hidden onChange={onFileChange} />{attachedPublication ? <span className={s.listingShop}><Store size={15}/>{attachedPublication.shop.name} · {attachedPublication.shop.site}</span> : current && <TargetShopPicker key={`${accountId}:${current.id}`} agentId={current.id} agentName={current.name} value={target?.agentId === current.id && target.accountId === accountId ? target.shop : null} disabled={sending} onChange={shop => { setTarget({ agentId: current.id, accountId, shop }); }} />}</div>
            <div className={s.rightTools}><button type="button" onClick={submit} className={s.send} aria-label="发送任务" disabled={(!text.trim() && !files.length) || sending || !current}>{sending ? <span className={s.spinner} /> : <Send size={16} fill="currentColor" strokeWidth={1.5} />}</button></div>
          </div>
          {dragging && <div className={s.dropOverlay}><Paperclip size={25} /><strong>松开，添加经营资料</strong></div>}
        </form>
        <div aria-live="polite">{error && <p role="alert" className={s.error}>{error}</p>}</div>
        <section className={s.promptGuide} aria-labelledby="store-prompt-heading">
          <h2 id="store-prompt-heading" className={s.srOnly}>尝试以下提示词</h2>
          <div className={s.promptTabs} role="tablist" aria-label="提示词分类">
            {promptGroups.map((group, index) => <button key={group.id} id={`store-prompt-tab-${group.id}`} type="button" role="tab" aria-selected={promptGroup === group.id} aria-controls={`store-prompt-panel-${group.id}`} tabIndex={promptGroup === group.id ? 0 : -1} onClick={() => setPromptGroup(group.id)} onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % promptGroups.length : event.key === "ArrowLeft" ? (index + promptGroups.length - 1) % promptGroups.length : event.key === "Home" ? 0 : event.key === "End" ? promptGroups.length - 1 : null;
              if (next === null) return;
              event.preventDefault(); setPromptGroup(promptGroups[next].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}>{group.name}</button>)}
          </div>
          {promptGroups.map(group => <div key={group.id} id={`store-prompt-panel-${group.id}`} role="tabpanel" aria-labelledby={`store-prompt-tab-${group.id}`} hidden={promptGroup !== group.id} className={s.promptList}>
            {group.prompts.map(prompt => <button key={`${prompt.label}:${prompt.text}`} type="button" className={s.promptItem} disabled={sending} onClick={() => { setText(prompt.text); setError(""); inputRef.current?.focus(); }}>
              <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" /><span><strong>【{prompt.label}】</strong>{prompt.text}</span>
            </button>)}
          </div>)}
        </section>
      </section>
    </main>
  </div>;
}
