"use client";

import { Modal } from "@heroui/react";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import s from "./form-dialog.module.css";

type FormDialogProps={title:string;description?:string;onClose:()=>void;children:ReactNode;wide?:boolean;className?:string;busy?:boolean;sidePanel?:ReactNode;dismissOnBackdrop?:boolean};

/** Shared form frame. Fields and submit handling remain owned by the form. */
export function FormDialog({title,description,onClose,children,wide=false,className="",busy=false,sidePanel,dismissOnBackdrop=true}:FormDialogProps){
  const content=<><header className={s.header}><div><Modal.Heading>{title}</Modal.Heading>{description&&<p>{description}</p>}</div><button type="button" className={s.close} aria-label="关闭弹窗" disabled={busy} onClick={onClose}><X size={20}/></button></header>{children}</>;
  return <Modal.Backdrop isOpen isDismissable={!busy&&dismissOnBackdrop} isKeyboardDismissDisabled={busy} onOpenChange={open=>{if(!open&&!busy)onClose();}} className={s.backdrop}><Modal.Container placement="center" className={s.container}><Modal.Dialog aria-label={title} className={`${s.dialog} ${wide?s.wide:""} ${sidePanel?s.dialogWithPanel:""} ${className}`}>{sidePanel?<><aside className={s.sidePanel} aria-label="导入状态切换">{sidePanel}</aside><div className={s.panelDialogCard}>{content}</div></>:content}</Modal.Dialog></Modal.Container></Modal.Backdrop>;
}

export function FormDialogFooter({className="",...props}:HTMLAttributes<HTMLElement>){
  return <footer {...props} className={`${s.footer} ${className}`}/>;
}

/** Shared field/control styles; business modules should only add layout rules. */
export const formDialogClasses = {
  field: s.field,
  requiredMark: s.requiredMark,
  body: s.body,
  primaryButton: `${s.button} ${s.primaryButton}`,
  secondaryButton: `${s.button} ${s.secondaryButton}`,
};
