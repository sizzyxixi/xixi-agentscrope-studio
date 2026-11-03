"use client";

import { Modal } from "@heroui/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Clock3, LoaderCircle, Search, X } from "lucide-react";
import { StudioButton, StudioInput } from "./StudioControls";
import { usePreferences } from "@/components/PreferencesProvider";
import s from "./task-search.module.css";

type Task = { id: string; title: string; updatedAt: string; pinned?: boolean };
type Props = {
  query: string;
  onQuery: (value: string) => void;
  tasks: Task[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
};

function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return index < 0 ? text : <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}

export function TaskSearchDialog({ query, onQuery, tasks, loading, error, hasMore, onLoadMore, onRetry, onSelect, onClose }: Props) {
  const { t } = usePreferences();
  const listId = useId();
  const results = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const active = Math.min(index, Math.max(tasks.length - 1, 0));
  const keyboard = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && tasks.length) {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + tasks.length) % tasks.length;
      setIndex(next);
      results.current?.querySelector(`[data-result-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && tasks[active]) {
      event.preventDefault(); onSelect(tasks[active].id);
    }
  };
  return <Modal.Backdrop isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }} className={s.backdrop}>
    <Modal.Container placement="center" className={s.container}>
      <Modal.Dialog aria-label={t("搜索任务")} className={s.dialog}>
        <header className={s.header}><Modal.Heading>{t("搜索任务")}</Modal.Heading><StudioButton className={s.close} aria-label={t("关闭搜索")} onClick={onClose}><X size={18}/></StudioButton></header>
        <div className={s.search}><Search size={19}/><StudioInput ref={input} autoFocus role="combobox" aria-label={t("搜索任务名称")} aria-expanded aria-autocomplete="list" aria-controls={listId} aria-activedescendant={tasks.length ? `${listId}-${active}` : undefined} placeholder={t("搜索任务名称…")} maxLength={200} value={query} onChange={event => { onQuery(event.target.value); setIndex(0); }} onKeyDown={keyboard}/>{query && <StudioButton aria-label={t("清空搜索")} onClick={() => { onQuery(""); setIndex(0); input.current?.focus(); }}><X size={14}/></StudioButton>}</div>
        <div className={s.resultHeading} aria-live="polite"><span>{query.trim() ? t("搜索结果") : t("最近任务")}</span><span>{loading ? t("搜索中…") : `${tasks.length}${hasMore ? "+" : ""} ${t("项")}`}</span></div>
        <div ref={results} className={s.results} role="listbox" aria-label={t("任务搜索结果")} id={listId} aria-busy={loading}>
          {tasks.map((task, itemIndex) => <StudioButton role="option" aria-selected={active === itemIndex} id={`${listId}-${itemIndex}`} data-result-index={itemIndex} key={task.id} className={`${s.result} ${active === itemIndex ? s.active : ""}`} onMouseMove={() => setIndex(itemIndex)} onClick={() => onSelect(task.id)}><Clock3 size={16}/><span><strong><Highlight text={task.title} query={query.trim()}/></strong><small>{Number.isNaN(Date.parse(task.updatedAt)) ? "" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(task.updatedAt))}{task.pinned && ` · ${t("已置顶")}`}</small></span><ArrowUpRight size={15} className={s.openIcon}/></StudioButton>)}
        </div>
        {!tasks.length && <div className={s.empty} role="status">{loading ? <><LoaderCircle size={24} className={s.spinner}/><p>{t("正在查找任务…")}</p></> : error ? <><Search size={26}/><strong>{t("暂时无法加载任务")}</strong><p>{t("请检查网络后重试")}</p></> : <><Search size={26}/><strong>{query.trim() ? t("没有找到相关任务") : t("暂无任务")}</strong><p>{query.trim() ? t("试试其他名称或关键词") : t("开始创作后，任务会显示在这里")}</p></>}</div>}
        {error && <div className={s.status}><span>{t("部分任务未能加载")}</span><StudioButton onClick={onRetry}>{t("重试")}</StudioButton></div>}
        {hasMore && !error && <StudioButton className={s.loadMore} disabled={loading} onClick={onLoadMore}>{loading ? t("加载中…") : t("加载更多任务")}</StudioButton>}
        <footer className={s.footer}><span><kbd>↑</kbd><kbd>↓</kbd>{t("选择")}</span><span><kbd>↵</kbd>{t("打开")}</span><span><kbd>esc</kbd>{t("关闭")}</span></footer>
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>;
}
