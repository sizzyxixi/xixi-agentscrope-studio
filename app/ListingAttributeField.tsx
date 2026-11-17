"use client";
import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/hero-ui/popover';
import { StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { ListingRichText } from './ListingRichText';
import type { DraftAttribute } from './listing-draft';
import s from './listing-draft.module.css';
export function ListingAttributeField({field,onChange}:{field:DraftAttribute;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);
 const selected=field.value?field.value.split('、'):[];
 const options=[...new Set([...(field.options||[]),...selected])];
 return <div className={s.attribute}><span>{field.required&&<em>*</em>}{field.name}:</span>{field.multiline?<ListingRichText label={field.name} value={field.value} onChange={onChange}/>:field.multiple?<Popover open={open} onOpenChange={setOpen}><div className={s.multiSelect}>{selected.map(value=><span key={value}>{value}<button type="button" aria-label={`移除 ${field.name} ${value}`} onClick={()=>onChange(selected.filter(item=>item!==value).join('、'))}><X size={10}/></button></span>)}<PopoverTrigger asChild><button type="button" aria-label={`选择 ${field.name}`}><span>{!selected.length&&`请选择 ${field.name}`}</span><ChevronDown size={12}/></button></PopoverTrigger></div><PopoverContent className={s.attributeOptions} aria-label={`${field.name}选项`} align="start" sideOffset={5}>{options.map(value=><label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={event=>onChange((event.target.checked?[...selected,value]:selected.filter(item=>item!==value)).join('、'))}/>{value}</label>)}</PopoverContent></Popover>:field.options?<Select aria-label={field.name} value={field.value} onChange={event=>onChange(event.target.value)}><option value="">请选择 {field.name}</option>{options.map(value=><option key={value} value={value}>{value}</option>)}</Select>:<Input aria-label={field.name} value={field.value} placeholder={`请输入 ${field.name}`} onChange={event=>onChange(event.target.value)}/>}</div>;
}
