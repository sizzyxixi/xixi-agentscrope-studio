export type SocialAccount={id:string;platform:'TikTok';name:string;handle:string;status:'authorization_required';market:string};
export type PublishPlan={id:string;jobId:string;mediaId:string;accountId:string;caption:string;privacy:string;scheduledAt:string;createdAt:string;status:'draft'|'awaiting_media'|'awaiting_authorization'|'cancelled';allowComment:boolean;allowDuet:boolean;allowStitch:boolean;commercial:boolean;ownBrand:boolean;branded:boolean;aiGenerated:boolean;coverTime:number;consent:boolean};
export const socialAccountSeed:SocialAccount[]=[{id:'tiktok-santal-us',platform:'TikTok',name:'SANTAL · 美国',handle:'@santal.studio',status:'authorization_required',market:'美国'}];
export function publishIssue(plan:Pick<PublishPlan,'accountId'|'caption'|'privacy'|'scheduledAt'|'commercial'|'ownBrand'|'branded'|'consent'>,now=Date.now()):string|null{
 if(!plan.accountId)return '请选择发布账号';
 if(!plan.caption.trim())return '请填写发布文案';
 if(Array.from(plan.caption).length>2200)return '发布文案不能超过 2,200 个字符';
 if(!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','SELF_ONLY'].includes(plan.privacy))return '请选择视频可见范围';
 if(plan.commercial&&!plan.ownBrand&&!plan.branded)return '请选择商业内容类型';
 if(plan.commercial&&plan.branded&&plan.privacy==='SELF_ONLY')return '品牌合作内容不能设为仅自己可见';
 if(plan.scheduledAt&&(!Number.isFinite(Date.parse(plan.scheduledAt))||Date.parse(plan.scheduledAt)<=now))return '请选择未来的发布时间';
 if(!plan.consent)return '请确认内容与音乐使用声明';
 return null;
}
export function frameRangeIssue(start:number,end:number,duration:number):string|null{
 if(![start,end,duration].every(Number.isFinite)||duration<=0)return '视频时长读取中';
 if(start<0||end>duration||end<=start)return '时间范围需在原片内，结束时间晚于开始时间';
 return null;
}
export const publishStatus=(status:PublishPlan['status'])=>({draft:'草稿',awaiting_media:'待视频素材',awaiting_authorization:'待账号授权',cancelled:'已取消'})[status];

export const isVideoPlaceholder=(media:{placeholder?:boolean;url:string})=>!!media.placeholder||!media.url||media.url.startsWith("/creative/videos/santal-film-");
