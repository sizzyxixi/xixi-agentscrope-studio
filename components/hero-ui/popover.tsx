"use client";
import { Popover as HeroPopover } from "@heroui/react";
import { cloneElement, forwardRef, isValidElement, type ComponentProps, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

type Side = "top" | "bottom" | "left" | "right";
export function Popover({ open, onOpenChange, children, defaultOpen }: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) { return <HeroPopover isOpen={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>{children}</HeroPopover>; }
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
export const PopoverTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(function PopoverTrigger({ asChild, children, ...props }, forwardedRef) {
  return <HeroPopover.Trigger<"button"> render={triggerProps => {
    const child = asChild && isValidElement<ComponentProps<"button">>(children) ? children : null;
    const buttonProps = { ...triggerProps, ...props, ...child?.props, ref: (node: HTMLButtonElement | null) => { assignRef(triggerProps.ref, node); assignRef(forwardedRef, node); assignRef(child?.props.ref, node); } };
    return child ? cloneElement(child, buttonProps) : <button type="button" {...buttonProps}>{children}</button>;
  }} />;
});
export type PopoverContentProps = Omit<ComponentProps<typeof HeroPopover.Content>, "placement" | "children" | "onKeyDown"> & {
  children: ReactNode; side?: Side; align?: "start" | "end" | "center"; sideOffset?: number; collisionPadding?: number;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
};
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent({ side = "bottom", align = "center", sideOffset = 8, collisionPadding = 12, onEscapeKeyDown, children, onKeyDown, ...props }, ref) {
  const placement = `${side}${align === "center" ? "" : ` ${align}`}` as ComponentProps<typeof HeroPopover.Content>["placement"];
  return <HeroPopover.Content data-ui-popup="popover" {...props} ref={ref} placement={placement} offset={sideOffset} containerPadding={collisionPadding}>
    <HeroPopover.Dialog className="heroPopoverDialog" aria-label={props["aria-label"] ?? "选项"}><div onKeyDown={event => { if (event.key === "Escape") onEscapeKeyDown?.(event.nativeEvent); onKeyDown?.(event); }}>{children}</div></HeroPopover.Dialog>
  </HeroPopover.Content>;
});
