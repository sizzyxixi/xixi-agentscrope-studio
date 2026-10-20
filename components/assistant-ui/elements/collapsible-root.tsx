// Adapted from assistant-ui Run Activity; disclosure interaction is supplied by HeroUI.
"use client";
import { Disclosure } from "@heroui/react";
import { type ComponentProps } from "react";
export function CollapsibleRoot({ open, onOpenChange, ...props }: Omit<ComponentProps<typeof Disclosure>, "isExpanded" | "onExpandedChange"> & { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return <Disclosure {...props} isExpanded={open} onExpandedChange={onOpenChange} data-slot="collapsible" />;
}
export function CollapsibleTrigger(props: ComponentProps<typeof Disclosure.Trigger>) { return <Disclosure.Heading className="heroDisclosureHeading"><Disclosure.Trigger {...props} data-slot="collapsible-trigger" /></Disclosure.Heading>; }
export function CollapsibleContent(props: ComponentProps<typeof Disclosure.Content>) { return <Disclosure.Content {...props} data-slot="collapsible-content" />; }
