export type EditorKind = "image" | "packaging" | "layers";
export type Mark = {id:string;kind:"pen"|"rect"|"text"|"comment";x:number;y:number;points?:[number,number][];width?:number;height?:number;color:string;text?:string};
export type DesignLayer = {id:string;name:string;kind:"image"|"text"|"shape";x:number;y:number;width:number;height:number;fill:string;text?:string;fontSize?:number;visible:boolean;locked:boolean;opacity:number};
export type EditDocument = {canvasHeight?:number;marks:Mark[];layers:DesignLayer[];template:string;width:number;height:number;depth:number};
export type EditSubmission = {sourceId:string;document:EditDocument;instruction:string;preview:string};
export const boxTemplates = [
 {id:"tuck",name:"插口折叠盒",description:"香水 · 护肤 · 小型礼盒"},
 {id:"mailer",name:"飞机盒",description:"电商寄送 · 礼品套装"},
 {id:"drawer",name:"抽屉盒",description:"精品香氛 · 高端礼赠"},
 {id:"sleeve",name:"套筒盒",description:"组合包装 · 简约陈列"},
];
export const initialLayers:DesignLayer[] = [
 {id:"headline",name:"品牌标题",kind:"text",text:"SANTAL",x:9,y:12,width:73,height:9,fontSize:62,fill:"#27271f",visible:true,locked:false,opacity:100},
 {id:"subtitle",name:"产品副标题",kind:"text",text:"A quiet kind of presence.",x:10,y:24,width:72,height:5,fontSize:21,fill:"#686454",visible:true,locked:false,opacity:100},
 {id:"bottle",name:"香水产品",kind:"image",x:20,y:32,width:61,height:56,fill:"/creative/generated/perfume-santal-v1.jpg",visible:true,locked:false,opacity:100},
 {id:"footnote",name:"底部说明",kind:"text",text:"EAU DE PARFUM  /  50 ML",x:10,y:91,width:75,height:4,fontSize:14,fill:"#565246",visible:true,locked:false,opacity:100},
 {id:"background",name:"暖白背景",kind:"shape",x:0,y:0,width:100,height:100,fill:"#f4f0e6",visible:true,locked:true,opacity:100},
];
export function emptyDocument():EditDocument{return {marks:[],layers:structuredClone(initialLayers),template:"tuck",width:60,height:120,depth:40};}
export const escapeSvg=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export function boxSvg(template="tuck",width=60,height=120,depth=40):string {
 const ink="#778170",gold="#aa9170",cream="#f3efe5";
 const front=`<rect x="230" y="195" width="140" height="230" fill="${cream}"/><text x="300" y="285" font-size="23" letter-spacing="5" text-anchor="middle" fill="#424b3d">SANTAL</text><text x="300" y="312" font-size="9" letter-spacing="2" text-anchor="middle" fill="${gold}">EAU DE PARFUM</text><path d="M270 345 Q300 310 330 345 Q300 390 270 345" fill="none" stroke="${gold}"/><text x="300" y="397" font-size="9" text-anchor="middle" fill="${ink}">50 ML / 1.7 FL.OZ.</text>`;
 let net="";
 if(template==="tuck")net=`<path d="M80 195H150V140Q150 125 165 125H215Q230 125 230 140V195H370V140Q370 110 350 110H250Q230 110 230 140V195H440V150H485V195H565V425H485V470H440V425H370V475H230V425H150V475H80Z" fill="${cream}" stroke="${ink}" stroke-width="1.4"/><path d="M150 195V425M230 195V425M370 195V425M440 195V425M485 195V425M80 195H565M80 425H565" fill="none" stroke="${gold}" stroke-dasharray="5 5"/>${front}`;
 else if(template==="mailer")net=`<path d="M140 145H460V230H530V400H460V490H140V400H70V230H140Z" fill="${cream}" stroke="${ink}" stroke-width="1.5"/><rect x="140" y="230" width="320" height="170" fill="#e5e8dd" stroke="${gold}" stroke-dasharray="5 5"/><path d="M140 145V490M460 145V490M70 230H530M70 400H530" stroke="${gold}" stroke-dasharray="5 5"/>${front}`;
 else if(template==="drawer")net=`<path d="M160 170H440V235H505V425H440V490H160V425H95V235H160Z" fill="${cream}" stroke="${ink}" stroke-width="1.5"/><rect x="160" y="235" width="280" height="190" fill="#e1e5d8" stroke="${gold}" stroke-dasharray="5 5"/><rect x="115" y="60" width="370" height="85" fill="${cream}" stroke="${ink}"/><path d="M160 170V490M440 170V490M95 235H505M95 425H505" stroke="${gold}" stroke-dasharray="5 5"/>${front}`;
 else net=`<rect x="65" y="170" width="470" height="270" fill="${cream}" stroke="${ink}" stroke-width="1.5"/><path d="M155 170V440M230 170V440M370 170V440M445 170V440M500 170V440" stroke="${gold}" stroke-dasharray="5 5"/>${front}`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="640" viewBox="0 0 600 540"><rect width="600" height="540" fill="#fff"/>${net}<path d="M230 510H370M230 504V516M370 504V516" stroke="${ink}"/><text x="300" y="530" font-size="10" text-anchor="middle" fill="${ink}">${width} × ${height} × ${depth} mm</text><text x="35" y="35" font-size="10" letter-spacing="2" fill="${ink}">SANTAL / PACKAGING DESIGN</text></svg>`;
}
export const svgUrl=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
export function layerSvg(layers:DesignLayer[],inlineImage?:string,height=1000):string {
 return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}">${[...layers].reverse().filter(l=>l.visible).map(l=>{
 const x=l.x*8,y=l.y*height/100,w=l.width*8,h=l.height*height/100;
 if(l.kind==="image")return `<image href="${escapeSvg(inlineImage??l.fill)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="${l.opacity/100}"/>`;
 if(l.kind==="text")return `<text x="${x}" y="${y+(l.fontSize??20)}" fill="${l.fill}" font-size="${l.fontSize}" font-family="Georgia,serif" letter-spacing="2" opacity="${l.opacity/100}">${escapeSvg(l.text??"")}</text>`;
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${l.fill}" opacity="${l.opacity/100}"/>`;
 }).join("")}</svg>`;
}
