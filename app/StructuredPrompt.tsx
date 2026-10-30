"use client";
import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { StudioButton, StudioInput } from "./StudioControls";
import { promptFieldText, type PromptField } from "./creative-prompt";
import s from "./structured-prompt.module.css";
export function StructuredPrompt({fields,onChange,compact=false}:{fields:PromptField[];onChange:(key:string,value:string)=>void;compact?:boolean}) {
 return <div className={`${s.fields} ${compact?s.compact:""}`} aria-label="可编辑创作参数">{fields.map(field=><PromptVariable key={field.key} field={field} onChange={value=>onChange(field.key,value)}/>)}</div>;
}
function PromptVariable({field,onChange}:{field:PromptField;onChange:(value:string)=>void}) {
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(field.value);
 const valid=!!draft.trim()&&(field.key!=="count"||(Number.isInteger(Number(draft))&&Number(draft)>=1&&Number(draft)<=12));
 const apply=(value:string)=>{onChange(value.trim());setOpen(false);};
 return <span className={s.field}><span>{field.label}：</span><Popover open={open} onOpenChange={value=>{if(value)setDraft(field.value);setOpen(value);}}><PopoverTrigger asChild><StudioButton className={s.variable} aria-label={`修改${field.label}：${promptFieldText(field)}`}><span>{promptFieldText(field)}</span><Pencil size={10}/></StudioButton></PopoverTrigger><PopoverContent className={s.editor} aria-label={`编辑${field.label}`} align="start" side="bottom"><span className={s.label}>{field.label}</span><div className={s.editRow}><StudioInput autoFocus aria-label={`编辑${field.label}`} value={draft} maxLength={80} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&valid){event.preventDefault();apply(draft);}}}/><StudioButton aria-label={`应用${field.label}`} disabled={!valid} onClick={()=>apply(draft)}><Check size={15}/></StudioButton></div>{field.options&&<div className={s.options}>{field.options.map(value=><StudioButton key={value} aria-pressed={field.value===value} onClick={()=>apply(value)}>{promptFieldText({...field,value})}</StudioButton>)}</div>}</PopoverContent></Popover></span>;
}
