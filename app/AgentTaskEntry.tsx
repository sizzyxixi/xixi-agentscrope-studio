"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Globe2, MessageCircle, Store, TrendingUp } from "lucide-react";
import { agentOnboardingStorageKey, agentTaskEntryState, profileOnboardingComplete } from "@/lib/agent-task-entry";
import { StudioButton, StudioInput } from "./StudioControls";
import type { Profile } from "./moonclaw/MoonClawWorkbench";
import s from "./moonclaw/workbench.module.css";
const initial:Profile={stage:"",platforms:[],markets:[],mode:"",category:""};
const stages=[{name:"筹备开店",icon:Globe2,description:"从选市场、选平台开始"},{name:"已经开店",icon:Store,description:"做好选品与日常经营"},{name:"规模运营",icon:TrendingUp,description:"多店协同，让增长更高效"},{name:"其他",icon:MessageCircle,description:"先和助手聊聊我的需求"}];
const platforms=["Amazon","TikTok Shop","Shopee","Shopify","Temu","Lazada","eBay","速卖通","其他"];
const markets=["北美","欧洲","东南亚","日韩","拉丁美洲","中东","中国","其他"];
const modes=["精品","精铺","铺货","还不确定"];
export function AgentTaskEntry({accountId,hasHistory,loading,historyUnavailable,onStart}:{accountId:string;hasHistory:boolean;loading:boolean;historyUnavailable:boolean;onStart:()=>void}){
  const [ready,setReady]=useState(false);
  const [profile,setProfile]=useState<Profile>(initial);
  const [step,setStep]=useState(0);
  const start=useRef(onStart);
  useEffect(()=>{start.current=onStart;},[onStart]);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const read=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch{return null;}};
      const record=read(agentOnboardingStorageKey(accountId));
      const legacy=read(`moonclaw-workbench-demo-v1:${accountId}`);
      const state=agentTaskEntryState({loading,hasHistory,historyUnavailable,completed:profileOnboardingComplete(record,legacy)});
      if(state==="session"){
        if(hasHistory&&!record?.completed){try{localStorage.setItem(agentOnboardingStorageKey(accountId),JSON.stringify({completed:true,profile:legacy?.profile??null}));}catch{}}
        start.current();return;
      }
      const draft=record?.draft??legacy?.draftProfile;
      if(draft&&typeof draft.stage==="string"&&Array.isArray(draft.platforms)&&Array.isArray(draft.markets)&&typeof draft.mode==="string"&&typeof draft.category==="string"){
        setProfile(draft);setStep(draft.stage?1:0);
      }
      setReady(state==="onboarding");
    });
    return()=>cancelAnimationFrame(frame);
  },[accountId,hasHistory,loading,historyUnavailable]);
  useEffect(()=>{
    if(!ready)return;
    try{localStorage.setItem(agentOnboardingStorageKey(accountId),JSON.stringify({completed:false,draft:profile}));}catch{}
  },[accountId,ready,profile]);
  const finish=(value:Profile|null)=>{
    try{localStorage.setItem(agentOnboardingStorageKey(accountId),JSON.stringify({completed:true,profile:value}));}catch{/* Session creation remains available without browser storage. */}
    start.current();
  };
  const toggle=(key:"platforms"|"markets",value:string)=>setProfile(p=>({...p,[key]:p[key].includes(value)?p[key].filter(x=>x!==value):[...p[key],value]}));
  const chips=(key:"platforms"|"markets",values:string[])=><div className={s.chips}>{values.map(value=><StudioButton key={value} className={profile[key].includes(value)?s.chipSelected:""} aria-pressed={profile[key].includes(value)} onClick={()=>toggle(key,value)}>{profile[key].includes(value)&&<Check size={13}/>} {value}</StudioButton>)}</div>;
  const valid=profile.platforms.length>0&&profile.markets.length>0&&!!profile.mode&&(profile.stage==="筹备开店"||!!profile.category.trim());
  if(!ready)return <section className={`${s.root} ${s.onboarding}`} aria-busy="true"><p>正在准备新对话…</p></section>;
  return <section className={`${s.root} ${s.onboarding}`} aria-label="经营画像收集">
    <div className={s.heading}><h1>认识你，是一起做好生意的第一步</h1></div>
    <div className={s.panel}><div className={s.steps}><span className={step===0?s.activeStep:""}>01 经营阶段</span><i/><span className={step===1?s.activeStep:""}>02 经营方向</span></div>
      {step===0?<><h2>你的生意，走到哪一步了？</h2><div className={s.stageGrid}>{stages.map(({name,icon:Icon,description})=><StudioButton key={name} className={`${s.stageCard} ${profile.stage===name?s.selectedCard:""}`} aria-pressed={profile.stage===name} onClick={()=>name==="其他"?finish(null):setProfile(p=>({...p,stage:name}))}><span className={s.stageIcon}><Icon size={23}/></span><strong>{name}</strong><span>{description}</span><span className={s.radio}>{profile.stage===name&&<span/>}</span></StudioButton>)}</div><div className={s.footer}><StudioButton className={s.textButton} onClick={()=>finish(null)}>跳过，直接对话</StudioButton><StudioButton className={s.primary} disabled={!profile.stage} onClick={()=>setStep(1)}>下一步 <ArrowRight size={15}/></StudioButton></div></>:<>
        <h2>{profile.stage==="筹备开店"?"你想在哪里，开始这门生意？":"了解一下你正在经营的生意"}</h2>
        <div className={s.field}><div className={s.fieldTitle}>经营平台<span>可多选</span></div>{chips("platforms",platforms)}</div>
        <div className={s.field}><div className={s.fieldTitle}>经营市场<span>可多选</span></div>{chips("markets",markets)}</div>
        <div className={s.field}><div className={s.fieldTitle}>经营类型</div><div className={s.chips}>{modes.map(value=><StudioButton key={value} aria-pressed={profile.mode===value} className={profile.mode===value?s.chipSelected:""} onClick={()=>setProfile(p=>({...p,mode:value}))}>{value}</StudioButton>)}</div></div>
        {profile.stage!=="筹备开店"&&<label className={s.field}>主营类目<StudioInput value={profile.category} maxLength={80} onChange={e=>setProfile(p=>({...p,category:e.target.value}))} placeholder="例如：家居收纳、服饰配件"/></label>}
        <div className={s.footer}><StudioButton className={s.textButton} onClick={()=>setStep(0)}><ArrowLeft size={14}/>上一步</StudioButton><StudioButton className={s.primary} disabled={!valid} onClick={()=>finish(profile)}>开始对话 <ArrowRight size={15}/></StudioButton></div>
      </>}
    </div>
  </section>;
}
