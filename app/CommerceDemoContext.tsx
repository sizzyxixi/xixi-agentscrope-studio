"use client";
import { useContext, useState, useCallback, useEffect, type ReactNode, type SetStateAction } from "react";
import { CommerceContext } from "./commerce-context";
import { useToast } from "@/components/OperationFeedback";
import { productSeed, mediaSeed, associationSeed, legacyProductSeed, type Product, type Media, type Association, type CreativeJob } from "./commerce-demo-data";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
import { creativeSampleMedia, fragranceProduct } from "./creative-session-seeds";
import {socialAccountSeed,type SocialAccount,type PublishPlan} from "./social-publishing";
import { mergeProductMocks, productJobSeed, productMockVersion } from "./product-library-mocks";
import { splitSkuProducts } from "./sku-products";
import { useMaterialLibrary } from "./use-material-library";
import { materialMediaSeed, refreshMaterialMockDates } from "./material-library-data";
const useDemoState = () => {
  const library=useMaterialLibrary();
  const [socialAccounts,setSocialAccounts]=useState<SocialAccount[]>(socialAccountSeed);
  const [publishPlans,setPublishPlans]=useState<PublishPlan[]>([]);
  const [catalog,setCatalog]=useState(()=>splitSkuProducts([...productSeed,fragranceProduct],associationSeed));
  const {products,links}=catalog;
  const setProducts=useCallback((update:SetStateAction<Product[]>)=>setCatalog(old=>splitSkuProducts(typeof update==="function"?update(old.products):update,old.links)),[]);
  const setLinks=useCallback((update:SetStateAction<Association[]>)=>setCatalog(old=>({...old,links:typeof update==="function"?update(old.links):update})),[]);
  const [media,setMedia]=useState<Media[]>([...materialMediaSeed,...mediaSeed,...creativeSampleMedia]);
  useEffect(()=>{
    if(!library.materialReady)return;
    const purged=new Set(Object.entries(library.materialLibrary.metadata).filter(([,meta])=>meta.purgedAt).map(([id])=>id));
    if(purged.size){
      setMedia(old=>old.some(item=>purged.has(item.id))?old.filter(item=>!purged.has(item.id)):old);
      setLinks(old=>old.some(link=>purged.has(link.mediaId))?old.filter(link=>!purged.has(link.mediaId)):old);
      setReferenceMedia(old=>old.some(id=>purged.has(id))?old.filter(id=>!purged.has(id)):old);
    }
    library.setLibraryReferences(old=>old.filter(reference=>reference.kind==="brand"?library.materialLibrary.brands.some(item=>item.id===reference.id&&!item.deletedAt):reference.kind==="model"?library.materialLibrary.models.some(item=>item.id===reference.id&&!item.deletedAt):true));
  },[library.materialLibrary,library.materialReady,library.setLibraryReferences,media,setLinks]);
  const [jobs,setJobs]=useState<CreativeJob[]>(productJobSeed);
  const [notice,updateNotice]=useState("");
  const toast=useToast();
  const setNotice=useCallback((value:string)=>{updateNotice(value);if(value)toast.info(value,"creative-demo");},[toast]);
  const [storage,setStorage]=useState<{db:IDBDatabase;key:string}|null>(null);
  useEffect(()=>{
    let disposed=false;
    let db:IDBDatabase|undefined;
    const request=indexedDB.open("agentscope-commerce",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("workspace");
    request.onerror=()=>setNotice("浏览器无法保存素材数据，请检查存储权限。");
    request.onsuccess=()=>{
      db=request.result;
      if(disposed){db.close();return;}
      let key="guest";
      try{key=JSON.parse(localStorage.getItem("agentscope-studio-auth-v1")||"null")?.user?.id||"guest";}catch{}
      const read=db.transaction("workspace","readonly").objectStore("workspace").get(key);
      read.onsuccess=()=>{
        if(disposed)return;
        const saved=read.result ? mergeProductMocks(read.result,legacyProductSeed) : null;
        if(saved){setCatalog(splitSkuProducts([...(saved.products??productSeed),...(!saved.products?.some((p:Product)=>p.id===fragranceProduct.id)?[fragranceProduct]:[])],saved.links??associationSeed));setMedia([...(saved.media??mediaSeed).map(refreshMaterialMockDates).map((media:Media)=>media.url.startsWith("/creative/videos/santal-film-")?{...media,url:"",placeholder:true,poster:"/creative/video-previews/editing-poster-v1.jpg"}:({...media,url:/\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(media.url)?perfumeArtwork:media.url})),...[...materialMediaSeed,...creativeSampleMedia].filter(m=>!saved.media?.some((item:Media)=>item.id===m.id))]);setJobs(saved.jobs??[]);setSocialAccounts(saved.socialAccounts??socialAccountSeed);setPublishPlans(saved.publishPlans??[]);}
        setStorage({db:db!,key});
      };
      read.onerror=()=>setNotice("读取本地素材失败，请刷新后重试。");
    };
    return ()=>{disposed=true;db?.close();};
  },[setNotice]);
  useEffect(()=>{
    if(!storage||products.some(product=>product.skus.length>1))return;
    const timer=setTimeout(()=>{
      try{
        const tx=storage.db.transaction("workspace","readwrite");
        tx.objectStore("workspace").put({productMockVersion,products,media,links,jobs,socialAccounts,publishPlans},storage.key);
        tx.onerror=()=>setNotice("本地存储空间不足，修改暂未保存，请清理浏览器存储。");
      }catch{setNotice("保存本地素材失败，请刷新后重试。");}
    },150);
    return ()=>clearTimeout(timer);
  },[storage,products,media,links,jobs,socialAccounts,publishPlans,setNotice]);
  const [productTab,setProductTab]=useState("基础资料");
  const [activeProduct,setActiveProduct]=useState<string|null>(null);
  const [referenceProducts,setReferenceProducts]=useState<string[]>([]);
  const [referenceSkus,setReferenceSkus]=useState<string[]>([]);
  const [referenceMedia,setReferenceMedia]=useState<string[]>([]);
  return {...library,socialAccounts,setSocialAccounts,publishPlans,setPublishPlans,products,setProducts,media,setMedia,links,setLinks,jobs,setJobs,notice,setNotice,activeProduct,setActiveProduct,productTab,setProductTab,referenceProducts,setReferenceProducts,referenceSkus,setReferenceSkus,referenceMedia,setReferenceMedia};
};
export type DemoStore = ReturnType<typeof useDemoState>;
export function CommerceDemoProvider({children}:{children:ReactNode}){const state=useDemoState();return <CommerceContext.Provider value={state}>{children}</CommerceContext.Provider>;}
export function useCommerceDemo(){const state=useContext(CommerceContext);if(!state)throw new Error("Missing commerce demo provider");return state;}
