import {sampleVideoPoster,videoResultTrace} from "./video-session";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
import type { CreativeJob, Media, Product } from "./commerce-demo-data";
import { boxSvg, svgUrl } from "./creative-editing";
export const fragranceProduct:Product={id:"p-santal",name:"SANTAL 木质香水",code:"SANTAL-50",brand:"SANTAL",category:"美妆香氛",source:"商品资料",selling:"雪松与琥珀香调，50ml 便携玻璃瓶",material:"玻璃瓶 · 金属瓶盖",dimensions:"6 × 4 × 12 cm",audience:"喜欢木质香调的都市人群",packaging:"独立纸盒",skus:[{id:"sku-santal-50",code:"SANTAL-EDP-50",color:"琥珀色",spec:"50ml"}]};
const createdAt="2026-10-30T06:00:00.000Z";
export const creativeSampleMedia:Media[]=[
 {id:"sample-santal-video-v1",name:"SANTAL · 自然光商品短片",url:"",placeholder:true,poster:sampleVideoPoster,type:"video",source:"商品视频",jobId:"creative-santal-video",createdAt,duration:6,width:1366,height:768,version:1},
 {id:"sample-perfume-hero",name:"SANTAL · 自然光主视觉",url:perfumeArtwork,type:"image",source:"商品套图",jobId:"creative-santal-us",createdAt},
 {id:"sample-perfume-scene",name:"SANTAL · 香氛场景",url:"/creative/generated/fragrance-v1.webp",type:"image",source:"商品套图",jobId:"creative-santal-us",createdAt},
 {id:"sample-perfume-detail",name:"SANTAL · 产品细节",url:"/creative/perfume.jpg",type:"image",source:"商品套图",jobId:"creative-santal-us",createdAt},
 {id:"sample-box-tuck",name:"SANTAL · 插口盒展开图",url:svgUrl(boxSvg()),type:"image",source:"包装设计",jobId:"creative-santal-box",createdAt},
 {id:"sample-box-mailer",name:"SANTAL · 飞机盒展开图",url:svgUrl(boxSvg("mailer")),type:"image",source:"包装设计",jobId:"creative-santal-box",createdAt},
 {id:"sample-layer-poster",name:"SANTAL · 品牌海报.psd",url:perfumeArtwork,type:"image",source:"图层设计",jobId:"creative-santal-psd",createdAt},
];
const base:Omit<CreativeJob,"id"|"title"|"prompt"|"messages"|"mediaIds">={mode:"image",scene:"电商设计",tool:"平台套图",productIds:[fragranceProduct.id],skuIds:["sku-santal-50"],snapshot:[fragranceProduct],referenceIds:[],platform:"Amazon",site:"美国 US",language:"英语",ratio:"1:1",quality:"2K",amount:"3",template:"香氛品牌视觉",fields:{model:"高保真",languageModel:"通用语言模型"},createdAt};
export const creativeSampleJobs:CreativeJob[]=[
 {...base,id:"creative-santal-video",title:"香水视频 · TikTok 美国",mode:"video",scene:"商品视频",tool:"商品视频",ratio:"16:9",quality:"768P",amount:"6",fields:{...base.fields,videoStage:"placeholder",videoDuration:"6",videoCountry:"US",videoLanguage:"英语"},platform:"TikTok",site:"US",prompt:"为 SANTAL 香水生成 6 秒商品短片，用温暖自然光突出琥珀色瓶身与木质香调，发布到 TikTok 美国市场。",mediaIds:["sample-santal-video-v1"],messages:[{role:"user",text:"为 SANTAL 香水生成 6 秒商品短片，用温暖自然光突出琥珀色瓶身与木质香调，发布到 TikTok 美国市场。"},{role:"assistant",text:"视频方案已整理，可以先准备发布文案与计划。",mediaIds:["sample-santal-video-v1"],trace:videoResultTrace(createdAt)}]},
 {...base,id:"creative-santal-us",title:"香水套图 · Amazon 美国",editorKind:"image",prompt:"为 SANTAL 木质香水生成一组亚马逊美国站商品图。使用温暖的自然光，突出琥珀色玻璃质感，整体保持简洁高级。",mediaIds:creativeSampleMedia.filter(m=>m.type==="image").slice(0,3).map(m=>m.id),messages:[{role:"user",text:"为 SANTAL 木质香水生成一组亚马逊美国站商品图。使用温暖的自然光，突出琥珀色玻璃质感，整体保持简洁高级。"},{role:"assistant",text:"这组视觉包含自然光主视觉、香氛场景与产品细节。点击右侧缩略图切换，放大后可以标注需要调整的位置。",mediaIds:creativeSampleMedia.filter(m=>m.type==="image").slice(0,3).map(m=>m.id)}]},
 {...base,id:"creative-santal-box",title:"香水包装 · 纸盒展开图",editorKind:"packaging",tool:"包装概念",scene:"新品开发",ratio:"自定义",fields:{...base.fields,boxTemplate:"tuck"},prompt:"为这款 50ml 香水设计纸盒包装，尺寸 60 × 120 × 40mm。使用奶油白底色与金色品牌字样，提供可查看折线的展开图。",mediaIds:["sample-box-tuck","sample-box-mailer"],messages:[{role:"user",text:"为这款 50ml 香水设计纸盒包装，尺寸 60 × 120 × 40mm。使用奶油白底色与金色品牌字样，提供可查看折线的展开图。"},{role:"assistant",text:"为你准备了插口折叠盒和飞机盒两种方案。放大展开图后，可以在右侧切换盒型并调整尺寸。",mediaIds:["sample-box-tuck","sample-box-mailer"]}]},
 {...base,id:"creative-santal-psd",title:"香水品牌海报 · PSD 图层",editorKind:"layers",tool:"品牌横幅",scene:"店铺装修",ratio:"4:5",prompt:"为 SANTAL 制作一张品牌海报，拆分背景、商品、标题和副标题图层，方便后续独立编辑。",mediaIds:["sample-layer-poster"],messages:[{role:"user",text:"为 SANTAL 制作一张品牌海报，拆分背景、商品、标题和副标题图层，方便后续独立编辑。"},{role:"assistant",text:"海报已按背景、商品与文字拆分图层。点击画面进入画布编辑，可以移动元素、修改文案、调整颜色和图层顺序。",mediaIds:["sample-layer-poster"]}]},
];
