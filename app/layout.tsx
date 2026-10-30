import type { Metadata } from "next";
import "./globals.css";
import "./studio-foundations.css";
import { OperationFeedbackProvider } from "@/components/OperationFeedback";
import { PreferencesProvider } from "@/components/PreferencesProvider";

export const metadata: Metadata = {
  title: "XIXI · AI 创作空间",
  description:
    "用 AI 将灵感变成作品。图片、视频、商品设计与个人创意资产，一处开始。",
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
    // Extensions can inject attributes on html (Immersive Translate) and body (Monica).
    // Suppression is limited to these root elements; descendants retain hydration checks.
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning><PreferencesProvider><OperationFeedbackProvider>{children}</OperationFeedbackProvider></PreferencesProvider></body>
    </html>
  );
}
