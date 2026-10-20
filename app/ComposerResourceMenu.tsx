"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, FolderUp, Zap, Plug, Store, Workflow, Settings, Check, Loader2, X, RefreshCw } from "lucide-react";
import { useToast } from "@/components/OperationFeedback";
import { usePreferences } from "@/components/PreferencesProvider";
import { Button, ListBox, SearchField, Separator } from "@heroui/react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/hero-ui/popover";

export type ComposerResource = { id: string; name: string; enabled: boolean; description?: string; source?: string; icon?: string; authorized?: boolean; platform?: string; country?: string; mode?: string };
export type ResourceKind = "skill_ids" | "mcp_ids" | "shop_ids";
export type ResourceOptions = Record<ResourceKind, ComposerResource[]> & { supports_shops?: boolean };
export type ResourceSelection = Record<ResourceKind, string[]>;
const groups = [{ key: "skill_ids", label: "技能", Icon: Zap, manage: "技能管理" }, { key: "mcp_ids", label: "连接器", Icon: Plug, manage: "连接器管理" }, { key: "shop_ids", label: "店铺", Icon: Store, manage: "店铺管理" }] as const;
const available = (item: ComposerResource, key: ResourceKind) => item.enabled && (key !== "shop_ids" || item.authorized === true);

export function ComposerResourceTags({ options, value, onChange, disabled }: { options: ResourceOptions; value: ResourceSelection; onChange: (key: ResourceKind, ids: string[]) => void; disabled?: boolean }) {
  const { t } = usePreferences();
  return <div className="composerResourceTags">{groups.flatMap(({ key, Icon }) => value[key].map(id => {
    const resource = options[key].find(item => item.id === id);
    const invalid = !resource || !available(resource, key);
    return <span key={`${key}-${id}`} className={`composerResourceTag${invalid ? " unavailable" : ""}`} title={invalid ? t("资源已失效，请移除或重新选择") : resource?.name}><Icon size={14} /><span>{resource?.name ?? t("资源不可用")}</span>{invalid && <small>{t("已失效")}</small>}<button type="button" disabled={disabled} aria-label={`${t("移除")} ${resource?.name ?? id}`} onClick={() => onChange(key, value[key].filter(item => item !== id))}><X size={12} /></button></span>;
  }))}</div>;
}

export function ComposerResourceMenu({ options, value, onChange, disabled, loading, error, onRefresh, onManage, onCheckMcp, onUpload, onUploadFolder, onWorkflows, open: controlledOpen, onOpenChange }: {
  options: ResourceOptions; value: ResourceSelection; onChange: (key: ResourceKind, ids: string[]) => void;
  disabled?: boolean; loading?: boolean; error?: string; onRefresh?: () => void;
  onManage?: (key: ResourceKind) => void; onCheckMcp?: (id: string) => Promise<void>;
  onUpload?: () => void; onUploadFolder?: () => void; onWorkflows?: () => void;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const manageResource = (key: ResourceKind) => { if (key === "shop_ids") toast.info("店铺管理仅为演示，暂未接入。"); else onManage?.(key); };
  const checkEpoch = useRef(0);
  useEffect(() => () => { checkEpoch.current++; }, []);
  const [localOpen, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<ResourceKind | null>(null);
  const [search, setSearch] = useState("");
  const [checks, setChecks] = useState<Record<string, "checking" | "error" | "ok">>({});
  const open = controlledOpen ?? localOpen;
  const changeOpen = (next: boolean) => { if (!next) checkEpoch.current++; setOpen(next); if (!next) setActiveGroup(null); onOpenChange?.(next); if (next) { setSearch(""); onRefresh?.(); } };
  const toggle = async (key: ResourceKind, item: ComposerResource) => {
    const selected = value[key];
    if (selected.includes(item.id)) { onChange(key, selected.filter(id => id !== item.id)); return; }
    if (!available(item, key) || (key !== "shop_ids" && selected.length >= 3) || checks[item.id] === "checking") return;
    // List tools is a connection check, never a global enable/authorization mutation.
    if (key === "mcp_ids" && onCheckMcp) {
      const epoch = checkEpoch.current;
      setChecks(previous => ({ ...previous, [item.id]: "checking" }));
      try { await onCheckMcp(item.id); setChecks(previous => ({ ...previous, [item.id]: "ok" })); }
      catch { setChecks(previous => ({ ...previous, [item.id]: "error" })); return; }
      if (epoch !== checkEpoch.current) return;
    }
    onChange(key, [...selected, item.id]);
  };
  const action = (callback?: () => void) => { changeOpen(false); callback?.(); };
  return <Popover open={open} onOpenChange={changeOpen}><PopoverTrigger asChild><button type="button" className={`schedulePlus composerPlus${open ? " active" : ""}`} aria-label={t("添加附件、技能、连接器或店铺")} disabled={disabled}>＋</button></PopoverTrigger>
    <PopoverContent className="xixiDropdownPopup composerActionMenu" data-ui-popup="menu" aria-label={t("添加资源")} align="start" sideOffset={8}>
      <Button className="heroResourceAction" isDisabled={!onUpload} onPress={() => action(onUpload)}><Upload size={16} />{t("上传文件")}</Button>
      {onUploadFolder && <Button className="heroResourceAction" onPress={() => action(onUploadFolder)}><FolderUp size={16} />{t("上传文件夹")}</Button>}
      <Separator />
      {groups.filter(group => group.key !== "shop_ids" || options.supports_shops !== false || value.shop_ids.length).map(({ key, label, Icon, manage }) => <Popover key={key} open={activeGroup === key} onOpenChange={next => { setActiveGroup(next ? key : null); setSearch(""); }}><PopoverTrigger className="heroResourceAction"><Icon size={16} />{t(label)}{value[key].length > 0 && <span className="composerMenuCount">{value[key].length}</span>}<span className="heroSubmenuArrow">›</span></PopoverTrigger>
        <PopoverContent className={`xixiDropdownPopup composerResourceMenu ${key === "mcp_ids" ? "composerConnectorMenu" : ""}`} data-ui-popup="submenu" aria-label={t(label)} side="right" align="start" sideOffset={6}><div onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setActiveGroup(null); } }}>
          {key === "skill_ids" && <SearchField value={search} onChange={setSearch} aria-label={t("搜索技能")} className="composerResourceSearch"><SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder={t("搜索技能…")} /></SearchField.Group></SearchField>}
          <div className="composerResourceList">
          {loading ? <div className="composerMenuEmpty"><Loader2 size={18} className="spin" />{t("读取中…")}</div> : error ? <div className="composerMenuEmpty"><span>{t("加载失败，请重试")}</span><Button onPress={onRefresh}><RefreshCw size={14} />{t("重试")}</Button></div> : <>
          <ListBox aria-label={t(label)} selectionMode="multiple" selectedKeys={value[key]} onSelectionChange={keys => { if (keys === "all") return; const changed = options[key].find(item => keys.has(item.id) !== value[key].includes(item.id)); if (changed) void toggle(key, changed); }} renderEmptyState={() => <div className="composerMenuEmpty"><Icon size={25} /><span>{t(search ? "没有匹配的结果" : key === "shop_ids" ? "暂无店铺" : key === "mcp_ids" ? "暂无连接器" : "暂无可用技能")}</span></div>}>
          {options[key].filter(item => !search || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(item => {
            const selected = value[key].includes(item.id), checking = checks[item.id] === "checking", failed = checks[item.id] === "error";
            const blocked = !selected && (!available(item, key) || (key !== "shop_ids" && value[key].length >= 3));
            return <ListBox.Item id={item.id} textValue={item.name} key={item.id} isDisabled={blocked || (key === "mcp_ids" && Object.values(checks).includes("checking"))} className={`composerResourceRow${selected ? " selected" : ""}`}>
              <span className="composerResourceIcon"><Icon size={16} /></span><span className="composerResourceCopy"><strong>{item.name}</strong>{key === "skill_ids" && item.description && <small>{item.description}</small>}{key === "shop_ids" && <small>{[item.platform, item.country, item.mode].filter(Boolean).join(" · ")} <i className={item.authorized ? "authorized" : "expired"} />{t(item.authorized ? "已授权" : "已失效")}</small>}{!item.enabled && <small>{t("已停用")}</small>}</span>
              {item.source && key === "skill_ids" && <span className="composerResourceSource">{t(item.source)}</span>}
              {key === "mcp_ids" ? <>{failed && <span className="composerConnectionError">{t("连接异常，请重试")}</span>}{checking ? <Loader2 size={14} className="spin" /> : <span className={`composerSelectionSwitch${selected ? " on" : ""}`} aria-hidden="true" />}</> : selected && <Check className="composerResourceCheck" size={17} />}
            </ListBox.Item>;
          })}
          </ListBox>
          {!search && !options[key].length && onManage && <Button className="heroResourceAction" onPress={() => action(() => manageResource(key))}>{t(key === "shop_ids" ? "去绑定" : "去添加")}</Button>}
          </>}
          </div>
          {key === "shop_ids" && <p className="composerResourceLimit">{t("示例店铺，仅用于交互展示")}</p>}
          {key !== "shop_ids" && value[key].length >= 3 && <p className="composerResourceLimit">{t("最多选择 3 个")}</p>}
          {onManage && <><Separator /><Button className="heroResourceAction composerResourceManage" onPress={() => action(() => manageResource(key))}><Settings size={15} />{t(manage)}</Button></>}
        </div></PopoverContent>
      </Popover>)}
      {onWorkflows && <Button className="heroResourceAction" onPress={() => action(onWorkflows)}><Workflow size={16} />{t("工作流")}</Button>}
    </PopoverContent>
  </Popover>;
}
