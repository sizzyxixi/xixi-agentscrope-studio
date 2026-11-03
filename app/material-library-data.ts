import type { Media } from "./commerce-demo-data";

export type MaterialSpace = "personal" | "enterprise";
export type MaterialMeta = { updatedAt?: string; folder?: string; description?: string; tags?: string[]; owner?: string; bytes?: number; deletedAt?: string; collection?: boolean; usedAt?: string };
export type MaterialBrand = { id: string; name: string; space: MaterialSpace; colors: string[]; prompt: string; cover: string; logo?: string; updatedAt: string; deletedAt?: string };
export type MaterialModel = { id: string; name: string; space: MaterialSpace; source: "official" | "upload" | "custom"; image: string; description: string; favorite?: boolean; updatedAt: string; deletedAt?: string };
export type MaterialFolder = { id: string; name: string; space: MaterialSpace; deletedAt?: string };
export type LibraryReference = { id: string; kind: "brand" | "model" | "knowledge"; name: string; summary: string; image?: string; colors?: string[] };
export type MaterialLibraryState = { metadata: Record<string, MaterialMeta>; brands: MaterialBrand[]; models: MaterialModel[]; folders: MaterialFolder[] };
const date = "2026-11-03T08:00:00+08:00";
const textFile = (text: string) => `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

export const materialMediaSeed: Media[] = [
  { id:"ml-history-fragrance", name:"SANTAL · 香氛上新主视觉",type:"image",url:"/creative/generated/fragrance-v1.webp",source:"历史创作",jobId:"ml-job-fragrance",createdAt:date,space:"personal",favorite:true },
  { id:"ml-history-living", name:"餐厅场景 · 自然光版本",type:"image",url:"/creative/generated/interior-v1.webp",source:"历史创作",jobId:"ml-job-interior",createdAt:"2026-11-02T16:10:00+08:00",space:"personal" },
  { id:"ml-history-skin", name:"植物精萃 · 商品场景图",type:"image",url:"/creative/skincare.jpg",source:"历史创作",jobId:"ml-job-skincare",createdAt:"2026-11-02T15:30:00+08:00",space:"personal" },
  { id:"ml-history-coffee", name:"咖啡日常 · 温暖生活方式",type:"image",url:"/creative/coffee.jpg",source:"历史创作",jobId:"ml-job-coffee",createdAt:"2026-11-02T14:10:00+08:00",space:"personal" },
  { id:"ml-history-baby", name:"母婴上新 · 柔和色调",type:"image",url:"/creative/templates/baby-v1.jpg",source:"历史创作",jobId:"ml-job-baby",createdAt:"2026-11-02T12:00:00+08:00",space:"personal" },
  { id:"ml-history-pet", name:"宠物生活 · 场景补图",type:"image",url:"/creative/templates/pet-v1.jpg",source:"历史创作",jobId:"ml-job-pet",createdAt:"2026-11-01T11:00:00+08:00",space:"personal" },
  { id:"ml-history-watch", name:"腕表 · 细节展示",type:"image",url:"/creative/watch.jpg",source:"历史创作",jobId:"ml-job-watch",createdAt:"2026-11-01T10:00:00+08:00",space:"personal" },
  { id:"ml-history-file",name:"秋季上新内容计划.md",type:"document",url:textFile("# 秋季上新内容计划\n\n## 内容目标\n为新商品准备主视觉、场景图与卖点展示。\n\n## 创作清单\n1. 核对商品与 SKU\n2. 复用店铺常用背景和视觉风格\n3. 检查商品外观与文案\n4. 选用作品并分享给团队"),source:"历史创作",jobId:"ml-job-file",createdAt:"2026-11-01T09:00:00+08:00",space:"personal" },
  { id:"ml-history-garden",name:"自然光 · 花园环境镜头.mp4",type:"video",url:"/materials/garden.mp4",poster:"/creative/video-previews/product-poster-v1.jpg",source:"历史创作",jobId:"ml-job-garden",createdAt:"2026-11-02T10:00:00+08:00",space:"personal" },
  { id:"ml-bg-warm",name:"暖调石膏 · 陈列背景",type:"image",url:"/materials/background-sand.svg",source:"用户上传",createdAt:date,space:"personal",favorite:true },
  { id:"ml-bg-sage",name:"鼠尾草绿 · 商品展台",type:"image",url:"/materials/background-sage.svg",source:"用户上传",createdAt:"2026-11-02T11:00:00+08:00",space:"personal" },
  { id:"ml-bg-room",name:"自然光 · 室内场景参考",type:"image",url:"/creative/interior.jpg",source:"用户上传",createdAt:"2026-11-01T11:00:00+08:00",space:"personal" },
  { id:"ml-bg-spa",name:"柔和日光 · 浴室场景",type:"image",url:"/creative/templates/service-v1.jpg",source:"用户上传",createdAt:date,space:"enterprise",favorite:true },
  { id:"ml-team-fragrance",name:"SANTAL · 品牌视觉参考",type:"image",url:"/creative/generated/fragrance-v1.webp",source:"企业上传",createdAt:date,space:"enterprise" },
  { id:"ml-team-bg",name:"奶油白 · 常用棚拍背景",type:"image",url:"/materials/background-cream.svg",source:"企业上传",createdAt:"2026-11-02T16:00:00+08:00",space:"enterprise" },
  { id:"ml-team-product",name:"护肤系列 · 质感参考",type:"image",url:"/creative/perfume.jpg",source:"企业上传",createdAt:"2026-11-02T15:00:00+08:00",space:"enterprise" },
  { id:"ml-team-toy",name:"童趣系列 · 活动视觉",type:"image",url:"/creative/templates/toy-v1.jpg",source:"企业上传",createdAt:"2026-11-01T14:00:00+08:00",space:"enterprise" },
  { id:"ml-team-doc",name:"团队素材使用说明.txt",type:"document",url:textFile("团队素材使用说明\n\n所有企业成员可查看、编辑并引用共享素材。\n上传时沿用文件名，可按需整理。\n文件删除由管理员操作。\n\n更新品牌和模特后，请核对本轮采用的资源。"),source:"企业上传",createdAt:"2026-11-01T10:00:00+08:00",space:"enterprise" },
];

export const officialModels: MaterialModel[] = [
  {id:"official-mia",name:"Mia",space:"personal",source:"official",image:"/materials/model-mia.jpg",description:"自然气质 · 肖像与人物参考",updatedAt:date},
  {id:"official-alex",name:"Alex",space:"personal",source:"official",image:"/materials/model-alex.jpg",description:"休闲气质 · 人物形象参考",updatedAt:date},
  {id:"official-lina",name:"Lina",space:"personal",source:"official",image:"/materials/model-lina.jpg",description:"清新自然 · 生活方式参考",updatedAt:date},
];

export const knowledgeSamples = [
  {id:"knowledge-brand",name:"店铺视觉与文案规范",summary:"保持商品真实外观。采用自然光、简洁构图和柔和色调；文案简洁，优先使用已确认卖点。",updatedAt:"2026-11-02",pages:"3 页",status:"可引用"},
  {id:"knowledge-campaign",name:"秋季上新活动说明",summary:"活动主题为秋日焕新。优先展示新款与使用场景，价格、权益和活动日期以运营最终确认内容为准。",updatedAt:"2026-11-01",pages:"2 页",status:"可引用"},
  {id:"knowledge-product",name:"商品内容检查清单",summary:"核对 SKU、商品颜色、数量和配件；避免改变材质与外观；检查文案、画面比例和引用来源。",updatedAt:"2026-10-31",pages:"1 页",status:"可引用"},
];

export const materialLibrarySeed: MaterialLibraryState = {
  metadata:{
    "ml-bg-warm":{folder:"folder-background",tags:["背景","暖调"],collection:true,owner:"我",description:"适合商品陈列的暖色展台，可作为背景原图或构图参考。"},
    "ml-bg-sage":{folder:"folder-background",tags:["背景","展台"],collection:true,owner:"我"},
    "ml-bg-room":{folder:"folder-scenes",tags:["场景","家居"],collection:true,owner:"我"},
    "ml-history-fragrance":{tags:["香氛","上新"],owner:"我"},
    "ml-bg-spa":{folder:"team-scenes",tags:["场景","自然光"],owner:"林晓",description:"团队常用的自然光场景参考。"},
    "ml-team-fragrance":{tags:["品牌","参考"],owner:"陈悦"},
    "ml-team-bg":{folder:"team-scenes",tags:["背景"],owner:"林晓"},
  },
  folders:[{id:"folder-background",name:"常用背景",space:"personal"},{id:"folder-scenes",name:"场景参考",space:"personal"},{id:"team-scenes",name:"团队常用",space:"enterprise"}],
  brands:[
    {id:"brand-santal",name:"SANTAL",space:"personal",colors:["#34483E","#D9D3BC","#F2EEE4"],prompt:"自然极简，柔和日光，低饱和植物色调；突出商品质感，画面留白，保持品牌识别。",cover:"/creative/generated/fragrance-v1.webp",updatedAt:date},
    {id:"brand-everyday",name:"EVERYDAY",space:"personal",colors:["#C67E5F","#EEE3D1","#33332F"],prompt:"温暖的日常生活方式，自然材质与细腻阴影，简洁构图，突出商品本身。",cover:"/creative/coffee.jpg",updatedAt:date},
    {id:"brand-botanic",name:"BOTANIC",space:"enterprise",colors:["#768E74","#E5E8D8","#F7F4EA"],prompt:"清新植物调性，柔和自然光，浅色背景，强调真实商品外观与日常使用场景。",cover:"/creative/skincare.jpg",updatedAt:date},
  ],
  models:[{...officialModels[0],id:"saved-mia",favorite:true},{...officialModels[1],id:"team-alex",space:"enterprise",favorite:true}],
};

export function isCreation(media: Media) { return !/上传/.test(media.source) && (Boolean(media.jobId) || /创作|生成|编辑/.test(media.source)); }
export function isInCreationHistory(media: Media, now = Date.now()) { return isCreation(media) && now - Date.parse(media.createdAt) < 365 * 86400000; }
export function mediaSpace(media: Media): MaterialSpace { return media.space ?? "personal"; }
export function isMaterialAvailable(media: Media, state: MaterialLibraryState) { return !state.metadata[media.id]?.deletedAt && !media.placeholder; }
export function formatMaterialDate(value: string) { return new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit"}).format(new Date(value)); }
export function materialType(media: Media) { return media.type === "image" ? "图片" : media.type === "video" ? "视频" : "文件"; }
