"use client";

import { AlertDialog as HeroAlertDialog, Modal } from "@heroui/react";
import { Children, cloneElement, createContext, isValidElement, useContext, useId, type ComponentProps, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

// Business-facing composition shared by editors and confirmation dialogs.
// HeroUI owns the portal, focus trap, scroll lock and focus restoration.
const Context = createContext({ close: () => {}, descriptionId: "", alert: false, keyboardDisabled: false, open: false as boolean | undefined, change: (_open: boolean) => { void _open; } });
function Root({ open, onOpenChange, children, alert = false, isKeyboardDismissDisabled = false }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode; alert?: boolean; isKeyboardDismissDisabled?: boolean }) {
  const descriptionId = useId();
  return <Context.Provider value={{ close: () => onOpenChange?.(false), descriptionId, alert, keyboardDisabled: isKeyboardDismissDisabled, open, change: value => onOpenChange?.(value) }}>{children}</Context.Provider>;
}
function Portal({ children }: { children: ReactNode }) {
  const { alert, keyboardDisabled, open, change } = useContext(Context);
  const parts = Children.toArray(children).filter(isValidElement) as ReactElement<ContentProps>[];
  const content = parts.find(child => child.type === Content);
  const backdrop = parts.find(child => child.type === Overlay);
  const Component = alert ? HeroAlertDialog : Modal;
  return <Component.Backdrop isOpen={open} onOpenChange={change} className={`heroDialogBackdrop ${backdrop?.props.className ?? ""}`} isDismissable={!alert && !content?.props.onInteractOutside} isKeyboardDismissDisabled={keyboardDisabled}>
    <Component.Container placement="center" className="heroDialogContainer">{parts.filter(child => child.type !== Overlay)}</Component.Container>
  </Component.Backdrop>;
}
function Overlay(props: HTMLAttributes<HTMLDivElement>) { void props; return null; }
type ContentProps = Omit<ComponentProps<typeof Modal.Dialog>, "children" | "className"> & { children?: ReactNode; className?: string } & { onInteractOutside?: (event: Event) => void };
function Content({ children, className, onInteractOutside: _outside, ...props }: ContentProps) {
  void _outside;
  const { alert, descriptionId } = useContext(Context);
  const Component = alert ? HeroAlertDialog : Modal;
  return <Component.Dialog aria-describedby={descriptionId} {...props} className={`heroDialog ${className ?? ""}`}>{children}</Component.Dialog>;
}
function Title(props: HTMLAttributes<HTMLHeadingElement>) {
  const { alert } = useContext(Context);
  return alert ? <HeroAlertDialog.Heading {...props} /> : <Modal.Heading {...props} />;
}
function Description(props: HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useContext(Context);
  return <p id={descriptionId} {...props} />;
}
function Close({ asChild, children, disabled, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { close } = useContext(Context);
  if (asChild && isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(children)) return cloneElement(children, { ...props, onClick: event => { children.props.onClick?.(event); if (!event.defaultPrevented && !children.props.disabled) close(); } });
  return <button type="button" {...props} disabled={disabled} onClick={event => { onClick?.(event); if (!event.defaultPrevented) close(); }}>{children}</button>;
}
function Cancel(props: Parameters<typeof Close>[0]) { return <Close {...props} autoFocus />; }
export const Dialog = { Root, Portal, Overlay, Content, Title, Description, Close };
export const AlertDialog = { Root: (props: Parameters<typeof Root>[0]) => <Root {...props} alert />, Portal, Overlay, Content, Title, Description, Cancel };
