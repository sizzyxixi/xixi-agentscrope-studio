"use client";
import { Dropdown, Header, Separator } from "@heroui/react";
import { flattenMenuChildren, menuNodeKind } from "./menu-collection";
import { Check } from "lucide-react";
import { Children, createContext, isValidElement, useContext, useState, type ComponentProps, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

const MenuContext = createContext({ close: () => {} });
export function DropdownMenu({ children, open, onOpenChange }: { children: ReactNode; open?: boolean; onOpenChange?: (value: boolean) => void }) {
  const [local, setLocal] = useState(false);
  const change = (value: boolean) => { setLocal(value); onOpenChange?.(value); };
  return <MenuContext.Provider value={{ close: () => change(false) }}><Dropdown isOpen={open ?? local} onOpenChange={change}>{children}</Dropdown></MenuContext.Provider>;
}
export function DropdownMenuTrigger({ asChild, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const child = asChild && isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(children) ? children : null;
  const { disabled, ...buttonProps } = { ...props, ...child?.props };
  return <Dropdown.Trigger isDisabled={disabled} {...buttonProps as ComponentProps<typeof Dropdown.Trigger>}>{child ? child.props.children : children}</Dropdown.Trigger>;
}
type ItemProps = Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & { children?: ReactNode; disabled?: boolean; onSelect?: (event: Event) => void; checked?: boolean | "indeterminate"; onCheckedChange?: (checked: boolean) => void };
export const DropdownMenuItem = Object.assign(function DropdownMenuItem(props: ItemProps) { void props; return null; }, { menuKind: "item" });
export const DropdownMenuCheckboxItem = Object.assign(function DropdownMenuCheckboxItem(props: ItemProps) { void props; return null; }, { menuKind: "checkbox" });
export const DropdownMenuLabel = Object.assign(function DropdownMenuLabel(props: HTMLAttributes<HTMLDivElement>) { void props; return null; }, { menuKind: "label" });
export const DropdownMenuSeparator = Object.assign(function DropdownMenuSeparator() { return null; }, { menuKind: "separator" });
function text(children: ReactNode): string { return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : "").join(" "); }
export function DropdownMenuContent({ children, align = "center", side = "bottom", sideOffset = 4, collisionPadding = 12, onEscapeKeyDown, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; align?: "start" | "end" | "center"; side?: "top" | "bottom" | "left" | "right"; sideOffset?: number; collisionPadding?: number; onEscapeKeyDown?: (event: KeyboardEvent) => void }) {
  const { close } = useContext(MenuContext);
  const nodes = flattenMenuChildren<ItemProps>(children);
  const renderItem = (child: ReactElement<ItemProps>, index: number) => {
    if (menuNodeKind(child) === "separator") return <Separator key={`separator-${index}`} />;
    const { onSelect, onCheckedChange, checked, disabled, children: content, className: itemClass, ...itemProps } = child.props;
    return <Dropdown.Item {...itemProps as ComponentProps<typeof Dropdown.Item>} key={child.key ?? index} id={String(child.key ?? index)} textValue={text(content)} isDisabled={disabled} className={itemClass} shouldCloseOnSelect={false} aria-checked={checked === undefined ? itemProps["aria-checked"] : checked === true} onAction={() => {
      const event = new Event("select", { cancelable: true });
      onSelect?.(event);
      if (menuNodeKind(child) === "checkbox") onCheckedChange?.(checked !== true);
      if (!event.defaultPrevented) close();
    }}>{menuNodeKind(child) === "checkbox" && <span className="heroMenuCheck" aria-hidden="true">{checked === true && <Check size={14} />}</span>}{content}</Dropdown.Item>;
  };
  const items: ReactNode[] = [];
  let heading: ReactNode = null;
  for (let index = 0; index < nodes.length; index++) {
    const child = nodes[index];
    if (menuNodeKind(child) === "label") { heading = child.props.children; continue; }
    if (menuNodeKind(child) === "separator") { items.push(<Separator key={`separator-${index}`} />); continue; }
    const checkbox = menuNodeKind(child) === "checkbox";
    if (checkbox || heading) {
      const id = String(child.key ?? index);
      items.push(<Dropdown.Section key={`section-${index}`} selectionMode={checkbox ? "multiple" : undefined} selectedKeys={checkbox ? child.props.checked === true ? [id] : [] : undefined}>
        {heading && <Header>{heading}</Header>}{renderItem(child, index)}
      </Dropdown.Section>);
      heading = null;
    } else items.push(renderItem(child, index));
  }
  const placement = (align === "center" ? side : `${side} ${align}`) as ComponentProps<typeof Dropdown.Popover>["placement"];
  return <Dropdown.Popover data-ui-popup="menu" {...props as ComponentProps<typeof Dropdown.Popover>} placement={placement} offset={sideOffset} containerPadding={collisionPadding} className={className}><div onKeyDown={event => { if (event.key === "Escape") onEscapeKeyDown?.(event.nativeEvent); }}><Dropdown.Menu aria-label={props["aria-label"] ?? "操作菜单"}>{items}</Dropdown.Menu></div></Dropdown.Popover>;
}
