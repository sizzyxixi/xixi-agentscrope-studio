"use client";
import { useEffect, useState } from "react";
import { ListBox, Spinner } from "@heroui/react";
import { Check, ChevronDown, Search, Settings2, Store } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { Hint } from "@/components/hero-ui/tooltip";
import { StudioButton, StudioInput } from "../StudioControls";
import { useToast } from "@/components/OperationFeedback";
import s from "./target-shop-picker.module.css";

export type TargetShop = { id: string; name: string; site: string; type: string; authorized: boolean };
export function mockShops(agentId: string, agentName: string): TargetShop[] {
  if (/aliexpress/i.test(agentId) || agentId === "main") return [];
  const platform = agentName.split(" ")[0];
  const site = /wildberries/i.test(agentId) ? "RU" : /shopee|lazada/i.test(agentId) ? "SG" : /1688/.test(agentId) ? "CN" : "US";
  return ["A", "B", "C"].map((suffix, index) => ({ id: `${agentId}-shop-${suffix}`, name: `${platform} ${["汕头市唯颜云生物科技有限公司旗舰店", "汕头伊尔趣宠物用品有限公司", "汕头鲸选跨境供应链有限公司"][index]}`, site, type: /跨境/.test(agentName) ? "跨境" : "本土", authorized: index !== 2 }));
}

export function TargetShopPicker({ agentId, agentName, value, onChange, disabled = false }: { agentId: string; agentName: string; value: TargetShop | null; onChange: (shop: TargetShop | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(agentId === "official-shopee-cross-border");
  const toast = useToast();
  const shops = mockShops(agentId, agentName);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [loading]);
  const manage = () => { setOpen(false); toast.info("店铺绑定与管理暂未开放。"); };
  const select = (shop: TargetShop | null) => { onChange(shop); setOpen(false); };
  if (loading) return <StudioButton disabled className={s.trigger} aria-label="店铺数据加载中"><Spinner size="sm" />店铺加载中…</StudioButton>;
  if (!shops.length) return <StudioButton disabled={disabled} className={s.trigger} onClick={manage} aria-label="暂无店铺，去绑定"><Store size={16} /><span>暂无店铺</span><span className={s.link}>去绑定</span></StudioButton>;
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
    <PopoverTrigger asChild><StudioButton disabled={disabled} className={s.trigger} aria-label={value ? `目标店铺：${value.name}` : "选择目标店铺，不指定店铺"}><Store size={16} />{value && <i className={s.dot} />}<Hint content={value?.name}><span className={s.triggerName}>{value?.name ?? "不指定店铺"}</span></Hint><ChevronDown size={13} /></StudioButton></PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={12} className={s.panel} aria-label="选择目标店铺">
      <div className={s.search}><Search size={17} /><StudioInput autoFocus aria-label="搜索店铺" placeholder="搜索店铺…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <ListBox
        aria-label="目标店铺"
        className={s.list}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value?.id ?? "no-shop"]}
        onSelectionChange={keys => {
          if (keys === "all") return;
          const key = Array.from(keys)[0];
          if (key !== undefined) select(shops.find(shop => shop.id === key) ?? null);
        }}
        onAction={key => select(shops.find(shop => shop.id === key) ?? null)}
      >
        <ListBox.Item id="no-shop" textValue="不指定店铺" className={s.option}>
          <div className={s.details}><span className={s.name}>不指定店铺</span><span className={s.meta}>按对话内容确定经营对象</span></div>
          <ListBox.ItemIndicator className={s.check}><Check size={18} strokeWidth={2} /></ListBox.ItemIndicator>
        </ListBox.Item>
        {shops.filter(shop => shop.name.toLowerCase().includes(query.trim().toLowerCase())).map(shop => (
          <ListBox.Item key={shop.id} id={shop.id} textValue={shop.name} isDisabled={!shop.authorized} className={s.option}>
            <div className={s.details}>
              <Hint content={shop.name}><span className={s.name}>{shop.name}</span></Hint>
              <span className={s.meta}>{shop.site} · {shop.type} · <i className={shop.authorized ? s.dot : s.expired} />{shop.authorized ? "已授权" : "授权已失效"}</span>
            </div>
            <ListBox.ItemIndicator className={s.check}><Check size={18} strokeWidth={2} /></ListBox.ItemIndicator>
          </ListBox.Item>
        ))}
      </ListBox>
      {!shops.some(shop => shop.name.toLowerCase().includes(query.trim().toLowerCase())) && <p className={s.empty}>没有找到匹配的店铺</p>}
      <div className={s.footer}><StudioButton onClick={manage}><Settings2 size={16} />店铺管理</StudioButton></div>
    </PopoverContent>
  </Popover>;
}
