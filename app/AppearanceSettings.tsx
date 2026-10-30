"use client";
import { StudioButton } from "./StudioControls";

import { usePreferences, type Language, type ThemePreference } from "@/components/PreferencesProvider";
import { SelectField } from "@/components/SelectField";
import { Moon, Sun, Monitor } from "lucide-react";

export function AppearanceSettings() {
  const { theme, setTheme, language, setLanguage, t } = usePreferences();
  return <section className="contentPanel settingsContent appearanceSettings">
    <h3>{t("外观")}</h3>
    <div className="appearanceSection"><h4>{t("主题")}</h4><p>{t("选择界面的显示模式。跟随系统会随设备外观自动切换。")}</p>
      <div className="themeChoices" role="radiogroup" aria-label={t("主题")}>{([{ value: "light", label: "亮色", Icon: Sun }, { value: "dark", label: "暗色", Icon: Moon }, { value: "system", label: "跟随系统", Icon: Monitor }] as const).map(({ value, label, Icon }) => <StudioButton key={value} type="button" role="radio" aria-checked={theme === value} className={`themeChoice ${theme === value ? "selected" : ""}`} onClick={() => setTheme(value as ThemePreference)}><span className={`themePreview ${value}`} aria-hidden="true"><i /><b /><em /></span><span><Icon size={17} />{t(label)}<i className="themeRadio" /></span></StudioButton>)}</div>
    </div>
    <div className="appearanceSection"><label htmlFor="appearance-language">{t("语言")}</label><p>{t("选择界面语言，设置会自动保存。")}</p><SelectField aria-label={t("界面语言")} value={language} onValueChange={value => setLanguage(value as Language)} options={[{ value: "zh-CN", label: "简体中文" }, { value: "en", label: "English" }]} /></div>
    <p className="formHint">{t("设置自动生效，并保存在当前浏览器。")}</p>
  </section>;
}
