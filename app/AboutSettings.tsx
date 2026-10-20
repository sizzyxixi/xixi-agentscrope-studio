"use client";

import { usePreferences } from "@/components/PreferencesProvider";

export function AboutSettings() {
  const { t } = usePreferences();
  return <section className="contentPanel settingsContent aboutSettings">
    <h3>{t("关于")}</h3>
    <p className="aboutIntroduction">{t("hi，我是 AI 产品经理 陈茜茜。这是我正在构建的一个 Agent 项目，用于学习目的。如果你想联系我，请扫描以下微信二维码加我～")}</p>
    {/* Display the supplied public QR image directly, preserving its original proportions. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="aboutWechatQr" src="https://bmfppeqixqhinyklhbzo.supabase.co/storage/v1/object/public/xixi-agentscope-studio/assert/wechat_qrcode.jpg" alt={t("陈茜茜的微信二维码")} width={280} decoding="async" />
  </section>;
}
