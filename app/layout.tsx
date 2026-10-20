import type { Metadata } from "next";
import "./globals.css";
import { PreferencesProvider } from "@/components/PreferencesProvider";

export const metadata: Metadata = {
  title: "xixi agent studio",
  description:
    "XIXI personal Agent workspace with skills, MCP, knowledge, memory, workflows and scheduled tasks.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body><PreferencesProvider>{children}</PreferencesProvider></body>
    </html>
  );
}
