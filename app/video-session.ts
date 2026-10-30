import type {CreativeTurnTrace} from './creative-turn';
export const sampleVideoPoster='/creative/video-previews/editing-poster-v1.jpg';
export function videoResultTrace(completedAt:string):CreativeTurnTrace{
 return {reasoning:['根据商品信息整理视频方向与目标市场。','保留视频工作区，可先准备社媒发布内容与计划。'],tools:[{id:'video-plan',name:'video.plan',label:'整理视频方案',input:{来源:'商品资料',任务:'视频方案'},result:'视频方案已整理，视频生成与帧编辑保留占位',durationSeconds:2}],completedAt,durationSeconds:2,credits:0};
}
