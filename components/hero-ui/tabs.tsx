"use client";
import { Tabs as HeroTabs } from "@heroui/react";
import { createContext, useContext, useState, type ComponentProps } from "react";
const Value = createContext<string | undefined>(undefined);
function Root({ value, defaultValue, onValueChange, ...props }: Omit<ComponentProps<typeof HeroTabs>, "selectedKey" | "defaultSelectedKey" | "onSelectionChange"> & { value?: string; defaultValue?: string; onValueChange?: (value: string) => void }) {
  const [local, setLocal] = useState(defaultValue);
  return <Value.Provider value={value ?? local}><HeroTabs {...props} selectedKey={value ?? local} onSelectionChange={key => { setLocal(String(key)); onValueChange?.(String(key)); }} /></Value.Provider>;
}
function Trigger({ value, children, title, ...props }: Omit<ComponentProps<typeof HeroTabs.Tab>, "id"> & { value: string; title?: string }) {
  const active = useContext(Value) === value;
  return <HeroTabs.Tab {...props} id={value} aria-label={title ?? props["aria-label"]} data-state={active ? "active" : "inactive"}>{children}</HeroTabs.Tab>;
}
function Content({ value, forceMount, hidden: _hidden, ...props }: Omit<ComponentProps<typeof HeroTabs.Panel>, "id"> & { value: string; forceMount?: boolean; hidden?: boolean }) { void _hidden; return <HeroTabs.Panel {...props} id={value} shouldForceMount={forceMount} />; }
export const Tabs = { Root, List: HeroTabs.List, Trigger, Content };
