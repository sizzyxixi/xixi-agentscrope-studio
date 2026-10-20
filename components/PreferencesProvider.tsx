"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { translate } from "@/lib/i18n";

export type ThemePreference = "light" | "dark" | "system";
export type Language = "zh-CN" | "en";
const PreferencesContext = createContext({ theme: "system" as ThemePreference, setTheme: (value: ThemePreference) => { void value; }, language: "zh-CN" as Language, setLanguage: (value: Language) => { void value; }, t: (text: string) => text });

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [language, setLanguage] = useState<Language>("zh-CN");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.queueMicrotask(() => {
      const savedTheme = window.localStorage.getItem("xixi-theme");
      const savedLanguage = window.localStorage.getItem("xixi-language");
      setTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system");
      setLanguage(savedLanguage === "en" ? "en" : "zh-CN");
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? media.matches ? "dark" : "light" : theme; };
    apply();
    window.localStorage.setItem("xixi-theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, ready]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    window.localStorage.setItem("xixi-language", language);
  }, [language, ready]);
  const t = useCallback((text: string) => translate(text, language), [language]);
  return <PreferencesContext.Provider value={{ theme, setTheme, language, setLanguage, t }}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
