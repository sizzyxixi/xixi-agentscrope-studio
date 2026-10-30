import { templateCategories, templatePlatforms } from "./template-filtering";
import type { PromptField } from "./creative-prompt";
import type { CreativeTurnTrace } from "./creative-turn";
import type { EditDocument, EditorKind, EditSubmission } from "./creative-editing";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
export type Sku = { id: string; code: string; color: string; spec: string; name?: string; dimensions?: string; packagingDimensions?: string; profile?: string; craftsmanship?: string; selling?: string };
export type Product = { creativeBrief?: { useCase?: string; customArea?: string; restrictions?: string }; confirmedSnapshot?: string; id: string; name: string; code: string; brand: string; category: string; source: string; selling: string; material: string; dimensions: string; audience: string; packaging: string; skus: Sku[]; archived?: boolean };
export type Media = { placeholder?:boolean; poster?:string; duration?:number; width?:number; height?:number; version?:number; parentId?:string; videoEdit?:{sourceId:string;frameTime:number;start:number;end:number;instruction:string;annotationId:string}; id: string; name: string; url: string; type: "image" | "video" | "document"; source: string; createdAt: string; demo?: boolean; favorite?: boolean; jobId?: string; space?: "personal" | "enterprise" };
export type Association = { id: string; mediaId: string; productId: string; skuIds: string[]; platform: string; site: string; language: string; usage: string; collection: string; status: string; location: string; version: number };
export type CreativeJob = { promptFields?:PromptField[]; editorKind?:EditorKind; documents?:Record<string,EditDocument>; id: string; title: string; mode: string; scene: string; tool: string; prompt: string; productIds: string[]; skuIds: string[]; snapshot: Product[]; referenceIds: string[]; platform: string; language: string; site: string; ratio: string; quality: string; amount: string; template: string; fields: Record<string,string>; mediaIds: string[]; createdAt: string; messages: {role: string; text: string; promptFields?:PromptField[]; trace?:CreativeTurnTrace; mediaIds?:string[]; editRequest?:Omit<EditSubmission,"preview">; referenceIds?:string[]; productIds?:string[]}[] };
export const scenes = [
  {name:"电商设计",tools:["平台套图","A+详情页","商品SKU组合图","尺寸标注","卖点功能图","商品场景图","对比说明图"]},
  {name:"店铺装修",tools:["店铺首页","品牌横幅","活动专题","分类入口图","品牌故事","移动端长图"]},
  {name:"新品开发",tools:["外观概念设计","配色探索","材质探索","包装概念","系列化设计","产品效果图"]},
  {name:"POD开发",tools:["印花图案","文字排版","无缝纹样","图案变体","商品贴图预览","多载体适配"]},
  {name:"智能修图",tools:["智能抠图","背景替换","局部消除","局部重绘","扩图补图","画质增强","图片翻译","光影优化"]},
];
export const platforms = ["通用","Amazon","TikTok Shop","eBay","Shopify"];
export const languages = ["无文字","英语","德语","日语","法语","西班牙语","中文","泰语"];
export const productSeed: Product[] = [
  {id:"p-cup",name:"便携咖啡杯",code:"CUP-001",brand:"EVERYDAY",category:"家居",source:"商品资料",selling:"双层保温，防漏杯盖，轻便随行",material:"不锈钢",dimensions:"高 16cm，直径 8cm",audience:"通勤与户外人群",packaging:"独立纸盒",skus:[{id:"s-white",code:"CUP-W350",color:"白色",spec:"350ml"},{id:"s-black",code:"CUP-B500",color:"黑色",spec:"500ml"}]},
  {id:"p-skin",name:"植物精萃保湿乳",code:"SKIN-001",brand:"BOTANIC",category:"美妆",source:"商品资料",selling:"清爽质地，日常保湿，便携包装",material:"塑料瓶包装",dimensions:"高 14cm，宽 5cm",audience:"日常护肤人群",packaging:"单瓶装",skus:[{id:"s-skin",code:"SKIN-100",color:"奶油白",spec:"100ml"}]},
  {id:"p-audio",name:"便携蓝牙音箱",code:"AUDIO-001",brand:"OBJECT",category:"数码",source:"商品资料",selling:"轻巧便携，适合居家与旅行",material:"织物外壳",dimensions:"高 10cm，宽 8cm",audience:"旅行爱好者",packaging:"独立纸盒",skus:[{id:"s-audio",code:"AUDIO-G",color:"灰色",spec:"标准款"}]},
];
export function uid(prefix="demo") { return `${prefix}-${crypto.randomUUID()}`; }
export function artwork(title: string, color=0, label="DESIGN DRAFT") {
  const colors = ["#d8e3d1","#f0d1c0","#ded8ef","#d9e7ed","#e7ddc6"];
  const escaped = title.replace(/[<>&"']/g, "").slice(0,32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720"><rect width="720" height="720" fill="${colors[color % colors.length]}"/><circle cx="600" cy="140" r="190" fill="white" opacity=".2"/><path d="M0 520L720 400V720H0Z" fill="white" opacity=".2"/><ellipse cx="360" cy="565" rx="190" ry="25" fill="#24271c" opacity=".09"/><rect x="196" y="510" width="330" height="70" rx="8" fill="white" opacity=".4"/><rect x="283" y="223" width="155" height="295" rx="24" fill="#f5f1e8"/><rect x="311" y="180" width="98" height="49" rx="9" fill="#637364"/><rect x="292" y="330" width="138" height="106" rx="3" fill="white" opacity=".7"/><text x="360" y="372" text-anchor="middle" font-family="sans-serif" font-size="24" letter-spacing="5" fill="#52604e">OBJECT</text><text x="360" y="403" text-anchor="middle" font-family="sans-serif" font-size="9" letter-spacing="2" fill="#777">EVERYDAY ESSENTIAL</text><text x="35" y="55" font-family="sans-serif" font-size="14" letter-spacing="2" fill="#52604e">${label}</text><text x="35" y="663" font-family="sans-serif" font-size="22" fill="#4c5446">${escaped}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
export const mediaSeed: Media[] = productSeed.map((p,i)=>({id:`reference-${i}`,name:`${p.name} · 原始参考图`,url:["/creative/mug.jpg","/creative/skincare.jpg","/creative/speaker.jpg"][i],type:"image",source:"商品参考图",demo:false,createdAt:"2026-10-29T00:00:00Z"}));
export const associationSeed: Association[] = productSeed.map((p,i)=>({id:`ref-link-${i}`,mediaId:`reference-${i}`,productId:p.id,skuIds:[],platform:"通用",site:"通用",language:"无文字",usage:"原始商品图",collection:"参考原图",status:"已采用",location:"参考素材",version:1}));
const categoryCovers:Record<string,string[]>={"美妆":["/creative/scenes/store-v1.jpg","/creative/generated/fragrance-v1.webp","/creative/generated/perfume-santal-v1.jpg","/creative/skincare.jpg","/creative/perfume.jpg"],"宠物":["/creative/templates/pet-v1.jpg"],"服务":["/creative/templates/service-v1.jpg"],"玩具":["/creative/templates/toy-v1.jpg"],"母婴":["/creative/templates/baby-v1.jpg"],"家具":["/creative/generated/interior-v1.webp","/creative/interior.jpg"]};
const categoryTitles:Record<string,string>={"美妆":"美妆品牌视觉","宠物":"宠物生活","服务":"服务品牌形象","玩具":"童趣新作","母婴":"温柔育儿","家具":"家居美学"};
export const templateCatalog = scenes.flatMap((scene,si)=>scene.tools.flatMap((tool,ti)=>["自然极简","品牌质感","节日营销"].flatMap((style,i)=>templateCategories.map((category,ci)=>({
 id:`tpl-${si}-${ti}-${i}${ci?`-cat${ci}`:""}`,scene:scene.name,tool,style,category,
 platforms:category==="服务"?["TikTok Shop","Shopify"]:category==="家具"?["TikTok Shop","Amazon","eBay","Shopify"]:[...templatePlatforms],
 title:`${categoryTitles[category]} · ${tool}`,tone:(si+ti+i)%5,cover:categoryCovers[category][(si+ti+i)%categoryCovers[category].length],
 structure:/套图|A\+|首页/.test(tool)?["商品主视觉","核心卖点","使用场景","细节展示","规格说明","品牌故事"]:[tool],
 prompt:`为${category==="服务"?"服务品牌":`${category}商品`}制作${tool}，采用${style}风格，保持商品外观、颜色与品牌标识一致。`,
})))));

export type DemoTemplate = typeof templateCatalog[number];
export const importHeaders = ["商品编码","商品名称","SKU","品牌","类目","颜色","规格","材质","尺寸","卖点","商品链接","图片链接"];
function delimited(text:string) {
  const separator = text.split("\n")[0].includes("\t") ? "\t" : ",";
  const rows:string[][]=[]; let row:string[]=[], field="", quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===separator&&!quoted){row.push(field);field="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field="";}else field+=ch;}
  row.push(field);if(row.some(Boolean))rows.push(row);return rows;
}
export async function spreadsheetRows(file: File):Promise<string[][]> {
  if(file.size>5*1024*1024)throw new Error("请上传 5MB 以内的表格。");
  if(!/\.xlsx$/i.test(file.name))return delimited((await file.text()).replace(/^\uFEFF/,""));
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()),{filter: entry=>entry.originalSize<8*1024*1024&&/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(entry.name)});
  const xml=(name:string)=>new DOMParser().parseFromString(strFromU8(files[name]),"application/xml");
  const strings=files["xl/sharedStrings.xml"]?Array.from(xml("xl/sharedStrings.xml").getElementsByTagName("si")).map(si=>Array.from(si.getElementsByTagName("t")).map(t=>t.textContent??"").join("")):[];
  const sheet=Object.keys(files).filter(x=>x.startsWith("xl/worksheets/")).sort()[0];if(!sheet)throw new Error("未找到可读取的工作表，请使用标准 XLSX 或 CSV 模板。");
  return Array.from(xml(sheet).getElementsByTagName("row")).slice(0,501).map(row=>{const result:string[]=[];Array.from(row.getElementsByTagName("c")).forEach(c=>{const col=(c.getAttribute("r")??"A").replace(/\d/g,"");let index=0;for(const ch of col)index=index*26+ch.charCodeAt(0)-64;const v=c.getElementsByTagName("v")[0]?.textContent??"";result[index-1]=c.getAttribute("t")==="s"?strings[Number(v)]??"":c.getAttribute("t")==="inlineStr"?c.getElementsByTagName("t")[0]?.textContent??"":v;});return result;});
}

export function sampleSpreadsheet() {
 const values=[importHeaders,["BAG-001","旅行收纳包","BAG-S","EVERYDAY","家居","米色","小号","织物","20x15cm","轻便折叠","",""],["BAG-001","旅行收纳包","BAG-L","EVERYDAY","家居","黑色","大号","织物","30x20cm","轻便折叠","",""]];
 const rows=values.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`).join("");
 const bytes=zipSync({"xl/worksheets/sheet1.xml":strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)});
 return new File([bytes],"商品导入模板.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
