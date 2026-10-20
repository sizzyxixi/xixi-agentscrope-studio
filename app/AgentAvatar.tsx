"use client";

import { useState } from "react";

export function AgentAvatar({ value = "✦", className = "" }: { value?: string; className?: string }) {
  const [failed, setFailed] = useState<string>();
  const isImage = /^https?:\/\//.test(value);
  return <span className={`${className}${isImage ? " agentImageAvatar" : ""}`} aria-hidden="true">
    {isImage && failed !== value ?
      // Platform artwork is served directly from the configured public bucket.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt="" onError={() => setFailed(value)} /> : isImage ? "✦" : value}
  </span>;
}
