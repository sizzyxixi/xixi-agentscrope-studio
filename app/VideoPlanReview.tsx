"use client";
import Image from 'next/image';
import { Check,ArrowRight,Film } from 'lucide-react';
import { useCommerceDemo } from './CommerceDemoContext';
import type { CreativeJob } from './commerce-demo-data';
import { StudioButton,StudioTextarea } from './StudioControls';
import { keepsSourceDuration,videoScenarios } from './video-creation';
import s from './video-creation.module.css';
export function VideoPlanReview({job,onChange,onGenerate}:{job:CreativeJob;onChange:(job:CreativeJob)=>void;onGenerate:()=>void}){
 const d=useCommerceDemo();const source=d.media.find(item=>job.referenceIds.includes(item.id)&&item.type==='video');
 const cover=d.media.find(item=>job.referenceIds.includes(item.id)&&item.type==='image')?.url??videoScenarios.find(item=>item.name===job.tool)?.cover??'/creative/generated/fragrance-v1.webp';
 const sourceTask=keepsSourceDuration(job.tool),confirmed=job.fields.videoStage==='confirmed';
 const shots=job.tool==='带货视频'?['用商品使用情境引出需求，建立开场钩子。','展示核心卖点，用细节或使用过程支撑表达。','呈现商品与品牌，按行动引导收束。']:job.tool==='视频复刻'?['沿用参考片的开场构图，替换为当前商品。','围绕当前商品重组卖点，保留参考片的节奏。','使用当前品牌和文案重新设计收尾。']:['商品主体亮相，交代整体外观与场景。','展示关键材质与功能细节，保持品牌一致。','回到完整商品，突出品牌与视觉记忆。'];
 const duration=Number(job.amount)||5;
 const update=(key:string,value:string)=>onChange({...job,fields:{...job.fields,[key]:value,videoStage:'planning'}});
 return <section className={s.plan} aria-label="视频处理方案"><header><strong><Film size={15}/>{job.tool==='视频翻译'?'译制方案':job.tool==='视频编辑'?'编辑方案':'脚本与分镜'}</strong><span>{sourceTask?'沿用原片时长':`${duration} 秒`} · {job.quality} · {job.language}</span></header>
 {sourceTask?<div className={s.sourcePlan}>{source&&<video src={source.url} controls preload="metadata"/>}<dl>{job.promptFields?.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl><StudioTextarea aria-label="补充视频处理要求" value={job.fields.videoPlanNote??''} onChange={event=>update('videoPlanNote',event.target.value)} placeholder={job.tool==='视频翻译'?'补充品牌读音、术语与字幕要求':'补充要修改的时间段与画面要求'}/></div>:<div className={s.storyboard}>{shots.map((text,index)=>{const start=Math.round(index*duration/3),end=Math.round((index+1)*duration/3);return <div key={index}><div className={s.shotImage}><Image src={cover} alt={`镜头 ${index+1} 参考画面`} width={400} height={300} unoptimized style={{objectPosition:`${30+index*20}% center`}}/><span>{String(start).padStart(2,'0')}–{String(end).padStart(2,'0')}s</span></div><label>镜头 {index+1}<StudioTextarea aria-label={`镜头 ${index+1} 脚本`} value={job.fields[`shot${index+1}`]??text} onChange={event=>update(`shot${index+1}`,event.target.value)}/></label></div>;})}</div>}
 <footer>{confirmed?<><span role="status"><Check size={14}/>方案已确认</span><StudioButton onClick={()=>onChange({...job,fields:{...job.fields,videoStage:'planning'}})}>继续调整</StudioButton><StudioButton className={s.confirmPlan} onClick={onGenerate}>查看视频工作区<ArrowRight size={14}/></StudioButton></>:<StudioButton className={s.confirmPlan} onClick={()=>onChange({...job,fields:{...job.fields,videoStage:'confirmed'}})}>{sourceTask?'确认处理要求':'确认脚本与分镜'}<ArrowRight size={14}/></StudioButton>}</footer>
 </section>;
}
