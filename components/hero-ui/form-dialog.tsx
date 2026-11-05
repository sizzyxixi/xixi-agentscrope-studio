"use client";

import { Modal } from "@heroui/react";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import s from "./form-dialog.module.css";

type FormDialogProps={title:string;description?:string;onClose:()=>void;children:ReactNode;wide?:boolean;className?:string};

/** Shared form frame. Fields and submit handling remain owned by the form. */
export function FormDialog({title,description,onClose,children,wide=false,className=""}:FormDialogProps){
  return <Modal.Backdrop isOpen isDismissable onOpenChange={open=>{if(!open)onClose();}} className={s.backdrop}><Modal.Container placement="center" className={s.container}><Modal.Dialog aria-label={title} className={`${s.dialog} ${wide?s.wide:""} ${className}`}><header className={s.header}><div><Modal.Heading>{title}</Modal.Heading>{description&&<p>{description}</p>}</div><button type="button" className={s.close} aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></header>{children}</Modal.Dialog></Modal.Container></Modal.Backdrop>;
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
