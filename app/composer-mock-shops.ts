import type { ResourceOptions } from "./ComposerResourceMenu";

// UI examples only: never send these IDs to the service or task executor.
export const mockComposerShops = [
  { id: "mock-shop-us", name: "嘻嘻的小铺子·美国", platform: "Amazon", country: "US", mode: "半托管", authorized: true, enabled: true },
  { id: "mock-shop-uk", name: "嘻嘻的小铺子·英国", platform: "TikTok Shop", country: "UK", mode: "全托管", authorized: true, enabled: true },
  { id: "mock-shop-expired", name: "嘻嘻的小铺子·已失效", platform: "Amazon", country: "US", mode: "半托管", authorized: false, enabled: true },
];
export const withMockShops = (options: Partial<ResourceOptions>): ResourceOptions => ({ skill_ids: options.skill_ids ?? [], mcp_ids: options.mcp_ids ?? [], shop_ids: mockComposerShops, supports_shops: true });
