"use client";
import { StudioButton, StudioInput, StudioTextarea, StudioSelect } from "../StudioControls";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Globe2, Layers3, Link2, MessageCircle, Package, Plus, Search, Settings2, Sparkles, Store, TrendingUp, Upload, X } from "lucide-react";
import styles from "./workbench.module.css";
import { MoonClawHome } from "./MoonClawHome";

export type Profile = { stage: string; platforms: string[]; markets: string[]; mode: string; category: string };
type Product = { id: string; name: string; sku: string; price: number; stock: number; color: string };
type Shop = { id: string; platform: string; type: string; name: string };
type Page = "welcome" | "home" | "listing" | "products" | "connectors";
const platforms = ["TikTok Shop", "Temu", "Shopee", "亚马逊", "WB", "Ozon", "Yandex", "Lazada", "1688", "速卖通", "SHEIN", "美客多", "Shopify", "Joom", "Qoo10", "amag"];
const markets = ["东南亚", "北美", "欧洲", "俄罗斯及独联体", "拉丁美洲", "中东", "日韩", "中国"];
const modes = ["精品", "精铺", "铺货", "还不确定"];
const stages = [{ name: "筹备开店", description: "从选市场、选平台开始", icon: Globe2 }, { name: "已经开店", description: "做好选品与日常经营", icon: Store }, { name: "规模运营", description: "多店协同，让增长更高效", icon: TrendingUp }, { name: "其他", description: "先和助手聊聊我的需求", icon: MessageCircle }];
const initialProfile: Profile = { stage: "", platforms: [], markets: [], mode: "", category: "" };
const seedProducts: Product[] = [
  { id: "demo-1", name: "奶油色桌面收纳盒", sku: "WM-ST-001", price: 12.9, stock: 240, color: "#eee5d6" },
  { id: "demo-2", name: "便携不锈钢保温杯", sku: "WM-CUP-002", price: 18.5, stock: 180, color: "#dce8e0" },
  { id: "demo-3", name: "折叠旅行收纳包", sku: "WM-BAG-003", price: 9.9, stock: 360, color: "#e5dff0" },
];
// Names mirror the existing official marketplace catalog; no backend requests are made.
const agentCatalog = [
  ["亚马逊", "亚马逊选品专员", "发现需求与利润空间，找到下一款潜力商品。"],
  ["Shopee", "Shopee 本土店铺运营管家", "从本地化上新到活动规划，陪你做好东南亚生意。"],
  ["Temu", "Temu 半托店铺运营管家", "理清供货、履约和库存节奏。"],
  ["Lazada", "Lazada 店铺运营管家", "优化商品内容，规划站点促销。"],
  ["SHEIN", "Shein 半托店铺运营管家", "款式上新、尺码与备货协同。"],
  ["TikTok Shop", "TikTok 自运营店铺管家", "串联内容、达人与店铺经营。"],
  ["WB", "Wildberries 店铺运营管家", "做好俄语商品本地化与库存管理。"],
  ["1688", "1688 店铺运营管家", "优化商品信息与采购询盘承接。"],
  ["速卖通", "Aliexpress 店铺运营管家", "多语种商品内容与跨境经营规划。"],
];
const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];

function Chips({ values, selected, onChange, hot = false }: { values: string[]; selected: string[]; onChange: (v: string) => void; hot?: boolean }) {
  return <div className={styles.chips}>{values.map((value, index) => <StudioButton type="button" key={value} aria-pressed={selected.includes(value)} className={selected.includes(value) ? styles.chipSelected : ""} onClick={() => onChange(value)}>{selected.includes(value) && <Check size={13} />}{value}{hot && index < 4 && <small>热门</small>}</StudioButton>)}</div>;
}
function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <div className={styles.field}><div className={styles.fieldTitle}>{title}{hint && <span>{hint}</span>}</div>{children}</div>;
}

export function MoonClawWorkbench({ accountId, username, agentControl, onStartConversation }: { accountId: string; username: string; agentControl?: ReactNode; onStartConversation: (title: string, prompt: string) => void }) {
  const storageKey = `moonclaw-workbench-demo-v1:${accountId}`;
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState<Page>("welcome");
  const [onboardStep, setOnboardStep] = useState(0);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [shops, setShops] = useState<Shop[]>([]);
  const [erp, setErp] = useState("");
  const [connectedErps, setConnectedErps] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [connectorOrigin, setConnectorOrigin] = useState<Page>("home");
  const [notice, setNotice] = useState("");
  const [listingStep, setListingStep] = useState(0);
  const [source, setSource] = useState("商品池");
  const [sourceInput, setSourceInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listingItems, setListingItems] = useState<Product[]>([]);
  const [shopPlatform, setShopPlatform] = useState("Shopee");
  const [shopType, setShopType] = useState("本土店");
  const [shopName, setShopName] = useState("");
  const [selectedShop, setSelectedShop] = useState("");
  const [showConnectShop, setShowConnectShop] = useState(false);
  const [publishMode, setPublishMode] = useState("发布到未上架");
  const [options, setOptions] = useState(["AI 生成标题", "AI 生成图片", "AI 生成描述", "上传商品视频"]);
  const [special, setSpecial] = useState<Record<string, { title: string; price: string; stock: string; bundle: string }>>({});
  const [taskCreated, setTaskCreated] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Restore browser-only data after hydration; cancel when the account changes.
    const frame = requestAnimationFrame(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.profileFlowVersion === 2 && data.profile && typeof data.profile.stage === "string" && Array.isArray(data.profile.platforms) && Array.isArray(data.profile.markets) && typeof data.profile.mode === "string" && typeof data.profile.category === "string") { setProfile(data.profile); setSavedProfile(data.profile); setPage("home"); }
        else if (data.profileFlowVersion === 2 && data.draftProfile && typeof data.draftProfile.stage === "string" && Array.isArray(data.draftProfile.platforms) && Array.isArray(data.draftProfile.markets) && typeof data.draftProfile.mode === "string" && typeof data.draftProfile.category === "string") { setProfile(data.draftProfile); setOnboardStep(data.draftProfile.stage ? 1 : 0); }
        if (Array.isArray(data.products) && data.products.every((p: Product) => typeof p.id === "string" && typeof p.name === "string" && typeof p.sku === "string" && Number.isFinite(p.price) && Number.isFinite(p.stock))) setProducts(data.products);
        if (Array.isArray(data.shops) && data.shops.every((s: Shop) => typeof s.id === "string" && typeof s.name === "string" && typeof s.platform === "string" && typeof s.type === "string")) setShops(data.shops);
        if (Array.isArray(data.erps) && data.erps.every((e: unknown) => typeof e === "string")) setConnectedErps(data.erps);
      }
    } catch { /* A cleared or unavailable browser store starts a fresh demo. */ }
    setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ profileFlowVersion: 2, profile: savedProfile, draftProfile: profile, products, shops, erps: connectedErps })); } catch { /* The demo remains usable without persistence. */ }
  }, [ready, savedProfile, profile, products, shops, connectedErps, storageKey]);
  useEffect(() => { rootRef.current?.scrollIntoView({ block: "start" }); }, [ready, page, listingStep, onboardStep]);

  const patchProfile = (patch: Partial<Profile>) => setProfile(previous => ({ ...previous, ...patch }));
  const saveProfile = () => { setSavedProfile(profile); setPage("home"); setNotice(""); };
  const openListing = (ids: string[] = []) => { setSelectedIds(ids); setSource("商品池"); setSourceInput(""); setListingStep(0); setTaskCreated(false); setListingItems([]); setNotice(""); setPage("listing"); };
  const openChat = (title: string, prompt: string) => onStartConversation(title, prompt);
  const startOtherConversation = () => onStartConversation("新的经营会话", "我想先直接聊聊，请帮我梳理我的需求。");
  const context = `我的经营阶段是${profile.stage || "待确定"}，平台：${profile.platforms.join("、") || "待选择"}，市场：${profile.markets.join("、") || "待选择"}，经营类型：${profile.mode || "待选择"}，类目：${profile.category || "待确定"}。`;
  const selectedProducts = products.filter(p => selectedIds.includes(p.id));
  const currentShop = shops.find(shop => shop.id === selectedShop);
  const canFinishProfile = profile.platforms.length > 0 && profile.markets.length > 0 && !!profile.mode && (profile.stage === "筹备开店" || !!profile.category.trim());

  function resolveProducts() {
    if (source === "商品池" || source === "外部商品系统") {
      const picked = selectedProducts;
      if (!picked.length) { setNotice("请至少选择一个商品。"); return; }
      setListingItems(picked);
    } else {
      const entries = sourceInput.split(/[\n,，;；]/).map(s => s.trim()).filter(Boolean);
      if (!entries.length) { setNotice("请先输入商品链接或 SKU。"); return; }
      if (entries.length > 10) { setNotice("每次最多选择 10 个商品。"); return; }
      if (source === "外部商品链接" && entries.some(value => { try { return !["https:", "http:"].includes(new URL(value).protocol); } catch { return true; } })) { setNotice("请输入有效的 http 或 https 商品链接，每行一个。"); return; }
      setListingItems(entries.map((value, i) => ({ id: `source-${i}`, name: source === "西之月货品" ? `西之月商品 ${i + 1}` : `链接商品 ${i + 1}`, sku: /^https?:/.test(value) ? `LINK-${String(i + 1).padStart(3, "0")}` : value, price: 0, stock: 0, color: "#e8e2f3" })));
    }
    setSpecial({}); setNotice(""); setListingStep(1);
  }
  function connectShop() {
    if (!shopName.trim()) return;
    const shop = { id: crypto.randomUUID(), platform: shopPlatform, type: shopType, name: shopName.trim() };
    setShops(previous => [...previous, shop]); setSelectedShop(shop.id); setShowConnectShop(false); setShopName(""); setNotice("店铺资料已保存。");
  }
  async function importCsv(file: File) {
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
      for (let i = 0; i < text.length; i++) { const char = text[i]; if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; }
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      if (quoted || rows.length < 2) throw new Error("CSV 格式不正确，请使用模板填写。");
      const header = rows[0].map(s => s.toLowerCase());
      const nameIndex = header.findIndex(s => ["name", "商品名称", "名称"].includes(s));
      const skuIndex = header.indexOf("sku"), priceIndex = header.findIndex(s => ["price", "价格"].includes(s)), stockIndex = header.findIndex(s => ["stock", "库存"].includes(s));
      if ([nameIndex, skuIndex, priceIndex, stockIndex].some(i => i < 0)) throw new Error("请包含 name、sku、price、stock 四个表头，可下载模板。");
      const imported = rows.slice(1).map((r, i) => {
        const price = Number(r[priceIndex]), stock = Number(r[stockIndex]);
        if (!r[nameIndex] || !r[skuIndex] || !r[priceIndex] || !r[stockIndex] || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) throw new Error(`第 ${i + 2} 行数据不完整，价格和库存需为非负数，库存需为整数。`);
        return { id: crypto.randomUUID(), name: r[nameIndex], sku: r[skuIndex], price, stock, color: "#e6e0ee" };
      });
      if (new Set(imported.map(p => p.sku)).size !== imported.length || imported.some(p => products.some(existing => existing.sku === p.sku))) throw new Error("存在重复 SKU，请检查后重新导入。");
      setProducts(previous => [...previous, ...imported]); setImporting(false); setNotice(`成功导入 ${imported.length} 个商品。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "导入失败，请检查文件。"); }
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["\uFEFFname,sku,price,stock\n商品资料,MY-SKU-001,19.9,100\n"], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "商品导入模板.csv"; a.click(); URL.revokeObjectURL(url);
  }
  const title = page === "welcome" ? "认识你，是一起做好生意的第一步" : page === "listing" ? "把好商品，带到新市场" : page === "products" ? "你的商品，集中管理" : page === "connectors" ? "连接你的商品系统" : `你好，${username}`;

  if (!ready) return <section className={`${styles.root} ${styles.onboarding}`}><p>正在准备你的工作台…</p></section>;
  if (page === "home") return <MoonClawHome
    profile={profile} agents={agentCatalog} username={username} agentControl={agentControl}
    productCount={products.length} notice={notice} onDismissNotice={() => setNotice("")}
    onProfile={() => { setOnboardStep(0); setPage("welcome"); setNotice(""); }}
    onListing={() => openListing()}
    onProducts={() => { setSelectedIds([]); setPage("products"); setNotice(""); }}
    onConnectors={() => { setConnectorOrigin("home"); setPage("connectors"); setNotice(""); }}
    onChat={openChat}
  />;
  return <section className={`${styles.root} ${page === "welcome" ? styles.onboarding : ""}`} ref={rootRef} aria-label="MoonClaw 跨境经营工作台">
    <header className={styles.topbar}><div className={styles.brand}><span className={styles.brandIcon}><Sparkles size={17} /></span><span>MoonClaw <b>经营工作台</b></span></div></header>
    <div className={styles.heading}>{page !== "welcome" && <StudioButton className={styles.back} onClick={() => { setNotice(""); setPage(page === "connectors" ? connectorOrigin : "home"); }}><ArrowLeft size={15} />{(page === "connectors" && connectorOrigin === "listing") ? "返回上一步" : "返回工作台"}</StudioButton>}<div className={styles.headingRow}><div><h1>{title}</h1><p>{page === "welcome" ? "告诉我你的经营方向，为你找到合适的助手与工具。" : page === "listing" ? "选好商品与店铺，其余配置按需调整。" : page === "products" ? "导入、维护商品资料，随时选择商品发起刊登。" : page === "connectors" ? "能力市场 / 连接器 / ERP 项目" : ""}</p></div></div></div>
    {notice && <div className={styles.notice} role="status">{notice}<StudioButton aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></StudioButton></div>}

    {page === "welcome" && <div className={styles.panel}>
      <div className={styles.steps}><span className={onboardStep === 0 ? styles.activeStep : ""}>01 经营阶段</span><i /><span className={onboardStep === 1 ? styles.activeStep : ""}>02 经营方向</span></div>
      {onboardStep === 0 ? <><h2>你的生意，走到哪一步了？</h2><p className={styles.muted}>我们会根据你的阶段，调整工作台的推荐内容。</p><div className={styles.stageGrid}>{stages.map(({ name, description, icon: Icon }) => <StudioButton className={`${styles.stageCard} ${profile.stage === name ? styles.selectedCard : ""}`} key={name} onClick={() => name === "其他" ? startOtherConversation() : patchProfile({ stage: name })} aria-pressed={name === "其他" ? undefined : profile.stage === name}><span className={styles.stageIcon}><Icon size={23} /></span><strong>{name}</strong><span>{description}</span><span className={styles.radio}>{profile.stage === name && <span />}</span></StudioButton>)}</div><div className={styles.footer}><StudioButton className={styles.textButton} onClick={() => { if (savedProfile) { setProfile(savedProfile); setPage("home"); setNotice(""); } else startOtherConversation(); }}>{savedProfile ? "取消修改" : "直接开始对话"}</StudioButton><StudioButton className={styles.primary} disabled={!profile.stage} onClick={() => setOnboardStep(1)}>下一步 <ArrowRight size={15} /></StudioButton></div></> : <>
        <h2>{profile.stage === "筹备开店" ? "你想在哪里，开始这门生意？" : "了解一下你正在经营的生意"}</h2>
        <Field title={profile.stage === "筹备开店" ? "目标经营平台" : "经营平台"} hint="可多选"><Chips values={platforms} selected={profile.platforms} hot onChange={v => patchProfile({ platforms: toggle(profile.platforms, v) })} /></Field>
        <Field title={profile.stage === "筹备开店" ? "目标市场" : "经营市场"} hint="可多选"><Chips values={markets} selected={profile.markets} onChange={v => patchProfile({ markets: toggle(profile.markets, v) })} /></Field>
        <Field title={profile.stage === "筹备开店" ? "目标经营类型" : "经营类型"}><Chips values={modes} selected={[profile.mode]} onChange={v => patchProfile({ mode: v })} /></Field>
        {profile.stage !== "筹备开店" && <label className={styles.field}>主营类目<StudioInput maxLength={80} placeholder="例如：家居收纳、服饰配件" value={profile.category} onChange={e => patchProfile({ category: e.target.value })} /></label>}
        {profile.stage === "筹备开店" && <StudioButton className={styles.helpCard} onClick={() => openChat("开店选择指引", `${context}帮我看看平台、市场和经营类型应该怎么选。`)}><Sparkles size={18} /><span><strong>帮我看看应该怎么选</strong><small>和助手聊聊，根据你的情况找到起点</small></span><ArrowRight size={17} /></StudioButton>}
        <div className={styles.footer}><StudioButton className={styles.textButton} onClick={() => setOnboardStep(0)}><ArrowLeft size={14} />上一步</StudioButton><StudioButton className={styles.primary} disabled={!canFinishProfile} onClick={saveProfile}>进入我的工作台 <ArrowRight size={15} /></StudioButton></div>
      </>}
    </div>}

    {page === "listing" && <div className={styles.panel}>
      <div className={styles.steps}>{["选择商品", "目标店铺与配置", "核对任务"].map((s, i) => <span key={s} className={listingStep === i ? styles.activeStep : ""}>{i + 1 < listingStep + 1 ? "✓" : `0${i + 1}`} {s}</span>)}</div>
      {taskCreated ? <div className={styles.success}><span><CircleCheck size={38} /></span><h2>刊登草稿已保存</h2><p>已整理 {listingItems.length} 个商品的刊登资料。</p><div className={styles.summary}>目标店铺：{currentShop?.name}<br />{publishMode}</div><StudioButton className={styles.primary} onClick={() => setPage("home")}>返回工作台</StudioButton><StudioButton className={styles.textButton} onClick={() => openListing()}>再创建一轮刊登</StudioButton></div> : listingStep === 0 ? <>
        <h2>这次要刊登的商品，来自哪里？</h2><div className={styles.sourceTabs}>{["商品池", "西之月货品", "外部商品链接", "外部商品系统"].map(s => <StudioButton aria-pressed={source === s} className={source === s ? styles.tabActive : ""} key={s} onClick={() => { setSource(s); setNotice(""); }}>{s}</StudioButton>)}</div>
        {source === "外部商品系统" && <><Field title="你的外部商品目前维护在哪里？"><Chips values={["领星 ERP", "店小秘", "马帮 ERP", "其他系统"]} selected={[erp]} onChange={setErp} /></Field>{erp === "其他系统" && <label className={styles.field}>系统名称<StudioInput value={project} onChange={e => setProject(e.target.value)} placeholder="输入你的 ERP 或商品系统名称" /></label>}{erp && !connectedErps.includes(erp === "其他系统" ? project : erp) && <div className={styles.empty}><Link2 size={28} /><strong>连接后，就能直接选择商品</strong><p>在能力市场的连接器中配置你的 ERP 项目。</p><div className={styles.inline}><StudioButton className={styles.primary} disabled={erp === "其他系统" && !project.trim()} onClick={() => { setConnectorOrigin("listing"); setPage("connectors"); }}>前往配置连接器</StudioButton><StudioButton className={styles.textButton} onClick={() => openChat("连接商品系统", `如何连接我的${erp === "其他系统" ? project || "ERP" : erp}商品进来刊登？`)}>如何连接？</StudioButton></div></div>}</>}
        {(source === "商品池" || (source === "外部商品系统" && erp && connectedErps.includes(erp === "其他系统" ? project : erp))) && <><div className={styles.sectionHeading}><p className={styles.muted}>{source === "商品池" ? "选择本轮要刊登的商品及 SKU" : "待刊登商品"}</p><span>已选 {selectedProducts.length} 个</span></div><div className={styles.productChoices}>{products.map(p => <label className={styles.productChoice} key={p.id}><StudioInput type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => setSelectedIds(toggle(selectedIds, p.id))} /><span className={styles.productThumb} style={{ background: p.color }}><Package size={20} /></span><span><strong>{p.name}</strong><small>{p.sku}</small></span><span className={styles.stock}>库存 {p.stock}</span></label>)}</div>{!products.length && <p className={styles.muted}>商品池为空，请先导入商品。</p>}<StudioButton className={styles.textButton} onClick={() => { setPage("products"); setNotice(""); }}>管理或导入商品 <ArrowRight size={14} /></StudioButton></>}
        {(source === "西之月货品" || source === "外部商品链接") && <Field title={source === "西之月货品" ? "商品 SKU 或链接" : "商品链接"} hint="每行一个，最多 10 个"><StudioTextarea rows={4} value={sourceInput} onChange={e => setSourceInput(e.target.value)} placeholder={source === "西之月货品" ? "例如 WM-ST-001\n或粘贴西之月商品链接" : "https://example.com/product/123"} /><p className={styles.muted}>请核对商品名称与 SKU 后保存草稿。</p></Field>}
        <div className={styles.footer}><span className={styles.muted}>先选商品，再选目标店铺</span><StudioButton className={styles.primary} disabled={source === "外部商品系统" && (!erp || !connectedErps.includes(erp === "其他系统" ? project : erp))} onClick={resolveProducts}>下一步 <ArrowRight size={15} /></StudioButton></div>
      </> : listingStep === 1 ? <>
        <h2>选择刊登的目标店铺</h2><p className={styles.muted}>已选 {listingItems.length} 个商品</p>
        <div className={styles.shopGrid}>{shops.map(shop => <StudioButton key={shop.id} aria-pressed={selectedShop === shop.id} className={`${styles.shopCard} ${selectedShop === shop.id ? styles.selectedCard : ""}`} onClick={() => setSelectedShop(shop.id)}><Store size={20} /><strong>{shop.name}</strong><small>{shop.platform} · {shop.type}</small>{selectedShop === shop.id && <Check size={16} />}</StudioButton>)}<StudioButton className={styles.addShop} onClick={() => setShowConnectShop(!showConnectShop)}><Plus size={20} />{shops.length ? "连接新店铺" : "连接你的第一家店铺"}</StudioButton></div>
        {(showConnectShop || !shops.length) && <div className={styles.inset}><h3>填写店铺资料</h3><div className={styles.formGrid}><label>平台<StudioSelect value={shopPlatform} onChange={e => setShopPlatform(e.target.value)}>{platforms.map(p => <option key={p}>{p}</option>)}</StudioSelect></label><label>店铺类型<StudioSelect value={shopType} onChange={e => setShopType(e.target.value)}>{["本土店", "跨境店", "半托管", "全托管"].map(t => <option key={t}>{t}</option>)}</StudioSelect></label><label>店铺名称 / 站点<StudioInput value={shopName} onChange={e => setShopName(e.target.value)} placeholder="例如：Shopee 印尼一店" maxLength={60} /></label></div><StudioButton className={styles.primary} disabled={!shopName.trim()} onClick={connectShop}>保存店铺资料</StudioButton></div>}
        <Field title="发布方式"><Chips values={["发布到未上架", "正常发布"]} selected={[publishMode]} onChange={setPublishMode} /></Field>
        <details className={styles.details}><summary><Settings2 size={16} />更多个性化配置<span>按需调整</span><ChevronDown size={15} /></summary><h3>本批次统一设置</h3><div className={styles.optionGrid}>{["AI 生成标题", "AI 生成图片", "AI 生成描述", "上传商品视频", "缺少资质时提示补充", "本批次统一预售"].map(option => <label key={option}><StudioInput type="checkbox" checked={options.includes(option)} onChange={() => setOptions(toggle(options, option))} />{option}</label>)}</div><h3>单 SKU 特殊要求</h3>{listingItems.map(item => <div className={styles.override} key={item.id}><strong>{item.sku}</strong><div className={styles.formGrid}>{[{ key: "title", label: "指定标题", type: "text" }, { key: "price", label: "指定价格", type: "number" }, { key: "stock", label: "指定库存", type: "number" }, { key: "bundle", label: "多件装 / 组合装", type: "text" }].map(field => <label key={field.key}>{field.label}<StudioInput type={field.type} min="0" step={field.key === "price" ? "0.01" : field.key === "stock" ? "1" : undefined} value={special[item.id]?.[field.key as "title"] ?? ""} onChange={e => setSpecial(previous => ({ ...previous, [item.id]: { ...(previous[item.id] ?? { title: "", price: "", stock: "", bundle: "" }), [field.key]: e.target.value } }))} placeholder="沿用默认" /></label>)}</div></div>)}</details>
        <div className={styles.footer}><StudioButton className={styles.textButton} onClick={() => { setListingStep(0); setNotice(""); }}>上一步</StudioButton><StudioButton className={styles.primary} disabled={!currentShop} onClick={() => { if (Object.values(special).some(v => (v.price && (!Number.isFinite(Number(v.price)) || Number(v.price) < 0)) || (v.stock && (!Number.isInteger(Number(v.stock)) || Number(v.stock) < 0)))) { setNotice("特殊要求中的价格需为非负数，库存需为非负整数。"); return; } setNotice(""); setListingStep(2); }}>核对任务 <ArrowRight size={15} /></StudioButton></div>
      </> : <><h2>准备就绪，核对本轮刊登任务</h2><div className={styles.summary}><div><span>商品来源</span><strong>{source}{source === "外部商品系统" ? ` · ${erp === "其他系统" ? project : erp}` : ""}</strong></div><div><span>目标店铺</span><strong>{currentShop?.platform} · {currentShop?.type} · {currentShop?.name}</strong></div><div><span>发布方式</span><strong>{publishMode}</strong></div><div><span>统一配置</span><strong>{["自动匹配类目与属性", ...options].join("、")}</strong></div></div><div className={styles.productChoices}>{listingItems.map(item => <div className={styles.reviewProduct} key={item.id}><Package size={18} /><div><strong>{item.name}</strong><small>{item.sku}</small>{special[item.id] && Object.values(special[item.id]).some(Boolean) && <small>特殊要求：{Object.entries(special[item.id]).filter(([, v]) => v).map(([k, v]) => `${({ title: "标题", price: "价格", stock: "库存", bundle: "组合装" } as Record<string, string>)[k]} ${v}`).join(" · ")}</small>}</div></div>)}</div><div className={styles.footer}><StudioButton className={styles.textButton} onClick={() => setListingStep(1)}>返回修改</StudioButton><StudioButton className={styles.primary} onClick={() => { setTaskCreated(true); setNotice(""); }}><Check size={15} />保存任务草稿</StudioButton></div></>}
    </div>}

    {page === "products" && <div className={styles.panel}><div className={styles.productToolbar}><label className={styles.search}><Search size={15} /><StudioInput aria-label="搜索商品" placeholder="搜索商品名称或 SKU" value={query} onChange={e => setQuery(e.target.value)} /></label><StudioButton className={styles.secondary} onClick={() => setImporting(!importing)}><Upload size={14} />导入商品</StudioButton><StudioButton className={styles.primary} onClick={() => { setEditing({ id: crypto.randomUUID(), name: "", sku: "", price: 0, stock: 0, color: "#eee5d6" }); setNotice(""); }}><Plus size={14} />新增商品</StudioButton></div>
      {importing && <div className={styles.inset}><h3>通过 CSV 导入商品</h3><p className={styles.muted}>包含商品名称、SKU、价格与库存。可先下载模板填写，数据仅保存在当前浏览器。</p><div className={styles.inline}><StudioButton className={styles.secondary} onClick={downloadTemplate}>下载 CSV 模板</StudioButton><StudioButton className={styles.primary} onClick={() => fileRef.current?.click()}>选择 CSV 文件</StudioButton><StudioInput hidden type="file" accept=".csv,text/csv" ref={fileRef} onChange={e => { const file = e.target.files?.[0]; if (file) void importCsv(file); e.target.value = ""; }} /></div></div>}
      {editing && <form className={styles.inset} onSubmit={e => { e.preventDefault(); if (products.some(p => p.sku === editing.sku.trim() && p.id !== editing.id)) { setNotice("该 SKU 已存在，请使用不同的 SKU。"); return; } setProducts(previous => [...previous.filter(p => p.id !== editing.id), { ...editing, name: editing.name.trim(), sku: editing.sku.trim() }]); setEditing(null); setNotice("商品资料已保存。"); }}><h3>{products.some(p => p.id === editing.id) ? "编辑商品" : "新增商品"}</h3><div className={styles.formGrid}>{[{ key: "name", label: "商品名称", type: "text" }, { key: "sku", label: "SKU", type: "text" }, { key: "price", label: "参考价格", type: "number" }, { key: "stock", label: "库存", type: "number" }].map(field => <label key={field.key}>{field.label}<StudioInput required type={field.type} min="0" maxLength={100} step={field.key === "price" ? "0.01" : field.key === "stock" ? "1" : undefined} value={editing[field.key as "name"]} onChange={e => setEditing({ ...editing, [field.key]: field.type === "number" ? e.target.value === "" ? "" : Number(e.target.value) : e.target.value })} /></label>)}</div><div className={styles.inline}><StudioButton type="submit" className={styles.primary} disabled={!editing.name.trim() || !editing.sku.trim()}>保存商品</StudioButton><StudioButton type="button" className={styles.textButton} onClick={() => setEditing(null)}>取消</StudioButton></div></form>}
      <div className={styles.tableWrap}><table><thead><tr><th>选择</th><th>商品 / SKU</th><th>参考价格</th><th>库存</th><th>操作</th></tr></thead><tbody>{products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase())).map(p => <tr key={p.id}><td><StudioInput aria-label={`选择 ${p.name}`} type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => setSelectedIds(toggle(selectedIds, p.id))} /></td><td><div className={styles.tableProduct}><span className={styles.productThumb} style={{ background: p.color }}><Package size={20} /></span><span><strong>{p.name}</strong><small>{p.sku}</small></span></div></td><td>{Number(p.price).toFixed(2)}</td><td>{p.stock}</td><td><StudioButton className={styles.textButton} onClick={() => { setEditing(p); setNotice(""); }}>编辑</StudioButton></td></tr>)}</tbody></table></div>{!products.some(p => `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase())) && <p className={styles.empty}>没有找到商品，试试其他关键词或导入商品。</p>}<div className={styles.footer}><span className={styles.muted}>共 {products.length} 个商品，已选择 {selectedProducts.length} 个</span><StudioButton className={styles.primary} disabled={!selectedProducts.length} onClick={() => openListing(selectedIds)}>刊登所选商品 <ArrowRight size={15} /></StudioButton></div>
    </div>}

    {page === "connectors" && <div className={styles.panel}><h2>你的商品，目前维护在哪里？</h2><p className={styles.muted}>选择商品系统，保存项目配置。</p><Field title="商品系统"><Chips values={["领星 ERP", "店小秘", "马帮 ERP", "其他系统"]} selected={[erp]} onChange={setErp} /></Field>{erp && <><label className={styles.field}>{erp === "其他系统" ? "系统名称" : "项目名称"}<StudioInput value={project} maxLength={60} onChange={e => setProject(e.target.value)} placeholder={erp === "其他系统" ? "例如：自有商品系统" : "例如：我的跨境商品项目"} /></label><div className={styles.inset}><Link2 size={24} /><h3>保存商品系统配置</h3><p className={styles.muted}>配置入口：能力市场 → 连接器 → {erp === "其他系统" ? project || "你的商品系统" : erp}。</p><StudioButton className={styles.primary} disabled={!project.trim()} onClick={() => { const name = erp === "其他系统" ? project.trim() : erp; setConnectedErps(previous => previous.includes(name) ? previous : [...previous, name]); setPage(connectorOrigin); setNotice(`${name}配置已保存${connectorOrigin === "listing" ? "，请继续选择商品" : ""}。`); }}><Link2 size={15} />保存配置并返回</StudioButton></div></>}{connectedErps.length > 0 && <Field title="已配置的系统"><div className={styles.chips}>{connectedErps.map(name => <span className={styles.connected} key={name}><CircleCheck size={14} />{name}</span>)}</div></Field>}<StudioButton className={styles.textButton} onClick={() => openChat("连接商品系统", `如何连接我的${erp || "外部系统"}商品进来刊登？`)}><MessageCircle size={15} />不知道怎么连接？问问助手</StudioButton></div>}

    <footer className={styles.bottomNote}><Layers3 size={12} /> MoonClaw · 从经营想法，到下一步行动</footer>
  </section>;
}
