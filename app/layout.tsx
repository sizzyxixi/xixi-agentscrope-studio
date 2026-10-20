import type { Metadata } from "next";
import "./globals.css";
import { OperationFeedbackProvider } from "@/components/OperationFeedback";
import { PreferencesProvider } from "@/components/PreferencesProvider";

export const metadata: Metadata = {
  title: "xixi agent studio",
  description:
    "XIXI personal Agent workspace with skills, MCP, knowledge, memory, workflows and scheduled tasks.",
  icons: {
    icon: { url: "/xixi-agent-logo.png", type: "image/png" },
    shortcut: "/xixi-agent-logo.png",
    apple: "/xixi-agent-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body><PreferencesProvider><OperationFeedbackProvider>{children}</OperationFeedbackProvider></PreferencesProvider></body>
    </html>
  );
}
