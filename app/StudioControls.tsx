"use client";
import { Children, createContext, isValidElement, useContext, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes, type ChangeEvent, type ReactNode, type ComponentProps, type Ref } from "react";
import { Button, Input, TextArea, Checkbox, Select, ListBox, Label, Form, Modal } from "@heroui/react";
import { Check, ChevronDown } from "lucide-react";
import s from "./studio-controls.module.css";
const FieldContext=createContext("选择选项");
function fieldText(nodes:ReactNode):string{return Children.toArray(nodes).filter(x=>typeof x==="string"||typeof x==="number").join("").trim();}
export function FieldLabel({children,className,...props}:LabelHTMLAttributes<HTMLLabelElement>){return <FieldContext.Provider value={fieldText(children)||"选择选项"}><Label {...props} className={className}>{children}</Label></FieldContext.Provider>;}
export function StudioButton({disabled,type="button",className,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{ref?:Ref<HTMLButtonElement>}){return <Button {...(props as ComponentProps<typeof Button>)} type={type} isDisabled={disabled} variant="ghost" className={`${s.button} ${className??""}`}/>;}
export function StudioInput({type,className,onChange,checked,disabled,...props}:InputHTMLAttributes<HTMLInputElement>&{ref?:Ref<HTMLInputElement>}){
 const field=useContext(FieldContext);
 if(type==="checkbox")return <Checkbox isSelected={checked} isDisabled={disabled} aria-label={props["aria-label"]??field} onChange={value=>onChange?.({target:{checked:value},currentTarget:{checked:value}} as ChangeEvent<HTMLInputElement>)} className={`${s.checkbox} ${className??""}`}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator>{checked?<Check size={12}/>:null}</Checkbox.Indicator></Checkbox.Control></Checkbox.Content></Checkbox>;
 return <Input {...props} type={type} disabled={disabled} onChange={onChange} className={`${s.input} ${className??""}`}/>;
}
export function StudioTextarea({className,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>&{ref?:Ref<HTMLTextAreaElement>}){return <TextArea {...props} className={`${s.textarea} ${className??""}`}/>;}
export function StudioSelect({children,value,onChange,disabled,required,name,className,...props}:SelectHTMLAttributes<HTMLSelectElement>){
 const field=useContext(FieldContext);
 const options=Children.toArray(children).filter(isValidElement<{value?:string;children:ReactNode;disabled?:boolean}>).map((child)=>({value:String(child.props.value??fieldText(child.props.children)),label:child.props.children,disabled:child.props.disabled}));
 return <Select aria-label={props["aria-label"]??field} name={name} isDisabled={disabled} isRequired={required} selectedKey={String(value??"")} onSelectionChange={key=>{if(key!==null)onChange?.({target:{value:String(key)},currentTarget:{value:String(key)}} as ChangeEvent<HTMLSelectElement>);}} className={`${s.select} ${className??""}`}><Select.Trigger className={s.trigger}><Select.Value/><Select.Indicator><ChevronDown size={13}/></Select.Indicator></Select.Trigger><Select.Popover className={s.popover} offset={7}><ListBox>{options.map(option=><ListBox.Item id={option.value} key={option.value} textValue={fieldText(option.label)} isDisabled={option.disabled} className={s.option}>{option.label}<ListBox.ItemIndicator/></ListBox.Item>)}</ListBox></Select.Popover></Select>;
}
export { Form as StudioForm };

export function StudioOverlay({children,onClose,label,isDismissable=true}:{children:ReactNode;onClose:()=>void;label:string;isDismissable?:boolean}) {
 return <Modal.Backdrop isOpen isDismissable={isDismissable} onOpenChange={open=>{if(!open)onClose();}} className="studioOverlayBackdrop"><Modal.Container placement="center" className="studioOverlayContainer"><Modal.Dialog aria-label={label} className="studioOverlayDialog">{children}</Modal.Dialog></Modal.Container></Modal.Backdrop>;
}
