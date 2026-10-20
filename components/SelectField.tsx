"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import type { ComponentProps, ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  ModelSelectorRoot, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent,
  ModelSelectorSearch, ModelSelectorList, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorItem,
  type ModelOption,
} from "./assistant-ui/elements/model-selector";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean };
type SelectFieldProps = Pick<ComponentProps<typeof Select>, "value" | "onValueChange" | "disabled" | "required" | "name"> & {
  options: readonly SelectOption[];
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

/** Global value selector using assistant-ui's official Select registry component. */
export function SelectField({ options, placeholder = "请选择", className, "aria-label": label, ...props }: SelectFieldProps) {
  const { t } = usePreferences();
  return <Select {...props}>
    <SelectTrigger aria-label={label ? t(label) : undefined} className={cn("xixiSelectTrigger", className)}><SelectValue placeholder={t(placeholder)} /></SelectTrigger>
    <SelectContent data-ui-popup="select" position="popper" align="start" sideOffset={6} collisionPadding={12} className="xixiSelectPopup" onEscapeKeyDown={event => event.stopPropagation()}>
      {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
    </SelectContent>
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
