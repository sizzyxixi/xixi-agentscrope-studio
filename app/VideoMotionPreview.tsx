"use client";
import Image from 'next/image';
import s from './video-creation.module.css';
export const videoMotionKeys:Record<string,string>={'商品视频':'product','带货视频':'sales','视频复刻':'replica','视频编辑':'editing','视频翻译':'translation'};
export function VideoMotionPreview({name}:{name:string}){
 const key=videoMotionKeys[name]??'product';
 return <div className={`${s.videoMotion} ${s[`preview_${key}`]}`} aria-label={`${name}动态效果预览`}>
  <picture><source media="(prefers-reduced-motion: reduce)" srcSet={`/creative/video-previews/${key}-poster-v1.jpg`}/><Image src={`/creative/video-previews/${key}-v1.webp`} alt={`${name}效果预览`} width={640} height={360} unoptimized loading="eager"/></picture>
  {key==='replica'&&<div className={s.comparisonLabels}><span>参考视频</span><span>复刻效果</span></div>}
  {key==='sales'&&<div className={s.salesCaption}><strong>近距离，发现商品细节</strong></div>}
  {key==='editing'&&<><span className={s.editPreviewLabel}>局部消除</span><span className={s.eraseMarker}/></>}
  {key==='translation'&&<div className={s.translationCaption}><span className={s.originalSubtitle}>EN · A little care, every day.</span><span className={s.translatedSubtitle}>中文 · 每天多一点细心呵护。</span></div>}
  <span className={s.motionProgress}/>
 </div>;
}
