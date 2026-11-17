import type { ClaimShop } from './product-claim';

const brands = ['优选生活', '山野户外', '数码生活', '悦己美妆', '轻居家居', '潮流配饰', '日用百货', '臻选好物'];
const platforms = [
  { key: 'amazon', name: 'Amazon', sites: ['US', 'UK', 'DE', 'FR', 'JP', 'CA', 'MX', 'AU'], currencies: ['USD', 'GBP', 'EUR', 'EUR', 'JPY', 'CAD', 'MXN', 'AUD'] },
  { key: 'ebay', name: 'eBay', sites: ['US', 'UK', 'DE', 'AU', 'FR', 'IT', 'CA', 'ES'], currencies: ['USD', 'GBP', 'EUR', 'AUD', 'EUR', 'EUR', 'CAD', 'EUR'] },
  { key: 'lazada', name: 'Lazada', sites: ['SG', 'MY', 'TH', 'PH', 'ID', 'VN', 'SG', 'MY'], currencies: ['SGD', 'MYR', 'THB', 'PHP', 'IDR', 'VND', 'SGD', 'MYR'] },
  { key: 'shopee', name: 'Shopee', sites: ['SG', 'MY', 'TH', 'PH', 'ID', 'VN', 'TW', 'BR'], currencies: ['SGD', 'MYR', 'THB', 'PHP', 'IDR', 'VND', 'TWD', 'BRL'] },
  { key: 'tiktok', name: 'TikTok Shop', sites: ['US', 'UK', 'SG', 'MY', 'TH', 'PH', 'VN', 'ID'], currencies: ['USD', 'GBP', 'SGD', 'MYR', 'THB', 'PHP', 'VND', 'IDR'] },
  { key: 'shopify', name: 'Shopify', sites: ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG'], currencies: ['USD', 'GBP', 'CAD', 'AUD', 'EUR', 'EUR', 'JPY', 'SGD'] },
];

/** Frontend preview source only. Never used as a fallback for real connector authorization. */
export function createClaimShopMocks(): ClaimShop[] {
  return brands.flatMap((brand, index) => platforms.map(platform => ({
    id: `mock-claim-${platform.key}-${index + 1}`, name: `${brand}${platform.key === 'shopify' ? '独立站' : '旗舰店'}`,
    platform: platform.name, site: platform.sites[index], currency: platform.currencies[index],
    active: true, authorized: true, presentationMock: true as const,
  })));
}
