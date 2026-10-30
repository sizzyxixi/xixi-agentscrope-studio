export const templatePlatforms=["TikTok Shop","Amazon","eBay","Shopify","Shopee","Temu"] as const;
export const templateCategories=["美妆","宠物","服务","玩具","母婴","家具"] as const;
export type TemplateFiltersState={scene:string;tool:string;platform:string;category:string};
export const emptyTemplateFilters=():TemplateFiltersState=>({scene:"",tool:"",platform:"",category:""});
export function matchesTemplate(template:{scene:string;tool:string;category:string;platforms:readonly string[]},filters:TemplateFiltersState){return (!filters.scene||template.scene===filters.scene)&&(!filters.tool||template.tool===filters.tool)&&(!filters.category||template.category===filters.category)&&(!filters.platform||template.platforms.includes(filters.platform));}
