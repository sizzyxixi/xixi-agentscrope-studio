"use client";

import { AlertDialog } from "@heroui/react";
import { CircleAlert } from "lucide-react";
import { useId } from "react";
import s from "./confirmation-dialog.module.css";

type Props = {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({ title, description, confirmLabel, onCancel, onConfirm }: Props) {
  const descriptionId = useId();
  return <AlertDialog.Backdrop isOpen isDismissable={false} onOpenChange={open => { if (!open) onCancel(); }} className={s.backdrop}>
    <AlertDialog.Container placement="center" className={s.container}>
      <AlertDialog.Dialog className={s.dialog} aria-describedby={descriptionId}>
        <div className={s.message}>
          <CircleAlert className={s.icon} size={21} fill="currentColor" aria-hidden="true" />
          <div><AlertDialog.Heading className={s.title}>{title}</AlertDialog.Heading><p id={descriptionId} className={s.description}>{description}</p></div>
        </div>
        <div className={s.actions}>
          <button type="button" autoFocus className={s.cancel} onClick={onCancel}>取消</button>
          <button type="button" className={s.confirm} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </AlertDialog.Dialog>
    </AlertDialog.Container>
  </AlertDialog.Backdrop>;
}
