"use client";

import { FormDialog } from "@/components/hero-ui/form-dialog";
import { type ReactNode } from "react";
export { ModelCreator } from "./ModelCreator";

export function MaterialModal({title,subtitle,onClose,children,wide=false,className=""}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean;className?:string}) {
  return <FormDialog title={title} description={subtitle} onClose={onClose} wide={wide} className={className}>{children}</FormDialog>;
}
