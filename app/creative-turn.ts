export type CreativeTurnTrace = {
  reasoning:string[];
  tools:{id:string;name:string;label:string;input:Record<string,string>;result:string;durationSeconds:number}[];
  completedAt:string;
  durationSeconds:number;
  credits:number;
  feedback?:"like"|"dislike";
};
type TurnContext={mode?:string;tool:string;platform:string;site:string;ratio:string;quality:string;editorKind?:string};
export function creativeTurnTrace(job:TurnContext,count:number,completedAt:string):CreativeTurnTrace {
  if(job.mode==="video")return {
    reasoning:[`整理${job.tool}需要的输入素材、处理范围与目标市场。`,"将创作要求组织为可确认的镜头、脚本或译制方案。"],
    tools:[{id:"reference",name:"assets.read",label:"整理视频与商品参考",input:{场景:job.tool,市场:job.site},result:"本轮输入素材与创作要求已归集",durationSeconds:2},{id:"planning",name:"video.plan",label:"编排视频处理方案",input:{比例:job.ratio,分辨率:job.quality},result:"视频方案已整理，可继续修改与确认",durationSeconds:8}],
    completedAt,durationSeconds:10,credits:2,
  };
  const packaging=job.editorKind==="packaging",layers=job.editorKind==="layers";
  return {
    reasoning:packaging?["根据商品规格选择盒型，整理品牌文字与包装尺寸。","分别布置裁切线、折叠线与印刷区域，保留可替换的盒型结构。"]:layers?["将设计拆分为背景、商品、标题与说明文字，保留独立编辑能力。","统一排版与色彩，并检查各图层的顺序和可见性。"]:[`结合${job.platform} ${job.site}的展示场景，整理商品外观、品牌和构图要求。`,`统一光线与色彩，规划${count>1?"整组图片的视觉节奏":"本轮画面的调整范围"}。`],
    tools:[{id:"reference",name:"assets.read",label:"读取商品与参考素材",input:{来源:"商品资料与本轮附件",用途:"保持商品与品牌一致"},result:"商品信息与参考素材已整理",durationSeconds:2},{id:"generation",name:packaging?"packaging.generate":layers?"canvas.compose":"image.generate",label:packaging?"生成纸盒展开图":layers?"生成分层画布":"生成商品图片",input:{场景:job.tool,比例:job.ratio,清晰度:job.quality,数量:String(Math.max(1,count))},result:packaging?"展开图已生成，裁切线与折叠线分离":layers?"画布与图层已生成":`已返回 ${Math.max(1,count)} 张图片`,durationSeconds:18}],
    completedAt,durationSeconds:24,credits:Math.max(1,count)*8,
  };
}
