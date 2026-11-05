"use client";

import { useState } from "react";
import { Input, ListBox } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { formDialogClasses as f } from "@/components/hero-ui/form-dialog";
import s from "./model-attribute-field.module.css";

/** Presets and custom input share one HeroUI popover; the trigger is display-only. */
export function ModelAttributeField({label,value,options,onChange,disabled=false,required=true,placeholder}:{label:string;value:string;options:string[];onChange:(value:string)=>void;disabled?:boolean;required?:boolean;placeholder?:string}) {
  const [open,setOpen]=useState(false);
  const [custom,setCustom]=useState(()=>options.includes(value)?"":value);
  return <div className={s.field}>
    <span>{label}{required&&<span className={f.requiredMark} aria-hidden="true"> *</span>}</span>
    <Popover open={open&&!disabled} onOpenChange={next=>{setOpen(next);if(next)setCustom(options.includes(value)?"":value);}}>
      <PopoverTrigger disabled={disabled} className={s.trigger} aria-label={`选择${label}`} aria-required={required||undefined}>
        <span className={value?undefined:s.placeholder} title={value||placeholder}>{value||placeholder||"请选择"}</span><ChevronDown size={14}/>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" sideOffset={6} aria-label={`${label}选项`} className={s.popover}>
        <ListBox aria-label={label} selectionMode="single" selectedKeys={options.includes(value)?[value]:[]} onAction={key=>{onChange(String(key));setCustom("");setOpen(false);}} className={s.list}>
          {options.map(option=><ListBox.Item id={option} key={option} textValue={option} className={s.option}>{option}</ListBox.Item>)}
        </ListBox>
        <label className={s.custom}><span>自定义</span><Input aria-label={`自定义${label}`} placeholder="请输入" value={custom} maxLength={60} className={s.input} onChange={event=>{setCustom(event.target.value);onChange(event.target.value);}} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();onChange(custom.trim());setOpen(false);}}}/></label>
      </PopoverContent>
    </Popover>
  </div>;
}
