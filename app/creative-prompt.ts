export type PromptField={key:string;label:string;value:string;options?:string[]};
export const platformOptions=[{value:"Amazon",label:"亚马逊"},{value:"TikTok Shop",label:"TikTok Shop"},{value:"eBay",label:"eBay"},{value:"Shopify",label:"Shopify"},{value:"Shopee",label:"Shopee"},{value:"Temu",label:"Temu"}];
export const languageOptions=["英语","德语","日语","法语","西班牙语","中文","无文字"];
export const platformLabel=(value:string)=>platformOptions.find(option=>option.value===value)?.label??value;
export function platformSetFields(platform:string,language:string):PromptField[]{return [
 {key:"platform",label:"目标平台",value:platform,options:platformOptions.map(option=>option.value)},
 {key:"language",label:"图片语言",value:language,options:languageOptions},
 {key:"style",label:"视觉风格",value:"自然极简",options:["自然极简","品牌质感","温暖生活方式","节日营销"]},
 {key:"count",label:"图片数量",value:"6",options:["3","4","6","8"]},
];}
export function changePromptField(fields:PromptField[],key:string,value:string):PromptField[]{return fields.map(field=>field.key===key?{...field,value:value.trim()}:field);}
export function promptFieldText(field:PromptField){return field.key==="platform"?platformLabel(field.value):field.key==="count"?`${field.value} 张`:field.value;}
export function serializeCreativePrompt(text:string,fields:PromptField[]):string{return [text.trim(),...fields.map(field=>`${field.label}：${promptFieldText(field)}`)].filter(Boolean).join("\n");}
export function promptFieldContext(fields:PromptField[]):Partial<{platform:string;language:string}>{const result:Partial<{platform:string;language:string}>={};for(const field of fields)if((field.key==="platform"||field.key==="language")&&field.value.trim())result[field.key]=field.value;return result;}
export function validImageCount(fields:PromptField[],fallback=6):number {const value=Number(fields.find(field=>field.key==="count")?.value);return Number.isInteger(value)&&value>=1&&value<=12?value:fallback;}
