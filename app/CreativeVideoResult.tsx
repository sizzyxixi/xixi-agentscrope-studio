"use client";
import {useState} from 'react';
import Image from 'next/image';
import {Film,Send,Clapperboard,ScanLine} from 'lucide-react';
import {PublishVideoDialog} from './SocialPublishing';
import {StudioButton} from './StudioControls';
import type {Media,CreativeJob} from './commerce-demo-data';
import {sampleVideoPoster} from './video-session';
import s from './video-workflow.module.css';
export function CreativeVideoResult({job,items,onManage}:{job:CreativeJob;items:Media[];onManage:()=>void}){
 const [publish,setPublish]=useState(false);
 const media=items[0];if(!media)return null;
 return <div className={s.result} aria-label="视频工作区"><div className={s.placeholderStage}><Image src={media.poster??sampleVideoPoster} alt="商品视频参考画面" width={1366} height={768} unoptimized/><span className={s.placeholderBadge}>视频占位</span><div className={s.placeholderLabel}><Clapperboard size={28}/><strong>商品视频</strong><span>{media.duration??6} 秒 · {job.ratio}</span></div></div><div className={s.resultBar}><div className={s.videoSteps}><span><Film size={14}/>视频生成</span><span><ScanLine size={14}/>局部帧编辑</span></div><div className={s.actions}><StudioButton className={s.primary} onClick={()=>setPublish(true)}><Send size={14}/>准备发布</StudioButton></div></div>{publish&&<PublishVideoDialog media={media} jobId={job.id} onClose={()=>setPublish(false)} onManage={onManage}/>}</div>;
}
