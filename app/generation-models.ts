export type GenerationModelOption = {
  id: string;
  demoCredits: Readonly<Record<string, number>>;
};

// Frontend demonstration values. Replace this table when formal pricing is available.
export const imageGenerationModels: readonly GenerationModelOption[] = [
  { id: "image2", demoCredits: { "1K": 8, "2K": 12, "4K": 20 } },
  { id: "image2.5", demoCredits: { "1K": 12, "2K": 18, "4K": 30 } },
  { id: "banana2.1", demoCredits: { "1K": 6, "2K": 10, "4K": 16 } },
];

// Keep the existing demo video model choices; video estimates use credits per second.
export const videoGenerationModels: readonly GenerationModelOption[] = [
  { id: "标准", demoCredits: { "768P": 6, "1080P": 10 } },
  { id: "高保真", demoCredits: { "768P": 10, "1080P": 16 } },
  { id: "创意", demoCredits: { "768P": 8, "1080P": 12 } },
];

export function generationModelOptions(mode: string): readonly GenerationModelOption[] {
  return mode === "video" ? videoGenerationModels : imageGenerationModels;
}

export function normalizeGenerationModel(mode: string, model?: string): string {
  const options = generationModelOptions(mode);
  return options.find(option => option.id === model)?.id ?? options[0].id;
}

export function generationCreditEstimate(mode: string, model: string, resolution: string): number | null {
  const credits = generationModelOptions(mode).find(option => option.id === model)?.demoCredits[resolution];
  return typeof credits === "number" && Number.isFinite(credits) ? credits : null;
}
