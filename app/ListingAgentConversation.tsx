"use client";
import { useState } from 'react';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { StudioButton as Button, StudioTextarea as Textarea } from './StudioControls';
import { useCommerceDemo } from './CommerceDemoContext';
import { listingPublishedMessage, listingPublishedNotice, listingSourceInformation, listingTaskPresentation } from './product-listing';
import s from './product-listing.module.css';

export function ListingAgentConversation({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const d = useCommerceDemo();
  const [input, setInput] = useState('');
  const task = d.productListing.tasks.find(task => task.id === taskId);
  const product = d.products.find(product => product.id === task?.productId && !product.deleted_at);
  if (!task || !product || !product.skus.some(sku => sku.id === task.skuId && !sku.deleted_at)) return <div className={s.empty}><h3>刊登任务已不可用</h3><Button onClick={onBack}>返回商品库</Button></div>;
  const information = task.information || listingSourceInformation(product, task.skuId, d.listingShops.find(shop => shop.id === task.shopId));
  const busy = ['preparing', 'publishing'].includes(task.status);
  const state = listingTaskPresentation(task.status);
  const send = () => {
    const text = input.trim(); if (!text) return;
    setInput(''); d.productListing.message(task.id, 'user', text);
    if (/^(?:立即|确认)?(?:刊登|发布)[。！!\s]*$/.test(text)) {
      if (task.status === 'published') d.productListing.message(task.id, 'assistant', '此 SKU 已提交至该店铺，无需重复提交。实际状态可在当前会话中查询。');
      else if (busy) d.productListing.message(task.id, 'assistant', '当前任务仍在处理中，完成后可继续刊登。');
      else if (task.status === 'prepare_failed') d.productListing.message(task.id, 'assistant', '请先重试预刊登，准备完成后再提交。');
      else void d.productListing.publish(task.id, 'agent');
    } else d.productListing.message(task.id, 'assistant', `已记录你的要求。本次对话绑定 ${information.skuCode} 和「${task.shopName}」，可继续核对下方预刊登信息。`);
  };
  return <section className={s.conversation} aria-label={`${task.platform} 智能体刊登对话`}>
    <header className={s.conversationHeader}><Button onClick={onBack}><ArrowLeft size={15}/>返回商品库</Button><div><Sparkles size={18}/><strong>{task.platform} 智能体</strong></div><span>{task.shopName} · {task.site}</span></header>
    <div className={s.conversationContent}><div className={s.context}><strong>{information.skuCode}</strong><span>{information.spec} · {task.shopName}</span></div>
      <div className={s.userBubble}>查看这个 SKU 在目标店铺的预刊登信息。</div>
      <div className={s.assistantBubble}><strong>{state.label}</strong><p>{task.status === 'published' ? listingPublishedNotice : state.description}</p><dl className={s.information}>{[['刊登标题', information.title], ['商品描述', information.description], ['SKU 编号', information.skuCode], ['规格', information.spec], ['价格', information.price], ['币种', information.currency], ['目标店铺', task.shopName], ['平台 / 站点', `${task.platform} / ${task.site}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      {['prepare_failed', 'publish_failed'].includes(task.status) && <p role="alert">{task.message}</p>}
      {task.status === 'prepare_failed' && <Button onClick={() => d.productListing.retry(task.id)}>重试预刊登</Button>}
      {task.status !== 'published' && <Button className={s.publish} disabled={busy || task.status === 'prepare_failed'} onClick={() => void d.productListing.publish(task.id, 'agent')}>{task.status === 'publishing' ? '正在刊登…' : '刊登'}</Button>}
      {task.receipt && <p className={s.success}>{listingPublishedMessage} · {new Date(task.receipt.acceptedAt).toLocaleString('zh-CN', { hour12: false })}</p>}</div>
      {task.messages.map((message, index) => <div className={message.role === 'user' ? s.userBubble : s.assistantBubble} key={index}>{message.text}</div>)}
    </div>
    <form className={s.composer} onSubmit={event => { event.preventDefault(); send(); }}><Textarea aria-label="刊登对话消息" placeholder="补充刊登要求，或发送“确认刊登”" rows={2} value={input} onChange={event => setInput(event.target.value)}/><Button type="submit" className={s.publish} disabled={!input.trim()} aria-label="发送刊登消息"><Send size={17}/></Button></form>
  </section>;
}
