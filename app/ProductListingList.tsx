"use client";
import Image from 'next/image';
import { useState } from 'react';
import { CircleHelp, Images, Search } from 'lucide-react';
import { useCommerceDemo } from './CommerceDemoContext';
import { StudioButton as Button, StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { Hint } from '@/components/hero-ui/tooltip';
import { listingPublishedNotice, listingTaskPlatforms, listingTaskPresentation, listingTaskRows, listingTaskTime, listingPublishDisabledReason, prelistingSteps, type ListingAgentContext, type ProductListingTask } from './product-listing';
import { skuCode, skuImageUrls, skuSpec } from './sku-fields';
import { productTitle } from './product-fields';
import { productAssets } from './product-images';
import { ClaimTimeRangePicker } from './ClaimTimeRangePicker';
import { ListingDraftDrawer } from './ListingDraftDrawer';
import s from './product-listing.module.css';
const stepNames = { success:'成功', running:'执行中', failed:'失败', waiting:'未开始' };
export function ProductListingList({ tab, query, platform, onQueryChange, onPlatformChange, onView, onPreview }: { tab: 'pending' | 'published'; query: string; platform: string; onQueryChange: (value: string) => void; onPlatformChange: (value: string) => void; onView: (context: ListingAgentContext) => void; onPreview: (url: string, name: string) => void }) {
  const d=useCommerceDemo();
  const [shopId,setShopId]=useState(''),[timeRange,setTimeRange]=useState({from:'',to:''}),[editing,setEditing]=useState(''),[page,setPage]=useState(1);
  const {from:dateFrom,to:dateTo}=timeRange;
  const timeLabel=tab==='published'?'发布时间':'认领时间';
  const available=d.media.filter(media=>!d.materialLibrary.metadata[media.id]?.deletedAt&&!d.materialLibrary.metadata[media.id]?.purgedAt);
  const base=listingTaskRows(d.productListing.tasks,d.products,tab,'',platform);
  const shops=[...new Map(base.map(({task})=>[task.shopId,{id:task.shopId,name:task.shopName,site:task.site}])).values()];
  const rows=listingTaskRows(d.productListing.tasks,d.products,tab,query,platform,{shopId,dateFrom,dateTo});
  const platforms=listingTaskPlatforms(d.productListing.tasks,d.products,tab);
  const pages=Math.max(1,Math.ceil(rows.length/10)),currentPage=Math.min(page,pages);
  const view=(task:ProductListingTask)=>{const row=rows.find(row=>row.task.id===task.id);onView({intent:tab==='pending'?'optimize':undefined,taskId:task.id,platform:task.platform,skuCode:row?skuCode(row.sku):'',shopName:task.shopName,shopId:task.shopId,site:task.site,productId:task.productId,skuId:task.skuId,productName:row?productTitle(row.product):'',image:row?skuImageUrls(row.sku)[0]||productAssets(row.product.id,d.links,available,row.sku.id).find(item=>item.media.type==='image')?.media.url||row.product.main_image||'':'',spec:row?skuSpec(row.sku):''});};
  const editor=base.find(row=>row.task.id===editing);
  if(!d.collectionReady)return <div className={s.empty}>正在读取刊登记录…</div>;
  return <>
    <div className={s.filters}><div className={s.platforms} role="group" aria-label="筛选刊登平台"><span>平台</span>{['',...platforms].map(value=><Button key={value} aria-pressed={platform===value} onClick={()=>{onPlatformChange(value);setShopId('');setPage(1);}}>{value||'全部'}</Button>)}</div>
    <div className={s.filterRow}><label>店铺<Select aria-label="筛选认领店铺" value={shopId} onChange={event=>{setShopId(event.target.value);setPage(1);}}><option value="">全部店铺</option>{shops.map(shop=><option key={shop.id} value={shop.id}>{shop.name} · {shop.site}</option>)}</Select></label><div className={s.filterField}><span>{timeLabel}</span><ClaimTimeRangePicker label={timeLabel} value={timeRange} onChange={range=>{setTimeRange(range);setPage(1);}}/></div><label className={s.listSearch}><Search size={14}/><Input aria-label="搜索草稿商品" placeholder="搜索标题、SKU 货号或店铺" value={query} onChange={event=>{onQueryChange(event.target.value);setPage(1);}}/></label>{(shopId||dateFrom||dateTo||query||platform)&&<Button className={s.reset} onClick={()=>{setShopId('');setTimeRange({from:'',to:''});onQueryChange('');onPlatformChange('');setPage(1);}}>重置</Button>}</div></div>
    <div className={s.listHeading}><span>共 {rows.length} 条{tab==='pending'?'草稿':'刊登记录'}</span>{tab==='published'&&<span>{listingPublishedNotice}</span>}</div>
    {rows.length?<div className={s.scroll}><table className={`${s.table} ${tab==='pending'?s.draftTable:''}`} aria-label={tab==='pending'?'草稿箱 SKU 列表':'已刊登 SKU 列表'}><thead><tr><th>SKU 货号</th><th>平台</th><th>目标店铺</th><th>{tab==='pending'?'状态':'已刊登'}</th>{tab==='pending'&&<th><span className={s.taskHeader}>预刊登任务<Hint content={<div className={s.taskLegend}><strong>预刊登任务执行状态</strong>{Object.entries(stepNames).map(([key,name])=><span key={key}><i data-state={key}/>{name}</span>)}</div>}><button type="button" aria-label="预刊登任务状态说明"><CircleHelp size={13}/></button></Hint></span></th>}<th>{timeLabel}</th><th>操作</th></tr></thead><tbody>{rows.slice((currentPage-1)*10,currentPage*10).map(({task,product,sku})=>{
      const cover=skuImageUrls(sku)[0]||productAssets(product.id,d.links,available,sku.id).find(item=>item.media.type==='image')?.media.url||product.main_image;
      const state=listingTaskPresentation(task.status),disabledReason=listingPublishDisabledReason(task),at=listingTaskTime(task,tab);
      return <tr key={task.id}><td><div className={s.product}>{cover?<Button className={s.thumb} aria-label={`预览图片 ${skuCode(sku)}`} onClick={()=>onPreview(cover,skuCode(sku))}><Image src={cover} alt="" width={46} height={46} unoptimized/></Button>:<span className={s.thumb}><Images size={20}/></span>}<div><strong>{skuCode(sku)}</strong><small>{skuSpec(sku)||'—'}</small></div></div></td><td><span className={s.platform}>{task.platform||'—'}</span></td><td><div className={s.shop}><strong>{task.shopName}</strong><span>{task.site||'—'}</span></div></td><td><Hint content={state.description}><div className={s.status} data-status={task.status} tabIndex={0}><span><i className={s.stateDot}/><strong>{state.label}</strong></span>{task.status==='publish_failed'&&<small>{task.message}</small>}</div></Hint></td>{tab==='pending'&&<td><div className={s.tasks}>{prelistingSteps(task).map(step=><Hint key={step.name} content={`${step.name}：${stepNames[step.status]}`}><span tabIndex={0}><i data-state={step.status}/>{step.name}</span></Hint>)}</div></td>}<td>{at?<time className={s.claimedAt} dateTime={at}>{new Date(at).toLocaleString('zh-CN',{hour12:false})}</time>:'—'}</td><td><div className={s.rowActions}>{tab==='pending'&&<Button aria-label={`编辑草稿 ${skuCode(sku)} ${task.shopName}`} disabled={task.status==='publishing'} onClick={()=>setEditing(task.id)}>编辑</Button>}<Button aria-label={`${tab==='pending'?'AI 优化资料':'发起对话'} ${skuCode(sku)} ${task.shopName}`} onClick={()=>view(task)}>{tab==='pending'?'AI 优化资料':'发起对话'}</Button>{tab==='pending'&&<Hint content={disabledReason}><span className={s.disabledAction} tabIndex={disabledReason?0:undefined} aria-label={disabledReason?`直接刊登不可用：${disabledReason}`:undefined}><Button aria-label={`直接刊登 ${skuCode(sku)} ${task.shopName}`} disabled={!!disabledReason} onClick={()=>void d.productListing.publish(task.id)}>直接刊登</Button></span></Hint>}</div></td></tr>;
    })}</tbody></table></div>:<div className={s.empty}><Images size={28}/><h3>{query||platform||shopId||dateFrom||dateTo?'没有匹配的记录':tab==='pending'?'草稿箱暂无商品':'暂无已刊登商品'}</h3><p>{query||platform||shopId||dateFrom||dateTo?'请调整筛选或搜索条件。':tab==='pending'?'认领商品到店铺后，会在这里准备刊登信息。':'商品提交至平台后会显示在这里。'}</p></div>}
    {rows.length>10&&<div className={s.pager}><span>共 {rows.length} 条 · 每页 10 条</span><Button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</Button><span>{currentPage} / {pages}</span><Button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>下一页</Button></div>}
    {editor&&<ListingDraftDrawer key={editing} {...editor} images={[...new Set([...skuImageUrls(editor.sku),...(editor.product.main_image?[editor.product.main_image]:[]),...productAssets(editor.product.id,d.links,available,editor.sku.id).filter(item=>item.media.type==='image').map(item=>item.media.url)])]} onClose={()=>setEditing('')}/>}
  </>;
}
