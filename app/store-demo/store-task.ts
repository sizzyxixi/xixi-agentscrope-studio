import { consoleApi } from '../../lib/console-api';
import { fileJson, type StudioFile } from '../file-api';
import type { StoreTask } from './StoreEntry';
import { publicationAgentId, publicationProductMessage } from '../product-publication';

/** Create the selected agent's session before binding uploaded files to it. */
export async function prepareStoreTask(token:string,task:StoreTask){
  if(task.publication && publicationAgentId(task.publication.shop.platform)!==task.agent.id)throw new Error('目标店铺与当前智能体平台不一致，请重新选择。');
  const {session_id:sessionId}=await consoleApi<{session_id:string}>(token,`agents/${encodeURIComponent(task.agent.id)}/chat`,"POST");
  if(!sessionId)throw new Error("创建会话失败，请重试。");
  const files:StudioFile[]=[];
  for(const file of task.files){
    const body=new FormData();body.append("session_id",sessionId);body.append("file",file);
    files.push((await fileJson<{file:StudioFile}>(token,"upload",{method:"POST",body})).file);
  }
  const shop=task.publication?.shop || task.targetShop;
  const context=shop?`目标店铺：${shop.name}（${[shop.site,task.publication?.shop.platform || ('type' in shop ? shop.type : ''),`店铺标识：${shop.id}`].filter(Boolean).join('，')}）\n\n`:"";
  const products=task.publication?publicationProductMessage(task.publication):'';
  return {sessionId,files,message:context+products+(task.text||"请处理所附经营资料。")};
}
