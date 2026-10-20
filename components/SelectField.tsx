"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import type { ReactNode } from "react";
import { Select, ListBox } from "@heroui/react";
import {
  ModelSelectorRoot, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent,
  ModelSelectorSearch, ModelSelectorList, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorItem,
  type ModelOption,
} from "./assistant-ui/elements/model-selector";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean };
type SelectFieldProps = {
  value?: string; onValueChange?: (value: string) => void; disabled?: boolean; required?: boolean; name?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

/** Shared HeroUI value selector, including form and keyboard support. */
export function SelectField({ options, placeholder = "请选择", className, "aria-label": label, value, onValueChange, disabled, required, name }: SelectFieldProps) {
  const { t } = usePreferences();
  return <Select aria-label={label ? t(label) : t(placeholder)} selectedKey={value || null} onSelectionChange={key => { if (key !== null) onValueChange?.(String(key)); }} isDisabled={disabled} isRequired={required} name={name} placeholder={t(placeholder)} className="heroSelectField">
    <Select.Trigger className={cn("xixiSelectTrigger", className)}><Select.Value /><Select.Indicator /></Select.Trigger>
    <Select.Popover data-ui-popup="select" placement="bottom start" offset={6} className="xixiSelectPopup">
      <ListBox aria-label={label ? t(label) : t(placeholder)}>{options.map(option => <ListBox.Item key={option.value} id={option.value} isDisabled={option.disabled} textValue={typeof option.label === "string" ? option.label : option.value}>{option.label}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox>
    </Select.Popover>
  </Select>;
}

/** assistant-ui's runtime-independent model selector, backed by the account's real models. */
export function ModelPicker({ models, value, onValueChange, disabled, placeholder = "选择模型", className, "aria-label": label = "对话模型" }: {
  models: readonly ModelOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { t } = usePreferences();
  return <ModelSelectorRoot models={models} value={value} onValueChange={onValueChange}>
    <ModelSelectorTrigger type="button" aria-label={t(label)} disabled={disabled} className={cn("xixiSelectTrigger xixiModelTrigger", className)}>
      <ModelSelectorValue placeholder={t(placeholder)} showEffort={false} />
    </ModelSelectorTrigger>
    <ModelSelectorContent data-ui-popup="model" align="end" collisionPadding={12} searchable className="xixiModelPopup" onEscapeKeyDown={event => event.stopPropagation()}>
      <ModelSelectorSearch placeholder={t("搜索模型…")} aria-label={t("搜索模型")} />
      <ModelSelectorList><ModelSelectorEmpty>{t("没有匹配的模型")}</ModelSelectorEmpty><ModelSelectorGroup>{models.map(model => <ModelSelectorItem key={model.id} model={model} />)}</ModelSelectorGroup></ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelectorRoot>;
}
