"use client";
import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, ImagePlus, Table2 } from 'lucide-react';
import s from './listing-draft.module.css';

// Draft rich text is restricted to formatting and image elements, without executable HTML.
export function cleanListingHtml(value: string) {
  const root = document.createElement('div'); root.innerHTML = value;
  root.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach(node => node.remove());
  const allowed = new Set(['P','DIV','BR','SPAN','B','STRONG','I','EM','U','UL','OL','LI','H2','H3','IMG','TABLE','TBODY','TR','TD']);
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    for (const attribute of Array.from(element.attributes)) {
      const safeImage = element.tagName === 'IMG' && attribute.name === 'src' && /^(https?:\/\/|\/|data:image\/(png|jpeg|webp);base64,)/i.test(attribute.value);
      const safeAlign = attribute.name === 'style' && /^text-align:\s*(left|center|right);?$/.test(attribute.value);
      if (!safeImage && !safeAlign) element.removeAttribute(attribute.name);
    }
  }
  return root.innerHTML;
}
export function ListingRichText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const editor = useRef<HTMLDivElement>(null), image = useRef<HTMLInputElement>(null), initialized = useRef(false);
  useEffect(() => { if (!initialized.current && editor.current) { editor.current.innerHTML = cleanListingHtml(value.includes('<') ? value : value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')); initialized.current = true; } }, [value]);
  const commit = () => { if (editor.current) onChange(cleanListingHtml(editor.current.innerHTML)); };
  const command = (name: string, argument?: string) => { editor.current?.focus(); document.execCommand(name, false, argument); commit(); };
  const tools = [[Bold,'加粗','bold'],[Italic,'斜体','italic'],[Underline,'下划线','underline'],[ListOrdered,'有序列表','insertOrderedList'],[List,'无序列表','insertUnorderedList'],[AlignLeft,'左对齐','justifyLeft'],[AlignCenter,'居中','justifyCenter'],[AlignRight,'右对齐','justifyRight']] as const;
  return <div className={s.richEditor}><div className={s.richTools} role="toolbar" aria-label={`${label}格式`}><select aria-label={`${label}段落样式`} defaultValue="p" onChange={event => command('formatBlock',event.target.value)}><option value="p">正文</option><option value="h2">标题</option><option value="h3">副标题</option></select>{tools.map(([Icon,title,name]) => <button key={name} type="button" aria-label={`${label}${title}`} title={title} onMouseDown={event => event.preventDefault()} onClick={() => command(name)}><Icon size={15}/></button>)}<button type="button" aria-label={`${label}插入图片`} onClick={() => image.current?.click()}><ImagePlus size={15}/></button><button type="button" aria-label={`${label}插入表格`} onMouseDown={event => event.preventDefault()} onClick={() => command('insertHTML','<table><tbody><tr><td>属性</td><td>内容</td></tr><tr><td><br></td><td><br></td></tr></tbody></table>')}><Table2 size={15}/></button><input ref={image} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file=event.target.files?.[0]; if(file && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 1024*1024) { const reader=new FileReader();reader.onload=()=>command('insertImage',String(reader.result));reader.readAsDataURL(file); } event.target.value=''; }}/></div><div ref={editor} role="textbox" aria-label={label} aria-multiline="true" contentEditable suppressContentEditableWarning className={s.richContent} onInput={commit} onPaste={event => { event.preventDefault(); command('insertText',event.clipboardData.getData('text/plain')); }}/></div>;
}
