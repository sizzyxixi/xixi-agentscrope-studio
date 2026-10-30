"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useToast } from "@/components/OperationFeedback";
import { productSeed, mediaSeed, associationSeed, type Product, type Media, type Association, type CreativeJob } from "./commerce-demo-data";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
import { creativeSampleMedia, fragranceProduct } from "./creative-session-seeds";
import {socialAccountSeed,type SocialAccount,type PublishPlan} from "./social-publishing";
const useDemoState = () => {
  const [socialAccounts,setSocialAccounts]=useState<SocialAccount[]>(socialAccountSeed);
  const [publishPlans,setPublishPlans]=useState<PublishPlan[]>([]);
  const [products,setProducts]=useState<Product[]>([...productSeed,fragranceProduct]);
  const [media,setMedia]=useState<Media[]>([...mediaSeed,...creativeSampleMedia]);
  const [links,setLinks]=useState<Association[]>(associationSeed);
  const [jobs,setJobs]=useState<CreativeJob[]>([]);
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
        const saved=read.result;
        if(saved){setProducts([...(saved.products??productSeed),...(!saved.products?.some((p:Product)=>p.id===fragranceProduct.id)?[fragranceProduct]:[])]);setMedia([...(saved.media??mediaSeed).map((media:Media)=>media.url.startsWith("/creative/videos/santal-film-")?{...media,url:"",placeholder:true,poster:"/creative/video-previews/editing-poster-v1.jpg"}:({...media,url:/\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(media.url)?perfumeArtwork:media.url})),...creativeSampleMedia.filter(m=>!saved.media?.some((item:Media)=>item.id===m.id))]);setLinks(saved.links??associationSeed);setJobs(saved.jobs??[]);setSocialAccounts(saved.socialAccounts??socialAccountSeed);setPublishPlans(saved.publishPlans??[]);}
        setStorage({db:db!,key});
      };
      read.onerror=()=>setNotice("读取本地素材失败，请刷新后重试。");
    };
    return ()=>{disposed=true;db?.close();};
  },[setNotice]);
  useEffect(()=>{
    if(!storage)return;
    const timer=setTimeout(()=>{
      try{
        const tx=storage.db.transaction("workspace","readwrite");
        tx.objectStore("workspace").put({products,media,links,jobs,socialAccounts,publishPlans},storage.key);
        tx.onerror=()=>setNotice("本地存储空间不足，修改暂未保存，请清理浏览器存储。");
      }catch{setNotice("保存本地素材失败，请刷新后重试。");}
    },150);
    return ()=>clearTimeout(timer);
  },[storage,products,media,links,jobs,socialAccounts,publishPlans,setNotice]);
  const [productTab,setProductTab]=useState("创作概览");
  const [activeProduct,setActiveProduct]=useState<string|null>(null);
  const [referenceProducts,setReferenceProducts]=useState<string[]>([]);
  const [referenceSkus,setReferenceSkus]=useState<string[]>([]);
  const [referenceMedia,setReferenceMedia]=useState<string[]>([]);
  return {socialAccounts,setSocialAccounts,publishPlans,setPublishPlans,products,setProducts,media,setMedia,links,setLinks,jobs,setJobs,notice,setNotice,activeProduct,setActiveProduct,productTab,setProductTab,referenceProducts,setReferenceProducts,referenceSkus,setReferenceSkus,referenceMedia,setReferenceMedia};
};
export type DemoStore = ReturnType<typeof useDemoState>;
const Context=createContext<DemoStore|null>(null);
export function CommerceDemoProvider({children}:{children:ReactNode}){const state=useDemoState();return <Context.Provider value={state}>{children}</Context.Provider>;}
export function useCommerceDemo(){const state=useContext(Context);if(!state)throw new Error("Missing commerce demo provider");return state;}
