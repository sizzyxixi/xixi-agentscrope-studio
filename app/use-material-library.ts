"use client";

import { useEffect, useState } from "react";
import { materialLibrarySeed, type MaterialLibraryState, type LibraryReference } from "./material-library-data";

export function useMaterialLibrary() {
  const [materialLibrary,setMaterialLibrary]=useState<MaterialLibraryState>(materialLibrarySeed);
  const [libraryReferences,setLibraryReferences]=useState<LibraryReference[]>([]);
  const [materialReady,setMaterialReady]=useState(false);
  const [materialStorageError,setMaterialStorageError]=useState(false);
  const [materialRole,setMaterialRole]=useState<"member"|"admin">("member");
  const [materialKey,setMaterialKey]=useState("");
  useEffect(()=>{
    let user="guest";
    try { user=JSON.parse(localStorage.getItem("agentscope-studio-auth-v1")||"null")?.user?.id||"guest"; } catch {}
    const key=`agentscope-material-library-v2:${user}`;
    try { const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved?.metadata&&saved?.brands&&saved?.models&&saved?.folders)setMaterialLibrary(saved); } catch { setMaterialStorageError(true); }
    setMaterialKey(key);setMaterialReady(true);
  },[]);
  useEffect(()=>{
    if(!materialReady||!materialKey)return;
    const timer=setTimeout(()=>{try{localStorage.setItem(materialKey,JSON.stringify(materialLibrary));setMaterialStorageError(false);}catch{setMaterialStorageError(true);}},150);
    return ()=>clearTimeout(timer);
  },[materialLibrary,materialReady,materialKey]);
  return {materialLibrary,setMaterialLibrary,libraryReferences,setLibraryReferences,materialReady,materialStorageError,materialRole,setMaterialRole};
}
