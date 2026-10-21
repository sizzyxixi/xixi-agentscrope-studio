"use client";

import Image from "next/image";
import { Box, Network } from "lucide-react";
import { ClaudeLogo, GeminiLogo, OpenAILogo } from "./assistant-ui/elements/logos";
import { modelBrand, type ModelBrand } from "@/lib/model-brand";
import { cn } from "@/lib/utils";

// Additional local marks: @lobehub/icons-static-svg 1.95.1 (MIT).
// See docs/licenses/lobe-icons-MIT.txt.
const assets: Partial<Record<ModelBrand, string>> = { deepseek: "deepseek-color.svg", qwen: "qwen-color.svg", kimi: "kimi-color.svg", doubao: "doubao-color.svg", ollama: "ollama.svg" };
/** Decorative: each use is adjacent to an accessible model/provider name. */
export function ModelLogo({ provider, modelName, className }: { provider?: string; modelName?: string; className?: string }) {
  const brand = modelBrand(provider, modelName);
  const path = assets[brand];
  return <span className={cn("modelProviderLogo", `modelProviderLogo--${brand}`, className)} data-model-brand={brand} aria-hidden="true">
    {brand === "openai" ? <OpenAILogo /> : brand === "anthropic" ? <ClaudeLogo /> : brand === "gemini" ? <GeminiLogo /> : path ? <Image src={`/model-logos/${path}`} alt="" width={20} height={20} unoptimized /> : brand === "compatible" ? <Network size={18} /> : <Box size={18} />}
  </span>;
}
