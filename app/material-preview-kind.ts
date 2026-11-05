import type { Media } from "./commerce-demo-data";
export function materialPreviewKind(media:Media){
  if(media.type==="image"||media.type==="video")return media.type;
  const ext=(media.name.includes(".")?media.name:media.url.split(/[?#]/)[0]).split(".").pop()?.toLowerCase();
  if(ext==="pdf")return "pdf";
  if(ext==="doc"||ext==="docx")return "word";
  if(ext==="md"||ext==="markdown")return "markdown";
  if(ext==="html"||ext==="htm")return "html";
  if(ext==="txt")return "text";
  return "unsupported";
}
export const supportsMaterialPreview=(media:Media)=>materialPreviewKind(media)!=="unsupported";
