import Link from 'next/link';
import { ArrowLeft, Store } from 'lucide-react';
import s from './shop-list.module.css';
export default function ShopListPage() {
  return <main className={s.root}><Link className={s.back} href="/products-demo"><ArrowLeft size={15}/>返回商品库</Link><header><span>店铺管理</span><h1>店铺列表</h1></header><section className={s.empty}><Store size={35}/><h2>店铺管理</h2><p>管理各平台店铺及授权信息。</p></section></main>;
}
