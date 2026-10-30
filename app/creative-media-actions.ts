import type { CreativeJob, Media } from "./commerce-demo-data";
import { boxSvg, emptyDocument, layerSvg, svgUrl } from "./creative-editing";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
export const resolveCreativeImage=(src:string)=>/\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(src)?perfumeArtwork:src;
export async function creativeMediaBlob(job:CreativeJob,media:Media):Promise<Blob> {
 const document=job.documents?.[media.id];let src=resolveCreativeImage(media.url);
 if(job.editorKind==="layers"||document?.canvasHeight){const layers=document?.layers??emptyDocument().layers;const response=await fetch(resolveCreativeImage(layers.find(layer=>layer.kind==="image")?.fill??src));if(!response.ok)throw new Error("图片读取失败");const blob=await response.blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});src=svgUrl(layerSvg(layers,data,document?.canvasHeight??1000));}
 else if(job.editorKind==="packaging"&&document)src=svgUrl(boxSvg(document.template,document.width,document.height,document.depth));
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
 const canvas=window.document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)throw new Error("图片读取失败");context.drawImage(image,0,0);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("图片读取失败")),"image/png"));
}
export async function copyCreativeMedia(job:CreativeJob,media:Media){await navigator.clipboard.write([new ClipboardItem({"image/png":creativeMediaBlob(job,media)})]);}
export async function downloadCreativeMedia(job:CreativeJob,media:Media){const blob=await creativeMediaBlob(job,media);const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=media.name.replace(/\.(psd|png|jpe?g|svg|webp)$/i,"")+".png";link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
