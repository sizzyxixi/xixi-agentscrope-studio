"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import type { ReactNode } from "react";
import { Select, ListBox } from "@heroui/react";
import { ComposerModelPicker, type ConfiguredModelOption } from "./assistant-ui/elements/composer-model-picker";
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

/** Shared configured-model picker, including the composer and task editors. */
export function ModelPicker(props: {
  models: readonly ConfiguredModelOption[]; value: string; onValueChange: (value: string) => void;
  disabled?: boolean; placeholder?: string; className?: string; "aria-label"?: string;
}) {
  return <ComposerModelPicker {...props} />;
}
