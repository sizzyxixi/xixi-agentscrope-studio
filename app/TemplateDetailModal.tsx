"use client";

import Image from "next/image";
import { Modal } from "@heroui/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Info, X } from "lucide-react";
import type { DemoTemplate } from "./commerce-demo-data";
import { templateDetailData } from "./template-detail-data";
import { StudioButton } from "./StudioControls";
import s from "./template-detail.module.css";

type Props = {
  template: DemoTemplate;
  onClose: () => void;
  onApply: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export function TemplateDetailModal({ template, onClose, onApply, onPrevious, onNext }: Props) {
  const detail = templateDetailData(template);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });
  const strip = useRef<HTMLDivElement>(null);
  const selected = detail.gallery[active];
  const isSet = detail.gallery.length > 1;

  const updateEdges = () => {
    const element = strip.current;
    if (element) setEdges({ start: element.scrollLeft <= 1, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
  };
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);
    updateEdges();
    return () => observer.disconnect();
  }, []);
  const chooseImage = (index: number, focus = false) => {
    setActive(index);
    const element = strip.current;
    const thumbnail = element?.querySelector<HTMLButtonElement>(`[data-thumbnail="${index}"]`);
    if (element && thumbnail) {
      if (focus) thumbnail.focus({ preventScroll: true });
      const left = thumbnail.offsetLeft;
      if (left < element.scrollLeft) element.scrollTo({ left, behavior: "smooth" });
      else if (left + thumbnail.offsetWidth > element.scrollLeft + element.clientWidth) element.scrollTo({ left: left + thumbnail.offsetWidth - element.clientWidth, behavior: "smooth" });
    }
  };
  const thumbnailKeys = (event: KeyboardEvent, index: number) => {
    const next = event.key === "ArrowRight" ? Math.min(index + 1, detail.gallery.length - 1) : event.key === "ArrowLeft" ? Math.max(index - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? detail.gallery.length - 1 : null;
    if (next !== null) { event.preventDefault(); chooseImage(next, true); }
  };
  const scrollThumbnails = (direction: number) => {
    const element = strip.current;
    element?.scrollBy({ left: direction * element.clientWidth * .75, behavior: "smooth" });
  };

  return <Modal.Backdrop isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }} className={s.backdrop}>
    <Modal.Container placement="center" className={s.container}>
      <Modal.Dialog aria-label={`模板详情：${template.title}`} className={s.dialog}>
        <section className={s.visual} aria-label="模板图片预览">
          {(onPrevious || onNext) && <div className={s.visualHeader}><div><StudioButton aria-label="上一份灵感" disabled={!onPrevious} onClick={onPrevious}><ArrowLeft size={15}/></StudioButton><StudioButton aria-label="下一份灵感" disabled={!onNext} onClick={onNext}><ArrowRight size={15}/></StudioButton></div></div>}
          <div className={s.stage}>
            <Image key={selected.url} src={selected.url} alt={`${template.title} · ${selected.label}`} width={1000} height={1000} unoptimized className={s.mainImage}/>
            {isSet && <><StudioButton className={`${s.imageArrow} ${s.previous}`} aria-label="上一张图片" disabled={active === 0} onClick={() => chooseImage(active - 1)}><ChevronLeft size={20}/></StudioButton><StudioButton className={`${s.imageArrow} ${s.next}`} aria-label="下一张图片" disabled={active === detail.gallery.length - 1} onClick={() => chooseImage(active + 1)}><ChevronRight size={20}/></StudioButton></>}
          </div>
          <div className={s.caption} aria-live="polite"><strong>{selected.label}</strong><span>{active + 1} / {detail.gallery.length}</span></div>
          {isSet && <div className={s.thumbnailBar}>
            <StudioButton className={s.stripArrow} aria-label="向左滑动缩略图" disabled={edges.start} onClick={() => scrollThumbnails(-1)}><ChevronLeft size={17}/></StudioButton>
            <div ref={strip} className={s.thumbnailStrip} onScroll={updateEdges} role="group" aria-label="组图缩略图">
              {detail.gallery.map((image, index) => <StudioButton key={`${index}-${image.label}`} data-thumbnail={index} className={`${s.thumbnail} ${active === index ? s.selected : ""}`} aria-label={`查看第 ${index + 1} 张：${image.label}`} aria-pressed={active === index} tabIndex={active === index ? 0 : -1} onKeyDown={event => thumbnailKeys(event, index)} onClick={() => chooseImage(index)}><Image src={image.url} alt="" width={160} height={160} unoptimized/><span>{String(index + 1).padStart(2, "0")} · {image.label}</span></StudioButton>)}
            </div>
            <StudioButton className={s.stripArrow} aria-label="向右滑动缩略图" disabled={edges.end} onClick={() => scrollThumbnails(1)}><ChevronRight size={17}/></StudioButton>
          </div>}
        </section>
        <section className={s.info} aria-label="模板详情介绍">
          <StudioButton className={s.close} aria-label="关闭模板详情" onClick={onClose}><X size={19}/></StudioButton>
          <div className={s.infoScroll}>
            <Modal.Heading className={s.title}>{template.title}</Modal.Heading>
            <p className={s.description}>以{template.style}风格呈现{template.category === "服务" ? "服务内容与品牌形象" : "商品特点与使用体验"}，适用于{template.tool}创作。</p>
            <div className={s.metadata}>
              <div className={s.parameterSummary} aria-label="模板参数概览">
                <span className={s.referenceSummary}><Image src={template.cover} alt="" width={28} height={28} unoptimized/>{isSet ? `${detail.gallery.length} 张组图` : "单图模板"}</span>
                <span aria-label={`模型：${detail.model}`}>{detail.model}</span>
                <span aria-label={`比例：${detail.ratio}`}>{detail.ratio}</span>
                <span aria-label={`分辨率：${detail.resolution}`}>{detail.resolution}</span>
              </div>
              <details className={s.moreDetails}>
                <summary><span>详细信息<Info size={14} aria-hidden="true"/></span><ChevronDown size={14} className={s.detailChevron} aria-hidden="true"/></summary>
                <dl className={s.fields}>
              <div><dt>适用场景</dt><dd>{template.scene} / {template.tool}</dd></div>
              {detail.target && <div><dt>目标平台 · 站点</dt><dd>{detail.target.platform} · {detail.target.site}</dd></div>}
              {detail.category && <div><dt>类目</dt><dd>{detail.category}</dd></div>}
              <div><dt>风格</dt><dd>{template.style}</dd></div>
              <div><dt>尺寸</dt><dd>{detail.dimensions}</dd></div>
                </dl>
              </details>
            </div>
            <div className={s.promptHeader}><h3>提示词</h3><StudioButton aria-label="复制提示词" onClick={async () => { try { await navigator.clipboard.writeText(template.prompt); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? "已复制" : "复制"}</StudioButton></div>
            <p className={s.prompt}>{template.prompt}</p>
            {copyError && <p role="status" className={s.copyError}>复制未成功，请选择提示词手动复制。</p>}
          </div>
          <footer className={s.actions}><StudioButton className={s.apply} onClick={onApply}>使用此模板<ArrowRight size={15}/></StudioButton></footer>
        </section>
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>;
}
