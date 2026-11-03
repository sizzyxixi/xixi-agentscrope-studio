"use client";

import Image from "next/image";
import { Archive, ArrowUpRight, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";
import { StudioButton } from "./StudioControls";
import { artwork, type Association, type Media, type Product } from "./commerce-demo-data";
import { productReferences } from "./product-readiness";
import s from "./product-catalog.module.css";

export function ProductCatalog({ products, media, links, list, onOpen, onEdit, onToggleArchive }: {
  products: Product[]; media: Media[]; links: Association[]; list: boolean;
  onOpen: (product: Product) => void; onEdit: (product: Product) => void; onToggleArchive: (product: Product) => void;
}) {
  const rows = products.map(product => {
    const related = links.filter(link => link.productId === product.id);
    const cover = productReferences(product, links, media)[0]?.url
      ?? media.find(item => item.type === "image" && related.some(link => link.mediaId === item.id))?.url
      ?? (product.id === "p-santal" ? media.find(item => item.id === "sample-perfume-hero")?.url : undefined) ?? artwork(product.name);
    return { product, cover, skus: product.skus.map(sku => sku.code).join(" · ") || "暂无 SKU" };
  });
  const actions = (product: Product) => <div className={s.actions}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><StudioButton className={s.menuTrigger} aria-label={`更多操作：${product.name}`}><MoreHorizontal size={18}/></StudioButton></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={s.menu} aria-label={`${product.name}的操作`}>
        <DropdownMenuItem key="view" onSelect={() => onOpen(product)}><ArrowUpRight size={15}/>查看商品</DropdownMenuItem>
        <DropdownMenuItem key="edit" onSelect={() => onEdit(product)}><Pencil size={15}/>编辑资料</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem key="archive" onSelect={() => onToggleArchive(product)}>{product.archived ? <RotateCcw size={15}/> : <Archive size={15}/>}{product.archived ? "恢复商品" : "归档商品"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;

  if (list) return <div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>商品名称</th><th>SKU</th><th><span className={s.srOnly}>操作</span></th></tr></thead>
    <tbody>{rows.map(({ product, cover, skus }) => <tr className={s.row} key={product.id}>
      <td><StudioButton className={s.tableProduct} onClick={() => onOpen(product)}><Image src={cover} alt="" width={60} height={60} unoptimized/><strong>{product.name}</strong></StudioButton></td>
      <td className={s.tableSku}>{skus}</td>
      <td>{actions(product)}</td>
    </tr>)}</tbody>
  </table></div>;

  return <div className={s.grid}>{rows.map(({ product, cover, skus }) => <article className={s.card} key={product.id}>
    <StudioButton className={s.cover} aria-label={`查看${product.name}`} onClick={() => onOpen(product)}>
      <Image src={cover} alt={product.name} width={480} height={360} unoptimized/>
    </StudioButton>
    {actions(product)}
    <div className={s.body}>
      <StudioButton className={s.title} onClick={() => onOpen(product)}>{product.name}</StudioButton>
      <p className={s.skus} title={skus}>{skus}</p>
    </div>
  </article>)}</div>;
}
