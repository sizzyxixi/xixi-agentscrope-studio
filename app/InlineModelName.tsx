"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import s from "./inline-model-name.module.css";

export function InlineModelName({name,onSave,large=false}:{name:string;onSave:(name:string)=>void;large?:boolean}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(name);
  const [invalid,setInvalid]=useState(false);
  const finished=useRef(false);
  const cancel=()=>{finished.current=true;setDraft(name);setInvalid(false);setEditing(false);};
  const commit=(blur=false)=>{
    if(finished.current)return;
    const next=draft.trim();
    if(!next){if(blur)cancel();else setInvalid(true);return;}
    finished.current=true;setEditing(false);setInvalid(false);
    if(next!==name)onSave(next);
  };
  return <div className={`${s.root} ${large?s.large:""}`} onClick={event=>event.stopPropagation()}>
    {editing?<div className={s.editor}><input autoFocus aria-label="模特名称" aria-invalid={invalid} value={draft} maxLength={60} onFocus={event=>event.target.select()} onChange={event=>{setDraft(event.target.value);setInvalid(false);}} onBlur={()=>commit(true)} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==="Enter"){event.preventDefault();event.stopPropagation();commit();}else if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}}}/>{invalid&&<span role="alert">请输入模特名称</span>}</div>:<><span className={s.label} title={name}>{name}</span><button className={s.pen} aria-label={`修改模特名称 ${name}`} onClick={()=>{finished.current=false;setDraft(name);setInvalid(false);setEditing(true);}}><Pencil size={14}/></button></>}
  </div>;
}
