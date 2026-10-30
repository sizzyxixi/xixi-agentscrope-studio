"use client";
import { StudioButton, StudioTextarea, StudioInput, StudioSelect } from "../StudioControls";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Bot, ChartNoAxesCombined, ChevronDown, Compass, ImagePlus, Link2, Megaphone, Package, Plus, Search, Send, Settings2, ShoppingBag, Sparkles, Users, WandSparkles, X } from "lucide-react";
import type { Profile } from "./MoonClawWorkbench";
import styles from "./home.module.css";

type Agent = string[];
type Props = {
  profile: Profile;
  agents: Agent[];
  agentControl?: ReactNode;
  username: string;
  productCount: number;
  notice: string;
  onDismissNotice: () => void;
  onProfile: () => void;
  onListing: () => void;
  onProducts: () => void;
  onConnectors: () => void;
  onChat: (title: string, prompt: string) => void;
};

const artwork: Record<string, string> = {
  "亚马逊": "/moonclaw/amazon-cover.png",
  Shopee: "/moonclaw/shopee-cover.png",
  Temu: "/moonclaw/temu-cover.png",
};
const cases = [
  { title: "经营分析报告", image: "case-analysis.png", description: "从经营数据中发现策略建议和商机", prompt: "帮我梳理一份经营分析报告，先列出需要准备的数据和分析维度。" },
  { title: "构建领英推广贴", image: "case-linkedin.png", description: "从产品卖点出发，构建吸引买家的推广内容", prompt: "帮我构建一篇领英商品推广帖，请先和我确认产品卖点与目标买家。" },
  { title: "热门榜单机会挖掘", image: "case-opportunity.png", description: "从热门榜单中发现增长较快、竞争较小的产品机会", prompt: "我想从热门榜单中寻找商品机会，请先帮我确定市场和筛选标准。" },
];

export function MoonClawHome({ profile, agents, agentControl, username, productCount, notice, onDismissNotice, onProfile, onListing, onProducts, onConnectors, onChat }: Props) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [model, setModel] = useState("Auto");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const homeRef = useRef<HTMLElement>(null);
  useEffect(() => { homeRef.current?.closest(".aui-viewport")?.scrollTo({ top: 0, behavior: "instant" }); }, []);

  const context = `我的经营阶段是${profile.stage || "待确定"}；经营平台：${profile.platforms.join("、") || "待选择"}；目标市场：${profile.markets.join("、") || "待选择"}；经营类型：${profile.mode || "待选择"}；主营类目：${profile.category || "待确定"}。`;
  const matched = agents.filter(agent => profile.platforms.includes(agent[0]));
  const featured = showAll ? [...matched, ...agents.filter(agent => !profile.platforms.includes(agent[0]))] : matched;
  const startChat = (title: string, text: string) => onChat(title, `${context}\n${text}`);
  const shortcuts = [
    { label: "快速指引", icon: Compass, color: "pink", action: () => startChat("开店选择指引", "请结合我的经营阶段，帮我梳理下一步行动。") },
    { label: "选品开发", icon: ShoppingBag, color: "pink", action: () => startChat("选品助手", "我想寻找适合目标市场的商品方向。") },
    { label: "商品刊登", icon: WandSparkles, color: "blue", action: onListing },
    { label: "经营分析", icon: ChartNoAxesCombined, color: "orange", action: () => startChat("经营分析", "帮我梳理经营分析指标和需要准备的资料。") },
    { label: "营销创意", icon: ImagePlus, color: "teal", action: () => startChat("营销创意", "帮我围绕商品卖点策划营销内容。") },
    { label: "市场调研", icon: Search, color: "yellow", action: () => startChat("市场调研", "帮我制定目标市场的调研计划。") },
    { label: "客户运营", icon: Users, color: "violet", action: () => startChat("客户运营", "帮我整理客户运营与复购提升的行动清单。") },
  ];

  return <section ref={homeRef} className={styles.home} data-moonclaw-home aria-label="MoonClaw 个性化经营首页">
    <div className={styles.toolbar}>
      <div className={styles.profileTools}><StudioButton className={styles.profileButton} onClick={onProfile} title={`${username} · ${context}`}><Settings2 size={14} />经营画像</StudioButton></div>

    </div>
    <div className={styles.content}>
      {notice && <div className={styles.notice} role="status"><span>{notice}</span><StudioButton aria-label="关闭提示" onClick={onDismissNotice}><X size={14} /></StudioButton></div>}
      <div className={styles.hero}><span className={styles.heroLabel}>YOUR BUSINESS, REIMAGINED</span><h1>让经营有方向，让创意有结果</h1><p>从一个想法开始，和你的专属 Agent 一起完成下一步。</p></div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); if (prompt.trim()) startChat("跨境电商助手", `${prompt.trim()}${files.length ? `\n附件名称：${files.join("、")}` : ""}`); }}>
        <StudioTextarea ref={inputRef} aria-label="描述你的经营需求" rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="帮我分析该产品，输出卖点、目标人群、适合的跨境销售站点" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        {files.length > 0 && <div className={styles.files}>{files.map(name => <span key={name}><Package size={12} />{name}<StudioButton type="button" aria-label={`移除 ${name}`} onClick={() => setFiles(previous => previous.filter(file => file !== name))}><X size={12} /></StudioButton></span>)}</div>}
        <div className={styles.composerTools}>
          <div className={styles.leftTools}><StudioButton className={styles.addFile} type="button" aria-label="添加商品资料" onClick={() => uploadRef.current?.click()}><Plus size={19} /></StudioButton><StudioInput ref={uploadRef} type="file" multiple hidden onChange={event => { const names = Array.from(event.target.files ?? []).map(file => file.name); setFiles(previous => [...new Set([...previous, ...names])]); event.target.value = ""; }} />
            <div className={styles.agentControl}>{agentControl || <span className={styles.agentFallback}><Bot size={14} />跨境电商助手<ChevronDown size={10} /></span>}</div>
          </div>
          <div className={styles.rightTools}><label className={styles.modelPicker}><Sparkles size={13} /><StudioSelect aria-label="模型策略" value={model} onChange={event => setModel(event.target.value)}><option>Auto</option><option>快速响应</option><option>深度思考</option></StudioSelect></label><StudioButton className={styles.send} type="submit" aria-label="开始对话" disabled={!prompt.trim()}><Send size={17} /></StudioButton></div>
        </div>
      </form>
      <nav className={styles.shortcuts} aria-label="经营快捷功能">{shortcuts.map(({ label, icon: Icon, color, action }) => <StudioButton key={label} onClick={action}><span className={styles[color]}><Icon size={18} /></span>{label}</StudioButton>)}</nav>
      <div className={styles.sectionHeading}><h2>请选择一个专家帮你做店铺运营</h2><StudioButton onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? "收起" : "查看全部"}<ChevronDown size={13} /></StudioButton></div>
      {!featured.length && <div className={styles.noExperts}><p>当前经营平台暂无专属专家，你可以使用上方快捷功能，或直接和 MoonClaw 聊聊。</p><StudioButton onClick={() => startChat("MoonClaw 助手", "请结合我的经营平台，帮我梳理下一步计划。")}>开始对话 <ArrowRight size={14} /></StudioButton></div>}
      <div className={styles.experts}>{featured.map(agent => <article key={agent[0]} className={styles.expert}>
        <StudioButton className={styles.coverButton} aria-label={`与${agent[1]}开始对话`} onClick={() => startChat(agent[1], `我想和${agent[1]}聊聊下一步的经营计划。`)}>{artwork[agent[0]] ? <Image src={artwork[agent[0]]} alt={agent[0]} width={588} height={272} unoptimized /> : <span className={styles.coverFallback}><StoreMark platform={agent[0]} /></span>}</StudioButton>
        <div className={styles.expertBody}><h3>{agent[1]}</h3><p>{agent[2]}</p><div className={styles.expertFooter}><div className={styles.tags}><StudioButton onClick={onListing}>刊登</StudioButton><StudioButton onClick={() => startChat(agent[1], "请帮我梳理店铺经营分析。")}>经营分析</StudioButton><StudioButton onClick={() => startChat(agent[1], agent[0] === "亚马逊" ? "请帮我寻找选品机会。" : "请帮我规划营销活动。")}>{agent[0] === "亚马逊" ? "选品" : agent[0] === "Temu" ? "广告投流" : "营销活动"}</StudioButton></div><StudioButton className={styles.chatButton} onClick={() => startChat(agent[1], `我想和${agent[1]}聊聊下一步的经营计划。`)}>对话</StudioButton></div></div>
      </article>)}</div>
      <div className={styles.caseHeading}><h2>使用案例</h2></div>
      <div className={styles.cases}>{cases.map(item => <StudioButton key={item.title} className={styles.caseCard} onClick={() => startChat(item.title, item.prompt)}><Image src={`/moonclaw/${item.image}`} alt={item.title} width={590} height={442} unoptimized /><strong>{item.title}</strong><p>{item.description}</p></StudioButton>)}</div>
      <div className={styles.resources}><StudioButton onClick={onProducts}><Package size={15} />我的商品池<span>{productCount}</span><ArrowRight size={13} /></StudioButton><StudioButton onClick={onConnectors}><Link2 size={15} />连接商品系统<ArrowRight size={13} /></StudioButton></div>
    </div>
  </section>;
}
function StoreMark({ platform }: { platform: string }) { return <><Megaphone size={30} /><strong>{platform}</strong></>; }
