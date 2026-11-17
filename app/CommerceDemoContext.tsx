"use client";
import { useContext, useState, useCallback, useEffect, type ReactNode, type SetStateAction } from "react";
import { CommerceContext } from "./commerce-context";
import { useToast } from "@/components/OperationFeedback";
import { mediaSeed, type Product, type Media, type Association, type CreativeJob } from "./commerce-demo-data";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
import { creativeSampleMedia } from "./creative-session-seeds";
import {socialAccountSeed,type SocialAccount,type PublishPlan} from "./social-publishing";
import { fillProductDetailMock } from './product-detail-mocks';
import { productMockVersion } from "./product-library-mocks";
import type { ListingShop } from "./listing-shops";
import { restoreSpuCatalog } from "./product-management";
import { useMaterialLibrary } from "./use-material-library";
import { materialMediaSeed, refreshMaterialMockDates } from "./material-library-data";
import { useProductCollection } from "./use-product-collection";
import { useProductExport } from "./use-product-export";
import { restoreListingTasks } from "./product-listing";
import { listingTasksForStorage } from "./product-listing-mocks";
import { useProductListing } from "./use-product-listing";
import { ProductExportProgress } from "./ProductExportProgress";
const useDemoState = () => {
  const productExport=useProductExport();
  const library=useMaterialLibrary();
  const {materialLibrary,materialReady,setLibraryReferences}=library;
  const [socialAccounts,setSocialAccounts]=useState<SocialAccount[]>(socialAccountSeed);
  const [publishPlans,setPublishPlans]=useState<PublishPlan[]>([]);
  const [catalog,setCatalog]=useState(()=>restoreSpuCatalog([],[]));
  const [listingShops,setListingShops]=useState<ListingShop[]>([]);
  const {products,links}=catalog;
  const setProducts=useCallback((update:SetStateAction<Product[]>)=>setCatalog(old=>restoreSpuCatalog(typeof update==="function"?update(old.products):update,old.links)),[]);
  const setLinks=useCallback((update:SetStateAction<Association[]>)=>setCatalog(old=>({...old,links:typeof update==="function"?update(old.links):update})),[]);
  const [media,setMedia]=useState<Media[]>([...materialMediaSeed,...mediaSeed,...creativeSampleMedia]);
  const [referenceProducts,setReferenceProducts]=useState<string[]>([]);
  const [referenceSkus,setReferenceSkus]=useState<string[]>([]);
  const [referenceMedia,setReferenceMedia]=useState<string[]>([]);

  useEffect(()=>{
    if(!materialReady)return;
    const timer=setTimeout(()=>{
    const purged=new Set(Object.entries(materialLibrary.metadata).filter(([,meta])=>meta.purgedAt).map(([id])=>id));
    if(purged.size){
      setMedia(old=>old.some(item=>purged.has(item.id))?old.filter(item=>!purged.has(item.id)):old);
      setLinks(old=>old.some(link=>purged.has(link.mediaId))?old.filter(link=>!purged.has(link.mediaId)):old);
      setReferenceMedia(old=>old.some(id=>purged.has(id))?old.filter(id=>!purged.has(id)):old);
    }
    setLibraryReferences(old=>old.filter(reference=>reference.kind==="brand"?materialLibrary.brands.some(item=>item.id===reference.id&&!item.deletedAt):reference.kind==="model"?materialLibrary.models.some(item=>item.id===reference.id&&!item.deletedAt):true));
    },0);
    return ()=>clearTimeout(timer);
  },[materialLibrary,materialReady,setLibraryReferences,media,setLinks]);
  const [jobs,setJobs]=useState<CreativeJob[]>([]);
  const [notice,updateNotice]=useState("");
  const toast=useToast();
  const setNotice=useCallback((value:string)=>{updateNotice(value);if(value)toast.info(value,"creative-demo");},[toast]);
  const [workspaceStorageStatus,setWorkspaceStorageStatus]=useState<"loading"|"ready"|"error">("loading");
  const [storage,setStorage]=useState<{db:IDBDatabase;key:string}|null>(null);
  const applyCollection=useCallback((next:{products:Product[];links:Association[];media:Media[]})=>{setCatalog({products:next.products,links:next.links});setMedia(next.media);},[]);
  const collection=useProductCollection({products,links,media},applyCollection,setNotice,!!storage);
  const {collectionTasks,setCollectionTasks}=collection;
  const productListing=useProductListing(products,listingShops,!!storage);
  const {tasks:listingTasks,setTasks:setListingTasks}=productListing;
  useEffect(()=>{
    let disposed=false;
    let db:IDBDatabase|undefined;
    const request=indexedDB.open("agentscope-commerce",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("workspace");
    request.onerror=()=>{setWorkspaceStorageStatus("error");setNotice("浏览器无法保存素材数据，请检查存储权限。");};
    request.onsuccess=()=>{
      db=request.result;
      if(disposed){db.close();return;}
      let key="guest";
      try{key=JSON.parse(localStorage.getItem("agentscope-studio-auth-v1")||"null")?.user?.id||"guest";}catch{}
      const read=db.transaction("workspace","readonly").objectStore("workspace").get(key);
      read.onsuccess=()=>{
        if(disposed)return;
        const saved=read.result || null;
        if(read.result?.collectionTasks)setCollectionTasks(read.result.collectionTasks);
        if(saved){if(Array.isArray(saved.listingTasks))setListingTasks(restoreListingTasks(saved.listingTasks));setCatalog(restoreSpuCatalog((saved.products??[]).map(fillProductDetailMock),saved.links??[]));setMedia([...(saved.media??mediaSeed).map(refreshMaterialMockDates).map((media:Media)=>media.url.startsWith("/creative/videos/santal-film-")?{...media,url:"",placeholder:true,poster:"/creative/video-previews/editing-poster-v1.jpg"}:({...media,url:/\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(media.url)?perfumeArtwork:media.url})),...[...materialMediaSeed,...creativeSampleMedia].filter(m=>!saved.media?.some((item:Media)=>item.id===m.id))]);setJobs(saved.jobs??[]);setListingShops(saved.listingShops??[]);setSocialAccounts(saved.socialAccounts??socialAccountSeed);setPublishPlans(saved.publishPlans??[]);}
        setStorage({db:db!,key});setWorkspaceStorageStatus("ready");
      };
      read.onerror=()=>{setWorkspaceStorageStatus("error");setNotice("读取本地素材失败，请刷新后重试。");};
    };
    return ()=>{disposed=true;db?.close();};
  },[setNotice,setCollectionTasks,setListingTasks]);
  useEffect(()=>{
    if(!storage)return;
    try{
        const tx=storage.db.transaction("workspace","readwrite");
        tx.objectStore("workspace").put({productMockVersion,products,media,links,jobs,socialAccounts,publishPlans,collectionTasks,listingShops,listingTasks:listingTasksForStorage(listingTasks)},storage.key);
        tx.onerror=()=>setNotice("本地存储空间不足，修改暂未保存，请清理浏览器存储。");
    }catch{queueMicrotask(()=>setNotice("保存本地素材失败，请刷新后重试。"));}
  },[storage,products,media,links,jobs,socialAccounts,publishPlans,collectionTasks,listingShops,listingTasks,setNotice]);
  const [productLibraryTab,setProductLibraryTab]=useState<"全部"|"草稿箱"|"已刊登">("全部");
  const [productTab,setProductTab]=useState("基础资料");
  const [productMaterialFocus,setProductMaterialFocus]=useState<{mediaId:string;key:string}|null>(null);
  const [activeProduct,setActiveProduct]=useState<string|null>(null);
  return {...library,...collection,productExport,productListing,workspaceStorageStatus,collectionReady:!!storage,socialAccounts,setSocialAccounts,publishPlans,setPublishPlans,products,setProducts,listingShops,setListingShops,media,setMedia,links,setLinks,jobs,setJobs,notice,setNotice,activeProduct,setActiveProduct,productMaterialFocus,setProductMaterialFocus,productTab,setProductTab,productLibraryTab,setProductLibraryTab,referenceProducts,setReferenceProducts,referenceSkus,setReferenceSkus,referenceMedia,setReferenceMedia};
};
export type DemoStore = ReturnType<typeof useDemoState>;
export function CommerceDemoProvider({children}:{children:ReactNode}){const state=useDemoState();return <CommerceContext.Provider value={state}>{children}<ProductExportProgress {...state.productExport}/></CommerceContext.Provider>;}
export function useCommerceDemo(){const state=useContext(CommerceContext);if(!state)throw new Error("Missing commerce demo provider");return state;}
