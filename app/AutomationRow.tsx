"use client";

import { EllipsisVertical } from "lucide-react";
import type { ReactNode } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/hero-ui/dropdown-menu";

/** Shared row target: contextual actions stay outside the main click target. */
export function AutomationRow({ children, actions, className = "" }: {
  children: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return <li className={`automationRow ${className}`}>{children}<div className="automationRowActions">{actions}</div></li>;
}

export function AutomationRowMenu({ label, disabled, children }: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild>
    <button type="button" className="automationRowAction" disabled={disabled} aria-label={label} title={label}><EllipsisVertical size={16} aria-hidden="true" /></button>
  </DropdownMenuTrigger>
    <DropdownMenuContent data-ui-popup="menu" align="end" sideOffset={6} className="xixiDropdownPopup automationRowMenu">{children}</DropdownMenuContent>
  </DropdownMenu>;
}
