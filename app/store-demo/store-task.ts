import { consoleApi } from '../../lib/console-api';
import { fileJson, type StudioFile } from '../file-api';
import type { StoreTask } from './StoreEntry';

/** Create the selected agent's session before binding uploaded files to it. */
export async function prepareStoreTask(token:string,task:StoreTask){
  const {session_id:sessionId}=await consoleApi<{session_id:string}>(token,`agents/${encodeURIComponent(task.agent.id)}/chat`,"POST");
  if(!sessionId)throw new Error("创建会话失败，请重试。");
  const files:StudioFile[]=[];
  for(const file of task.files){
    const body=new FormData();body.append("session_id",sessionId);body.append("file",file);
    files.push((await fileJson<{file:StudioFile}>(token,"upload",{method:"POST",body})).file);
  }
  const shop=task.targetShop;
  const context=shop?`目标店铺：${shop.name}（${shop.site}，${shop.type}，店铺标识：${shop.id}）\n\n`:"";
  const product=task.product;
  const productContext=product?[
    `关联商品：${product.productName||product.skuCode}`,
    `SKU 货号：${product.skuCode}`,
    product.spec?`规格：${product.spec}`:'',
    `目标平台：${product.platform}`,
    !shop?`目标店铺：${product.shopName}${product.site?`（${product.site}）`:''}`:'',
  ].filter(Boolean).join('\n')+'\n\n':'';
  return {sessionId,files,message:context+productContext+(task.text||"请处理所附经营资料。")};
}
