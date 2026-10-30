"use client";
import { useSyncExternalStore } from "react";
import { Radio,RadioGroup,Slider } from '@heroui/react';
import { ChevronDown,SlidersHorizontal,Scan } from 'lucide-react';
import { Popover,PopoverTrigger,PopoverContent } from '@/components/hero-ui/popover';
import { SelectField } from '@/components/SelectField';
import { StudioButton } from './StudioControls';
import { keepsSourceDuration,videoCountries,videoLanguages,type VideoSettings } from './video-creation';
import s from './video-creation.module.css';
const ratios=['智能比例','9:16','16:9','1:1','4:3','3:4','21:9'];
export function VideoParameterControl({value,onChange,ratio,onRatio,quality,onQuality,tool}:{value:VideoSettings;onChange:(value:VideoSettings)=>void;ratio:string;onRatio:(value:string)=>void;quality:string;onQuality:(value:string)=>void;tool:string|null}){
 const narrow=useSyncExternalStore(subscribeViewport,()=>window.matchMedia("(max-width: 700px)").matches,()=>false);
 const sourceDuration=keepsSourceDuration(tool??'');
 return <Popover><PopoverTrigger asChild><StudioButton className={s.parameterTrigger} aria-label="视频参数"><SlidersHorizontal size={15}/><span>{quality} · {sourceDuration?'原片时长':`${value.duration}秒`} · {ratio==='智能比例'?'Auto':ratio}</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.parameterPopup} aria-label="视频参数" side={narrow?"bottom":"right"} align={narrow?"start":"center"}>
  <h3>视频分辨率</h3><RadioGroup aria-label="视频分辨率" value={quality} onChange={onQuality} orientation="horizontal" className={s.resolutions}>{['768P','1080P'].map(item=><Radio key={item} value={item} className={s.option}><Radio.Content className={s.resolutionChoice}>{item}</Radio.Content></Radio>)}</RadioGroup>
  <h3>生成设置</h3><div className={s.durationLabel}><span>视频时长</span><strong>{sourceDuration?'沿用原片':`${value.duration} 秒`}</strong></div>
  {sourceDuration?<p className={s.originalDuration}>保留原片时间轴与音画同步</p>:<div className={s.durationBox}><Slider aria-label="视频时长" minValue={5} maxValue={15} step={1} value={value.duration} onChange={next=>onChange({...value,duration:Array.isArray(next)?next[0]:next})} className={s.durationSlider}><Slider.Track className={s.sliderTrack}><Slider.Fill className={s.sliderFill}/><Slider.Thumb className={s.sliderThumb}/></Slider.Track></Slider><div className={s.marks}><span>5 秒</span><span>10 秒</span><span>15 秒</span></div></div>}
  <span className={s.fieldLabel}>视频比例{tool==='视频翻译'?' · 保持原片画幅':''}</span><RadioGroup aria-label="视频比例" value={tool==='视频翻译'?'智能比例':ratio} onChange={onRatio} isDisabled={tool==='视频翻译'} orientation="horizontal" className={s.ratios}>{ratios.map(item=><Radio key={item} value={item} className={s.option}><Radio.Content className={s.ratioChoice}>{item==='智能比例'?<Scan size={21}/>:<span style={ratioSize(item)}/>}<small>{item==='智能比例'?'Auto':item}</small></Radio.Content></Radio>)}</RadioGroup>
  <div className={s.localeFields}><label>销售国家 / 地区<SelectField aria-label="销售国家或地区" value={value.country} onValueChange={country=>onChange({...value,country})} options={videoCountries}/></label><label>目标语言<SelectField aria-label="视频目标语言" value={value.language} onValueChange={language=>onChange({...value,language})} options={videoLanguages.map(language=>({value:language,label:language}))}/></label></div>
 </PopoverContent></Popover>;
}
function ratioSize(ratio:string){const [w,h]=ratio.split(':').map(Number);return {width:Math.round(w*23/Math.max(w,h)),height:Math.round(h*23/Math.max(w,h))};}

function subscribeViewport(listener:()=>void){const query=window.matchMedia("(max-width: 700px)");query.addEventListener("change",listener);return()=>query.removeEventListener("change",listener);}
