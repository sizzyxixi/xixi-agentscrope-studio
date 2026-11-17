"use client";

import Image from "next/image";
import { TreeTable, type TreeTableColumn, type TreeTableRow } from "@/components/TreeTable";
import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Download, FileSpreadsheet, Images, Layers3, Link2, Plus, ChevronLeft, ScanLine, Search, Upload, X } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { DemoModal } from "./CommercePanels";
import { FormDialog } from "@/components/hero-ui/form-dialog";
import { FieldLabel, StudioButton as Button, StudioInput as Input, StudioSelect as Select } from "./StudioControls";
import { uid, type Product, type Sku } from "./commerce-demo-data";
import { productReferences } from "./product-readiness";
import { selectedProductScopes, type ProductSelection } from "./product-management";
import s from "./product-workspace.module.css";
import { productAssets } from "./product-images";
import { ProductClaimDialog } from "./ProductClaimDialog";
import { claimProductsToShops } from "./product-claim";
import { ProductListingList } from "./ProductListingList";
import { listingTaskPlatforms, listingTaskRows, type ListingAgentContext } from "./product-listing";
import { ProductDetail } from "./ProductDetail";
import { ProductClaimRecords } from "./ProductClaimRecords";
import { removeProductSku } from "./product-editor";
import { ProductCollectionRecords, unresolvedCollectionFailures } from "./ProductCollectionRecords";
import { useImageImportTask } from "./use-image-import-task";
import { ProductImportDialog, type ImportMethod } from "./ProductImportDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/hero-ui/dropdown-menu";

import { productCode, productDisplayId, productSupplySource, productTitle, supplySources } from "./product-fields";

import { skuCode, skuImageUrls, skuPrice, skuSpec } from "./sku-fields";



type Demo = ReturnType<typeof useCommerceDemo>;
const availableMedia = (d: Demo) => d.media.filter(m => !m.placeholder && m.url && !d.materialLibrary.metadata[m.id]?.deletedAt && !d.materialLibrary.metadata[m.id]?.purgedAt);
function Empty({ title, description, children }: { title: string; description: string; children?: ReactNode }) { return <div className={s.empty}><Layers3 size={28}/><h3>{title}</h3><p>{description}</p>{children}</div>; }


export function ProductWorkspace({ token = "", claimShopMocks = false, onOpenListingAgent }: { token?: string; claimShopMocks?: boolean; onOpenListingAgent: (context: ListingAgentContext) => void }) {
  const d = useCommerceDemo();
  const [query, setQuery] = useState('');
  const [listingPlatform, setListingPlatform] = useState('');
  const exporting = d.productExport.task?.status === 'running';
  const filter = d.productLibraryTab, setFilter = d.setProductLibraryTab;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [taskHistory, setTaskHistory] = useState<'history' | 'failure' | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Product | null>(null);
  const [selection, setSelection] = useState<ProductSelection>({});
  const [claiming, setClaiming] = useState<{ productId: string; skuIds: string[] }[] | null>(null);
  const [deleting, setDeleting] = useState<Product[] | null>(null);
  const imageImportTask = useImageImportTask();
  const [importing, setImporting] = useState<ImportMethod | null>(null);
  const [initialSku, setInitialSku] = useState('');
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [deletingSku, setDeletingSku] = useState<{productId: string; skuId: string} | null>(null);
  const [claimRecords, setClaimRecords] = useState<{productId: string; skuId: string} | null>(null);
  const [collectionTask, setCollectionTask] = useState('');
  const platforms = listingTaskPlatforms(d.productListing.tasks, d.products, filter === '已刊登' ? 'published' : 'pending');
  const failures = unresolvedCollectionFailures(d.collectionTasks).length;
  const openImport = (method: ImportMethod) => { setCollectionTask(''); setImporting(method); };
  const media = availableMedia(d);
  const active = d.products.find(p => p.id === d.activeProduct);
  const products = d.products.filter(p => !p.deleted_at && `${productTitle(p)} ${p.title || ''} ${p.cn_title || ''} ${productDisplayId(p)} ${productCode(p)} ${p.brand} ${p.skus.map(sku => skuCode(sku)).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const scopes = selectedProductScopes(products, selection);
  const selectedSkuCount = scopes.reduce((count, scope) => count + scope.skuIds.length, 0);
  const pageScopes = selectedProductScopes(pageProducts, selection);
  const allSelected = pageProducts.length > 0 && pageScopes.length === pageProducts.length && pageScopes.every(scope => scope.full);
  const selectProduct = (p: Product, checked: boolean) => setSelection(old => { const next = { ...old }; if (checked) next[p.id] = 'all'; else delete next[p.id]; return next; });
  const selectSku = (p: Product, skuId: string, checked: boolean) => setSelection(old => {
    const selected = old[p.id];
    const ids = selected === 'all' ? p.skus.map(sku => sku.id) : selected || [];
    const nextIds = checked ? [...new Set([...ids, skuId])] : ids.filter(id => id !== skuId);
    const next = { ...old };
    if (nextIds.length) next[p.id] = nextIds.length === p.skus.length ? 'all' : nextIds; else delete next[p.id];
    return next;
  });
  const beginClaim = (items: { product: Product; skuIds: string[] }[]) => { setClaiming(items.filter(item => item.skuIds.length).map(item => ({ productId: item.product.id, skuIds: item.skuIds }))); };
  const open = (p: Product, sku?: Sku, tab = '基础资料', edit = false) => { setEditor(null); setEditOnOpen(edit); d.setProductMaterialFocus(null); setInitialSku(sku?.id || ''); d.setActiveProduct(p.id); d.setProductTab(tab); };

  const cover = (p: Product, sku?: Sku) => (sku ? skuImageUrls(sku)[0] || '' : p.main_image || '') || productReferences(p, d.links, media, sku?.id)[0]?.url || productAssets(p.id, d.links, media, sku?.id).find(item => item.media.type === 'image')?.media.url || '';
  const newProduct = () => (d.setActiveProduct(null), setInitialSku(''), setEditOnOpen(true), d.setProductTab('基础资料'), setEditor({ id: uid('product'), name: '', code: '', brand: '', category: '', source: '手动创建', material: '', selling: '', dimensions: '', packaging: '', audience: '', skus: [{ id: uid('sku'), code: '', color: '', spec: '' }] }));
  const exportProducts = (items = products, selected = false, skuScopes?: Record<string, string[]>) => {
    if (exporting || !items.length || !d.collectionReady) return;
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
    d.productExport.start({ products: items, links: d.links, media, origin: window.location.origin, skuScopes, filename: `商品库-${selected ? '所选' : filter}-${date}.xlsx` });
  };
  type CatalogRow = { product: Product; sku?: Sku };
  const treeRows: TreeTableRow<CatalogRow>[] = pageProducts.map(product => {
    const scope = scopes.find(item => item.product.id === product.id);
    return {
      id: product.id, data: { product }, expandLabel: `${product.name} 的 SKU`,
      selection: { label: `选择 ${product.name} 的全部 SKU`, checked: !!scope?.full, mixed: !!scope && !scope.full, onChange: checked => selectProduct(product, checked) },
      children: product.skus.map(sku => ({ id: `${product.id}/${sku.id}`, data: { product, sku }, selection: { label: `选择 SKU ${skuCode(sku)}`, checked: !!scope?.skuIds.includes(sku.id), onChange: checked => selectSku(product, sku.id, checked) } })),
    };
  });
  const productCell = ({ product: p, sku }: CatalogRow) => <div className={s.treeProduct}>
    {cover(p, sku) ? <Button className={`${s.treeThumb} ${s.treeImageButton}`} aria-label={`预览图片 ${sku ? skuCode(sku) : productTitle(p)}`} onClick={() => setImagePreview({ url: cover(p, sku), name: sku ? skuCode(sku) : productTitle(p) })}><Image src={cover(p, sku)} width={42} height={42} alt="" unoptimized/></Button> : <span className={s.treeThumb}><Images size={19}/></span>}
    <div className={s.treeProductInfo}>
      <Button className={s.treeProductText} aria-label={sku ? `查看 SKU ${skuCode(sku)}` : `查看${p.name}`} onClick={() => open(p, sku, sku ? 'SKU 档案' : '基础资料')}><strong>{sku ? skuCode(sku) || '—' : productTitle(p)}</strong></Button>
      {!sku && <div className={s.treeProductMeta}><span className={s.treeProductId} title={`产品 ID：${productDisplayId(p) || '—'}`}>产品 ID：{productDisplayId(p) || '—'}</span><span className={s.skuCount}>{p.skus.length} 个 SKU</span></div>}
    </div>
  </div>;
  const actionColumn: TreeTableColumn<CatalogRow> = { id: 'actions', title: '操作', width: 185, fixed: true, render: ({ product: p, sku }) => <div className={s.treeActions}>
    <Button className={s.treeLink} aria-label={`编辑 ${sku ? `SKU ${skuCode(sku)}` : productTitle(p)}`} onClick={() => open(p, sku, sku ? 'SKU 档案' : '基础资料', true)}>编辑</Button>
    <Button className={s.treeLink} aria-label={`${sku ? '认领 SKU' : '全部认领'} ${sku ? skuCode(sku) : productTitle(p)}`} disabled={!p.skus.length || !d.collectionReady} onClick={() => beginClaim([{ product: p, skuIds: sku ? [sku.id] : p.skus.map(item => item.id) }])}>{sku ? '认领' : '全部认领'}</Button>
    <Button className={s.treeLink} aria-label={`删除 ${sku ? `SKU ${skuCode(sku)}` : productTitle(p)}`} disabled={!d.collectionReady} onClick={() => sku ? setDeletingSku({productId:p.id,skuId:sku.id}) : setDeleting([p])}>删除</Button>
    {sku && <Button className={s.treeLink} aria-label={`认领记录 ${skuCode(sku)}`} onClick={() => setClaimRecords({productId:p.id,skuId:sku.id})}>认领记录</Button>}
  </div> };

  const columns: TreeTableColumn<CatalogRow>[] = [
    { id: 'product', title: '商品名称', width: 340, render: productCell },
    { id: 'category', title: '类目', width: 110, render: ({ product: p }) => (p.category_name ?? p.category) || '—' },
    { id: 'source', title: '货源', width: 100, render: ({ product: p }) => supplySources[productSupplySource(p)] || productSupplySource(p) || '—' },
    { id: 'brand', title: '品牌', width: 100, render: ({ product: p }) => (p.brand_name ?? p.brand) || '—' },
    { id: 'materials', title: '素材', width: 145, render: ({ product: p }) => {
      const assets = productAssets(p.id, d.links, media);
      const imageCount = assets.filter(item => item.media.type === 'image').length;
      const videoCount = assets.filter(item => item.media.type === 'video').length;
      return <Button className={s.preparationCell} aria-label={`查看${productTitle(p)}的素材`} onClick={() => open(p, undefined, '素材')}><span><Images size={13}/>{imageCount} 图片{videoCount > 0 && ` · ${videoCount} 视频`}</span></Button>;
    } },
    actionColumn,
  ];
  const skuColumns: TreeTableColumn<CatalogRow>[] = [
    { id: 'product', title: 'SKU 货号', width: 310, render: productCell },
    { id: 'spec', title: '规格', width: 180, render: ({ sku }) => sku ? skuSpec(sku) || '—' : '—' },
    { id: 'price', title: '价格', width: 100, render: ({ sku }) => <span className={s.treePrice}>{sku ? skuPrice(sku).trim() || '—' : '—'}</span> },
    { ...actionColumn, width: 240 },
  ];
  return <section className={s.root} aria-label="商品库管理">
    {(active || editor) ? <ProductDetail key={(active || editor)!.id} product={(active || editor)!} initialSku={initialSku} initialEditing={editOnOpen} isNew={!!editor} onBack={() => { d.setActiveProduct(null); setEditor(null); setEditOnOpen(false); }} onSaved={saved => { setEditor(null); setEditOnOpen(false); d.setActiveProduct(saved.id); }} onClaim={() => { if (active) beginClaim([{ product: active, skuIds: active.skus.map(sku => sku.id) }]); }}/> : <>
      <header className={s.heading}><div><h1>商品库</h1></div><div className={s.actions}>{filter === '全部' && <Button className={s.exportTrigger} disabled={exporting || !products.length || !d.collectionReady} title="导出当前列表的商品、SKU 和素材链接（Excel）" onClick={() => void exportProducts()}><Download size={15}/>{exporting ? '正在导出…' : '导出商品'}</Button>}<DropdownMenu><DropdownMenuTrigger asChild><Button className={`${s.exportTrigger} ${s.importTrigger}`} aria-label="导入商品"><Upload size={15}/>导入商品<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={7} className={s.importMenu} aria-label="选择导入方式"><DropdownMenuItem key="excel" onSelect={() => openImport('excel')}><FileSpreadsheet size={16}/>Excel 导入</DropdownMenuItem><DropdownMenuItem key="link" onSelect={() => openImport('link')}><Link2 size={16}/>链接采集</DropdownMenuItem><DropdownMenuItem key="image" onSelect={() => openImport('image')}><ScanLine size={16}/>识图采集</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button className={s.primary} disabled={!d.collectionReady} onClick={newProduct}><Plus size={15}/>新建商品</Button></div></header>
      <div className={s.toolbar}><div className={s.pills} role="group" aria-label="商品清单">{(['全部', '待刊登', '已刊登'] as const).map(value => <Button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelection({}); setPage(1); setQuery(''); setListingPlatform(''); }}>{value}{value !== '全部' && <small>{listingTaskRows(d.productListing.tasks, d.products, value === '待刊登' ? 'pending' : 'published').length}</small>}</Button>)}</div><div className={s.listingFilters}>{filter !== '全部' && <Select className={s.platformFilter} aria-label="筛选刊登平台" value={listingPlatform} onChange={event => setListingPlatform(event.target.value)}><option value="">全部平台</option>{platforms.map(platform => <option key={platform} value={platform}>{platform}</option>)}</Select>}<FieldLabel className={s.search}><Search size={15}/><Input aria-label="搜索商品" placeholder={filter === '全部' ? '搜索标题、ID 或 SKU 货号' : '搜索商品、SKU 或店铺'} value={query} onChange={e => { setQuery(e.target.value); setSelection({}); setPage(1); }}/>{query && <Button aria-label="清空搜索" onClick={() => { setQuery(''); setSelection({}); }}><X size={13}/></Button>}</FieldLabel></div></div>
      {filter !== '全部' ? <ProductListingList tab={filter === '待刊登' ? 'pending' : 'published'} query={query} platform={listingPlatform} onView={onOpenListingAgent} onPreview={(url, name) => setImagePreview({ url, name })}/> : <>
        <div className={s.subToolbar}><div className={s.actions}><span className={s.muted}>共 {products.length} 个商品</span></div><div className={s.actions}><Button className={s.textControl} onClick={() => setExpanded(expanded.size ? new Set() : new Set(pageProducts.map(p => p.id)))}>{expanded.size ? '收起 SKU' : '展开 SKU'}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button className={s.textControl} aria-label="商品库更多操作">更多</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className={s.importMenu}><DropdownMenuItem key="history" onSelect={() => setTaskHistory('history')}>采集任务记录</DropdownMenuItem><DropdownMenuItem key="failures" onSelect={() => setTaskHistory('failure')}>采集失败{failures > 0 ? `（${failures}）` : ''}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div>

        {!!scopes.length && <div className={s.batchBar} role="region" aria-label="批量操作"><strong>已选 {scopes.length} 个 SPU · {selectedSkuCount} 个 SKU</strong><div className={s.actions}><Button disabled={!selectedSkuCount || !d.collectionReady} onClick={() => beginClaim(scopes)}>批量认领</Button><Button disabled={exporting || !d.collectionReady} onClick={() => void exportProducts(scopes.map(scope => scope.product), true, Object.fromEntries(scopes.map(scope => [scope.product.id, scope.skuIds])))}><Download size={14}/>批量导出</Button><Button className={s.deleteAction} disabled={scopes.some(scope => !scope.full) || !d.collectionReady} title="仅支持删除完整勾选的 SPU" onClick={() => setDeleting(scopes.map(scope => scope.product))}>批量删除</Button><Button onClick={() => setSelection({})}>取消选择</Button></div></div>}
        {!d.collectionReady ? <div className={s.empty} role="status"><h3>{d.workspaceStorageStatus === 'error' ? '商品数据读取失败' : '正在读取商品库…'}</h3><p>{d.workspaceStorageStatus === 'error' ? '请检查浏览器存储权限，刷新后重试。' : '正在恢复商品、SKU 与素材关联。'}</p>{d.workspaceStorageStatus === 'error' && <Button onClick={() => window.location.reload()}>重新加载</Button>}</div> : products.length ? <TreeTable label="商品列表" columns={columns} childColumns={skuColumns} rows={treeRows} expanded={expanded} onExpandedChange={(id, open) => setExpanded(old => { const next = new Set(old); if (open) next.add(id); else next.delete(id); return next; })} selection={{ label: '选择本页商品', checked: allSelected, mixed: !!scopes.length && !allSelected, onChange: checked => setSelection(checked ? Object.fromEntries(pageProducts.map(p => [p.id, 'all' as const])) : {}) }}/>
 : <Empty title={!query && filter === '全部' ? '建立你的商品库' : '没有匹配的商品'} description={!query ? '新建商品，或导入供应商资料，统一管理 SKU、素材与各店铺的刊登准备。' : '尝试调整搜索关键词，或返回全部商品。'}><Button onClick={() => { if (!query && filter === '全部') newProduct(); else { setQuery(''); setFilter('全部'); setSelection({}); } }}>{!query && filter === '全部' ? '新建第一个商品' : '查看全部商品'}</Button></Empty>}
        {products.length > 0 && <div className={s.pagination}><span>第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, products.length)} 项，共 {products.length} 项</span><div className={s.actions}><Select aria-label="每页商品数量" value={String(pageSize)} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); setSelection({}); }}>{[20, 50, 100].map(value => <option key={value} value={value}>{value} 项 / 页</option>)}</Select><Button aria-label="上一页商品" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelection({}); }}><ChevronLeft size={15}/></Button><span>{currentPage} / {pageCount}</span><Button aria-label="下一页商品" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelection({}); }}><ArrowRight size={15}/></Button></div></div>}

      </>}
    </>}
    {claiming && <ProductClaimDialog key={`${token || 'guest'}:${claimShopMocks}`} useMockShops={claimShopMocks} scopes={claiming} token={token} onClose={() => setClaiming(null)} onConfirm={(shops, platform) => {
      const result = claimProductsToShops(d.products, claiming, shops, platform, new Date().toISOString());
      d.setProducts(result.products);
      d.setListingShops(old => [...new Map([...old, ...shops].map(shop => [shop.id, shop])).values()]);
      d.setActiveProduct(null); setClaiming(null); setSelection({}); setFilter('待刊登'); setListingPlatform(''); setPage(1); setQuery('');
      d.setNotice(`已认领到 ${shops.length} 家店铺，新增 ${result.count} 个 SKU 认领记录。`);
    }}/>}
    {deleting && <DemoModal title={deleting.length > 1 ? '批量删除商品' : '删除商品'} onClose={() => setDeleting(null)}><p className={s.bodyText}>确认删除以下 {deleting.length} 个 SPU 及其全部 SKU、待刊登记录和商品素材关联？素材文件及历史创作任务会保留。</p><div className={s.claimScopeList}>{deleting.map(p => <div key={p.id}><strong>{p.name}</strong><span>{p.skus.length} 个 SKU</span></div>)}</div><div className={s.modalFooter}><Button onClick={() => setDeleting(null)}>取消</Button><Button className={s.primary} disabled={!d.collectionReady} onClick={() => {
      const ids = new Set(deleting.map(p => p.id)), skuIds = new Set(deleting.flatMap(p => p.skus.map(sku => sku.id)));
      d.setProducts(old => old.filter(p => !ids.has(p.id))); d.productListing.setTasks(old => old.filter(task => !ids.has(task.productId))); d.setLinks(old => old.filter(l => !ids.has(l.productId))); d.setReferenceProducts(old => old.filter(id => !ids.has(id))); d.setReferenceSkus(old => old.filter(id => !skuIds.has(id))); if (d.activeProduct && ids.has(d.activeProduct)) d.setActiveProduct(null);
      setSelection({}); setDeleting(null); d.setNotice(`已删除 ${ids.size} 个 SPU。`);
    }}>确认删除</Button></div></DemoModal>}
    {imagePreview && <FormDialog title="图片预览" description={imagePreview.name} onClose={() => setImagePreview(null)} wide className={s.productImageDialog}><div className={s.productImagePreview}><Image src={imagePreview.url} alt={imagePreview.name} width={1600} height={1200} unoptimized/></div></FormDialog>}
    {taskHistory && <DemoModal title={taskHistory === 'failure' ? '采集失败' : '采集任务记录'} wide onClose={() => setTaskHistory(null)}><ProductCollectionRecords view={taskHistory} onImport={method => { setTaskHistory(null); openImport(method); }} onTask={id => { setTaskHistory(null); setCollectionTask(id); setImporting('link'); }}/></DemoModal>}
    {claimRecords && <ProductClaimRecords {...claimRecords} onClose={() => setClaimRecords(null)} onOpenDraft={onOpenListingAgent}/>}
    {deletingSku && <DemoModal title="删除 SKU" onClose={() => setDeletingSku(null)}><p className={s.bodyText}>确认删除 SKU「{skuCode(d.products.find(p => p.id === deletingSku.productId)?.skus.find(sku => sku.id === deletingSku.skuId) || {id:'',code:'',color:'',spec:''})}」？其认领记录和商品素材关联将一并移除，素材文件保留。</p><div className={s.modalFooter}><Button onClick={() => setDeletingSku(null)}>取消</Button><Button className={s.primary} disabled={!d.collectionReady} onClick={() => {
      const { productId, skuId } = deletingSku;
      const product = d.products.find(product => product.id === productId);
      if (!product || !product.skus.some(sku => sku.id === skuId)) { setDeletingSku(null); d.setNotice('SKU 已不存在，请刷新后重试。'); return; }
      const removed = removeProductSku(product, skuId, d.links);
      d.setProducts(old => old.map(product => product.id === productId ? removed.product : product)); d.setLinks(removed.links);
      d.productListing.setTasks(old => old.filter(task => task.productId !== productId || task.skuId !== skuId));
      d.setReferenceSkus(old => old.filter(id => id !== skuId)); setSelection({}); setDeletingSku(null); d.setNotice('SKU 已删除。');
    }}>确认删除</Button></div></DemoModal>}
    {importing && <ProductImportDialog key={`${importing}-${collectionTask}`} method={importing} imageTask={imageImportTask} initialTask={collectionTask} onClose={() => setImporting(null)} onOpen={p => { setImporting(null); open(p); }}/>}
  </section>;
}
