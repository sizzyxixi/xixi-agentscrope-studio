import type { PromptField } from './creative-prompt';

export type VideoSettings={duration:number;country:string;language:string};
export const defaultVideoSettings:VideoSettings={duration:5,country:'US',language:'英语'};
export const videoCountries=[{value:'US',label:'🇺🇸 美国'},{value:'GB',label:'🇬🇧 英国'},{value:'DE',label:'🇩🇪 德国'},{value:'FR',label:'🇫🇷 法国'},{value:'JP',label:'🇯🇵 日本'},{value:'TH',label:'🇹🇭 泰国'},{value:'ID',label:'🇮🇩 印度尼西亚'}];
export const videoLanguages=['英语','德语','法语','日语','西班牙语','泰语','印尼语','中文'];
export const videoScenarios=[
 {name:'商品视频',description:'让商品成为镜头主角',input:'商品或商品图',steps:['引用商品','规划镜头','生成视频'],cover:'/creative/generated/fragrance-v1.webp',prompt:'围绕商品外观与核心卖点制作展示视频，保持商品结构、颜色和品牌标识一致。',fields:[{key:'videoStyle',label:'视频类型',value:'商品展示',options:['商品展示','卖点特写','使用场景','开箱展示']},{key:'camera',label:'镜头语言',value:'缓慢环绕',options:['缓慢环绕','推近特写','自然跟拍','静态运镜']}]},
 {name:'带货视频',description:'从卖点到有说服力的表达',input:'商品或商品图',steps:['明确卖点','编排脚本','生成视频'],cover:'/creative/scenes/product-v1.jpg',prompt:'为商品制作面向目标市场的带货视频，先设计开场钩子、卖点演示和行动引导，再组织分镜。',fields:[{key:'videoStyle',label:'表达方式',value:'UGC测评',options:['UGC测评','产品讲解','场景种草','开箱体验']},{key:'audience',label:'目标人群',value:'首次了解商品的消费者'},{key:'selling',label:'核心卖点',value:'从商品资料提取'},{key:'cta',label:'行动引导',value:'了解更多',options:['了解更多','立即选购','查看商品','不添加']}]},
 {name:'视频复刻',description:'沿用节奏，重做商品与画面',input:'参考视频 + 商品',steps:['上传参考片','拆解镜头','替换并生成'],cover:'/creative/generated/sport-v1.webp',prompt:'拆解参考视频的镜头顺序、节奏和转场，使用当前商品重新设计画面与文案。',fields:[{key:'replica',label:'复刻重点',value:'镜头结构与节奏',options:['镜头结构与节奏','构图与运镜','叙事结构','整体风格']},{key:'replacement',label:'替换内容',value:'商品与品牌文案',options:['商品与品牌文案','商品主体','场景与商品','仅替换文案']}]},
 {name:'视频编辑',description:'围绕原片，精准调整',input:'待编辑视频',steps:['上传原片','标记修改','输出新版本'],cover:'/creative/generated/interior-v1.webp',prompt:'保留原视频中无需修改的内容，按编辑要求输出一个新版本。',fields:[{key:'editType',label:'编辑任务',value:'局部替换',options:['局部替换','剪辑重组','增补镜头','调整画幅']},{key:'range',label:'修改范围',value:'整段视频'},{key:'audio',label:'原片音轨',value:'保留原音',options:['保留原音','移除原音','重新配乐']}]},
 {name:'视频翻译',description:'让字幕与声音适配新市场',input:'待翻译视频',steps:['上传原片','确认译文','配音与字幕'],cover:'/creative/scenes/store-v1.jpg',prompt:'识别原片语音和字幕，先提供目标语言译文，确认后按目标市场调整表达与字幕。',fields:[{key:'translation',label:'翻译方式',value:'配音与字幕',options:['配音与字幕','仅翻译字幕','仅翻译配音']},{key:'subtitles',label:'字幕样式',value:'目标语言字幕',options:['目标语言字幕','双语字幕','不添加字幕']},{key:'glossary',label:'品牌与术语',value:'保留品牌名、型号与单位'}]},
] as const;
export type VideoScenarioName=typeof videoScenarios[number]['name'];
export const keepsSourceDuration=(tool:string)=>tool==='视频编辑'||tool==='视频翻译';
export function videoPromptFields(tool:string):PromptField[]{const scenario=videoScenarios.find(item=>item.name===tool);return scenario?scenario.fields.map(field=>({key:field.key,label:field.label,value:field.value,options:"options" in field?[...field.options]:undefined})):[];}
export function changeVideoPromptField(fields:PromptField[],key:string,value:string):PromptField[]{
 let next=fields.map(field=>field.key===key?{...field,value:value.trim()}:field);
 if(key==='translation')next=next.map(field=>field.key==='subtitles'?{...field,value:value==='仅翻译配音'?'不添加字幕':field.value==='不添加字幕'?'目标语言字幕':field.value}:field);
 if(key==='subtitles'&&value!=='不添加字幕')next=next.map(field=>field.key==='translation'&&field.value==='仅翻译配音'?{...field,value:'配音与字幕'}:field);
 if(key==='subtitles'&&value==='不添加字幕')next=next.map(field=>field.key==='translation'?{...field,value:'仅翻译配音'}:field);
 return next;
}
export function videoInputIssue(tool:string,input:{hasProduct:boolean;hasImage:boolean;hasVideo:boolean}):string|null{
 if(['视频复刻','视频编辑','视频翻译'].includes(tool)&&!input.hasVideo)return tool==='视频复刻'?'请上传或引用一段参考视频。':'请上传或引用需要处理的原视频。';
 if(['商品视频','带货视频','视频复刻'].includes(tool)&&!input.hasProduct&&!input.hasImage)return '请引用商品，或上传一张清晰的商品图。';
 return null;
}
export function videoSettingsFromFields(fields:Record<string,string>,fallbackLanguage='英语'):VideoSettings{const duration=Number(fields.videoDuration);return {duration:Number.isInteger(duration)&&duration>=5&&duration<=15?duration:5,country:videoCountries.some(item=>item.value===fields.videoCountry)?fields.videoCountry:'US',language:videoLanguages.includes(fields.videoLanguage)?fields.videoLanguage:videoLanguages.includes(fallbackLanguage)?fallbackLanguage:'英语'};}
