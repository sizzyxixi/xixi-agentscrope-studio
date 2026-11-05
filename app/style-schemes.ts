import type { MaterialBrand, MaterialLibraryState, LibraryReference } from "./material-library-data";

export function styleReference(scheme: MaterialBrand): LibraryReference {
  const images = [...new Set(scheme.referenceImages ?? [])];
  return { id: scheme.id, kind: "brand", name: scheme.name, summary: scheme.prompt, images, image: images[0] };
}

const styles: MaterialBrand[] = [
  {id:"style-natural-skincare",name:"护肤系列 · 自然光",space:"personal",prompt:"柔和窗边日光，浅色石材台面，自然植物投影；留出文案空间，突出瓶身材质与商品真实外观。",referenceImages:["/creative/skincare.jpg"],cover:"/creative/skincare.jpg",updatedAt:"2026-11-03T09:00:00+08:00"},
  {id:"style-warm-campaign",name:"秋日上新 · 温暖生活方式",space:"personal",prompt:"温暖的秋日生活方式，木质与织物元素，柔和侧光，轻松自然的构图；适合上新活动及多款商品系列内容。",referenceImages:["/creative/coffee.jpg","/creative/interior.jpg"],cover:"/creative/coffee.jpg",updatedAt:"2026-11-03T09:00:00+08:00"},
];

export function upgradeStyleLibrary(state: MaterialLibraryState): MaterialLibraryState {
  if ((state.styleVersion ?? 0) >= 1) return state;
  return {...state,styleVersion:1,brands:[...state.brands,...styles.filter(scheme=>!state.brands.some(item=>item.id===scheme.id))]};
}

/** Ignore retired style fields in restored drafts without altering stored resource data. */
export function normalizeStyleReferences(references: LibraryReference[]): LibraryReference[] {
  return references.map(reference=>{
    if(reference.kind!=="brand")return reference;
    const {colors:_colors,logo,includeLogo:_includeLogo,...active}=reference;
    const images=active.images?.filter(url=>url!==logo);
    return {...active,...(images?{images}:{}),image:active.image===logo?images?.[0]:active.image};
  });
}

export const MAX_STYLE_REFERENCE_IMAGES = 5;
export function addStyleImages(current:string[],incoming:string[]):string[]{
  return [...new Set([...current,...incoming])].slice(0,MAX_STYLE_REFERENCE_IMAGES);
}

export function hasStyleContent(scheme:Pick<MaterialBrand,"prompt"|"referenceImages">):boolean {
  return Boolean(scheme.prompt.trim()||scheme.referenceImages?.some(image=>image.trim()));
}
