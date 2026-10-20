"use client";
import { createContext, useContext, type ReactNode, type Context } from "react";
import type { useFileController } from "./FileWorkspace";
type FileContextValue = ReturnType<typeof useFileController>;
// Preserve context identity while Vite refreshes attachment renderers independently.
const developmentContexts = globalThis as typeof globalThis & {
  __xixiFileWorkspaceContext?: Context<FileContextValue | null>;
};
const FileContext =
  developmentContexts.__xixiFileWorkspaceContext ??
  createContext<FileContextValue | null>(null);
if (process.env.NODE_ENV === "development")
  developmentContexts.__xixiFileWorkspaceContext = FileContext;
export function useFiles() {
  const value = useContext(FileContext);
  if (!value) throw new Error("FileWorkspace provider missing");
  return value;
}
export function FileProvider({
  value,
  children,
}: {
  value: FileContextValue;
  children: ReactNode;
}) {
  return <FileContext.Provider value={value}>{children}</FileContext.Provider>;
}
