// Adapted from assistant-ui Model Selector (MIT), rendered with HeroUI.
"use client";
import { Children, isValidElement, useMemo, type ReactNode, type ComponentProps } from "react";
import { Autocomplete, ListBox, Radio, RadioGroup, SearchField, Separator } from "@heroui/react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { getModelEfforts, ModelSelectorContext, resolveEffort, useControllableState, useModelSelectorContext, useModelSelectorEfforts, type ModelOption } from "../utils/model-selection";
export { DEFAULT_EFFORT_OPTIONS, resolveModelEffort, useModelSelectorContext, useModelSelectorEfforts } from "../utils/model-selection";
export type { ModelOption, ModelSelectorEffortOption } from "../utils/model-selection";

export type ModelSelectorRootProps = {
  models: readonly ModelOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  effort?: string;
  defaultEffort?: string;
  onEffortChange?: (effort: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

function ModelSelectorRoot({
  models,
  value: valueProp,
  defaultValue,
  onValueChange,
  effort: effortProp,
  defaultEffort,
  onEffortChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
}: ModelSelectorRootProps) {
  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? models[0]?.id,
    onChange: onValueChange,
  });
  const [effort, setEffort] = useControllableState({
    prop: effortProp,
    defaultProp: defaultEffort,
    onChange: onEffortChange,
  });
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  const selectedModel = models.find((m) => m.id === value);
  const efforts = getModelEfforts(selectedModel);
  const activeEffort = resolveEffort(efforts, effort);
  const contextValue = useMemo(
    () => ({
      models,
      value,
      setValue,
      selectedModel,
      efforts,
      effort: activeEffort,
      setEffort,
      open: open ?? false,
      setOpen,
    }),
    [
      models,
      value,
      setValue,
      selectedModel,
      efforts,
      activeEffort,
      setEffort,
      open,
      setOpen,
    ],
  );

  return (
    <ModelSelectorContext.Provider value={contextValue}>
      <Popover open={open ?? false} onOpenChange={setOpen}>
        {children}
      </Popover>
    </ModelSelectorContext.Provider>
  );
}


export function ModelSelectorTrigger({ className, children, ...props }: ComponentProps<typeof PopoverTrigger>) {
  const { setOpen } = useModelSelectorContext();
  return <PopoverTrigger {...props} onKeyDown={event => { props.onKeyDown?.(event); if (!event.defaultPrevented && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setOpen(true); } }} data-slot="model-selector-trigger" className={cn("heroModelTrigger", className)}>{children ?? <ModelSelectorValue />}<ChevronDownIcon size={14} /></PopoverTrigger>;
}
export function ModelSelectorValue({ placeholder = "Select model", showEffort = true, className }: { placeholder?: ReactNode; showEffort?: boolean; className?: string }) {
  const { selectedModel, efforts, effort } = useModelSelectorContext();
  return <span data-slot="model-selector-value" className={cn("heroModelValue", className)}>{selectedModel?.icon}<span>{selectedModel?.name ?? placeholder}</span>{showEffort && effort && <small>{efforts?.find(item => item.id === effort)?.name}</small>}</span>;
}
export function ModelSelectorContent({ searchable = true, children, className, ...props }: ComponentProps<typeof PopoverContent> & { searchable?: boolean }) {
  return <PopoverContent {...props} className={cn("heroModelPopup", className)}><Autocomplete.Filter filter={(text, input) => text.toLocaleLowerCase().includes(input.toLocaleLowerCase())}>{children ?? <>{searchable && <ModelSelectorSearch />}<ModelSelectorList /><ModelSelectorEffort /></>}</Autocomplete.Filter></PopoverContent>;
}
export function ModelSelectorSearch({ placeholder = "Search models…", "aria-label": label = "搜索模型", ...props }: ComponentProps<typeof SearchField.Input>) {
  const { models, setValue, setOpen } = useModelSelectorContext();
  return <SearchField aria-label={label} className="heroModelSearch" autoFocus><SearchField.Group><SearchField.SearchIcon /><SearchField.Input {...props} placeholder={placeholder} onKeyDown={event => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter") return;
    const input = event.currentTarget as HTMLInputElement;
    const active = input.getAttribute("aria-activedescendant");
    const id = active ? input.ownerDocument.getElementById(active)?.dataset.modelId : undefined;
    const model = models.find(item => item.id === id);
    if (model && !model.disabled) { event.preventDefault(); event.stopPropagation(); setValue(model.id); setOpen(false); }
  }} /></SearchField.Group></SearchField>;
}
export function ModelSelectorEmpty(props: { children?: ReactNode }) { void props; return null; }
export function ModelSelectorGroup({ children }: { children: ReactNode }) { return <>{children}</>; }
export function ModelSelectorList({ children, className, ...props }: Omit<ComponentProps<typeof ListBox>, "children"> & { children?: ReactNode }) {
  const { models, value, setValue, setOpen } = useModelSelectorContext();
  const elements = Children.toArray(children);
  const empty = elements.find(child => isValidElement(child) && child.type === ModelSelectorEmpty);
  const emptyText = isValidElement<{ children?: ReactNode }>(empty) ? empty.props.children : "没有匹配的结果";
  const items = elements.filter(child => !(isValidElement(child) && child.type === ModelSelectorEmpty));
  return <ListBox {...props} aria-label={props["aria-label"] ?? "可选模型或智能体"} className={cn("heroModelList", className)} selectionMode="single" selectedKeys={value ? [value] : []} renderEmptyState={() => <div className="heroModelEmpty">{emptyText}</div>} onSelectionChange={keys => { const key = keys === "all" ? undefined : keys.values().next().value; const model = models.find(item => item.id === key); if (!model || model.disabled) return; setValue(String(key)); setOpen(false); }} onAction={key => { const model = models.find(item => item.id === key); if (!model || model.disabled) return; setValue(String(key)); setOpen(false); }}>{children ? items : models.map(model => <ModelSelectorItem key={model.id} model={model} />)}</ListBox>;
}
export function ModelSelectorItem({ model, children, className }: { model: ModelOption; children?: ReactNode; className?: string }) {
  const { value } = useModelSelectorContext();
  return <ListBox.Item id={model.id} textValue={[model.name, model.id, ...(model.keywords ?? [])].join(" ")} isDisabled={model.disabled} className={cn("heroModelItem", className)} data-slot="model-selector-item" data-model-id={model.id}>{children ?? <>{model.icon}<span className="heroModelCopy"><strong>{model.name}</strong>{model.description && <small>{model.description}</small>}</span></>}{value === model.id && <CheckIcon size={15} />}</ListBox.Item>;
}
export function ModelSelectorEffort({ label = "Thinking" }: { label?: string }) {
  const { efforts, effort, setEffort } = useModelSelectorEfforts();
  if (!efforts?.length) return null;
  return <RadioGroup aria-label={label} orientation="horizontal" value={effort ?? ""} onChange={setEffort} className="heroModelEffort">{efforts.map(option => <Radio key={option.id} value={option.id}><Radio.Content>{option.name}</Radio.Content></Radio>)}</RadioGroup>;
}
export function ModelSelectorSeparator() { return <Separator />; }
export { ModelSelectorRoot };
