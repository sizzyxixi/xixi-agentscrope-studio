// Adapted from https://www.assistant-ui.com/elements/composer-model-picker (MIT).
"use client";

import { ModelLogo } from "@/components/ModelLogo";
import { usePreferences } from "@/components/PreferencesProvider";
import { modelBrand, modelBrandNames } from "@/lib/model-brand";
import { cn } from "@/lib/utils";
import { ModelSelectorRoot, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent, ModelSelectorSearch, ModelSelectorList, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorItem, type ModelOption } from "./model-selector";

export type ConfiguredModelOption = ModelOption & { provider?: string; modelName?: string; isDefault?: boolean };
export function ComposerModelPicker({ models, value, onValueChange, disabled, placeholder = "选择模型", className, "aria-label": label = "对话模型" }: {
  models: readonly ConfiguredModelOption[]; value: string; onValueChange: (value: string) => void;
  disabled?: boolean; placeholder?: string; className?: string; "aria-label"?: string;
}) {
  const { t } = usePreferences();
  const options = models.map(model => ({ ...model, icon: model.icon ?? <ModelLogo provider={model.provider} modelName={model.modelName ?? model.name} />, keywords: [...(model.keywords ?? []), model.provider ?? "", model.modelName ?? "", modelBrandNames[modelBrand(model.provider, model.modelName ?? model.name)]] }));
  return <ModelSelectorRoot models={options} value={value} onValueChange={onValueChange}>
    <ModelSelectorTrigger type="button" aria-label={t(label)} disabled={disabled} data-slot="composer-model-trigger" className={cn("xixiSelectTrigger xixiModelTrigger composerModelTrigger", className)}><ModelSelectorValue placeholder={t(placeholder)} showEffort={false} /></ModelSelectorTrigger>
    <ModelSelectorContent data-ui-popup="model" align="end" collisionPadding={12} searchable className="xixiModelPopup composerModelPopup" onEscapeKeyDown={event => event.stopPropagation()}>
      <div className="composerModelHeading">{t("选择模型")}<span>{options.length}</span></div>
      <ModelSelectorSearch placeholder={t("搜索模型或提供方…")} aria-label={t("搜索模型")} />
      <ModelSelectorList><ModelSelectorEmpty>{t("没有匹配的模型")}</ModelSelectorEmpty><ModelSelectorGroup>{options.map(model => <ModelSelectorItem key={model.id} model={model} className="composerModelOption">
        {model.icon}<span className="composerModelCopy"><strong>{model.name}{model.isDefault && <small className="composerModelDefault">{t("默认")}</small>}</strong><span>{[t(modelBrandNames[modelBrand(model.provider, model.modelName ?? model.name)]), model.modelName && model.modelName !== model.name ? model.modelName : ""].filter(Boolean).join(" · ")}</span></span>
      </ModelSelectorItem>)}</ModelSelectorGroup></ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelectorRoot>;
}
