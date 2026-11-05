"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { upgradeStyleLibrary, normalizeStyleReferences } from "./style-schemes";
import { materialLibrarySeed, type MaterialLibraryState, type LibraryReference } from "./material-library-data";
import { purgeExpiredTrash, trashExpiresAt } from "./material-trash";

export function useMaterialLibrary() {
  const [materialLibrary,setMaterialLibrary]=useState<MaterialLibraryState>(()=>upgradeStyleLibrary(materialLibrarySeed));
  const [libraryReferences,setLibraryReferencesState]=useState<LibraryReference[]>([]);
  const setLibraryReferences:Dispatch<SetStateAction<LibraryReference[]>>=useCallback(action=>setLibraryReferencesState(old=>normalizeStyleReferences(typeof action==="function"?action(old):action)),[]);
  const [materialReady,setMaterialReady]=useState(false);
  const [materialStorageError,setMaterialStorageError]=useState(false);
  const [materialRole,setMaterialRole]=useState<"member"|"admin">("admin");
  const [materialKey,setMaterialKey]=useState("");
  const [materialNow,setMaterialNow]=useState(()=>Date.now());
  useEffect(()=>{
    let user="guest";
    try { user=JSON.parse(localStorage.getItem("agentscope-studio-auth-v1")||"null")?.user?.id||"guest"; } catch {}
    const key=`agentscope-material-library-v2:${user}`;
    try { const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved?.metadata&&saved?.brands&&saved?.models&&saved?.folders)setMaterialLibrary(purgeExpiredTrash(upgradeStyleLibrary(saved))); } catch { setMaterialStorageError(true); }
    setMaterialKey(key);setMaterialReady(true);
  },[]);
  useEffect(()=>{
    if(!materialReady)return;
    const refresh=()=>{const now=Date.now();setMaterialNow(now);setMaterialLibrary(old=>purgeExpiredTrash(old,now));};
    const deadlines=[...Object.values(materialLibrary.metadata).filter(meta=>!meta.purgedAt),...materialLibrary.brands,...materialLibrary.models].map(item=>trashExpiresAt(item.deletedAt)).filter(Number.isFinite);
    const delay=Math.max(0,Math.min(60000,...deadlines.map(deadline=>deadline-Date.now())));
    const timer=setTimeout(refresh,delay);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{clearTimeout(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[materialLibrary,materialReady,materialNow]);
  useEffect(()=>{
    if(!materialReady||!materialKey)return;
    const timer=setTimeout(()=>{try{localStorage.setItem(materialKey,JSON.stringify(materialLibrary));setMaterialStorageError(false);}catch{setMaterialStorageError(true);}},150);
    return ()=>clearTimeout(timer);
  },[materialLibrary,materialReady,materialKey]);
  return {materialLibrary,setMaterialLibrary,libraryReferences,setLibraryReferences,materialReady,materialStorageError,materialRole,setMaterialRole,materialNow};
}
