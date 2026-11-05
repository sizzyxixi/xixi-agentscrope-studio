import type { MaterialLibraryState } from "./material-library-data";

const DAY = 24 * 60 * 60 * 1000;
export const TRASH_RETENTION_MS = 7 * DAY;

export function trashExpiresAt(deletedAt?: string): number {
  return deletedAt ? Date.parse(deletedAt) + TRASH_RETENTION_MS : NaN;
}

export function isTrashExpired(deletedAt: string | undefined, now = Date.now()): boolean {
  return now >= trashExpiresAt(deletedAt);
}

export function trashRemaining(deletedAt: string, now = Date.now()) {
  const remaining = Math.min(TRASH_RETENTION_MS, trashExpiresAt(deletedAt) - now);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return { label: remaining < DAY ? "<1天" : `${Math.ceil(remaining / DAY)}天`, urgent: remaining < DAY };
}

/** Keep only a minimal media tombstone so bundled fixtures cannot reappear on reload. */
export function purgeExpiredTrash(state: MaterialLibraryState, now = Date.now()): MaterialLibraryState {
  const expiredMedia = Object.entries(state.metadata).filter(([,meta])=>!meta.purgedAt&&isTrashExpired(meta.deletedAt,now));
  const brands = state.brands.filter(item=>!isTrashExpired(item.deletedAt,now));
  const models = state.models.filter(item=>!isTrashExpired(item.deletedAt,now));
  const removedFolders = new Set(state.folders.filter(item=>item.deletedAt).map(item=>item.id));
  if (!expiredMedia.length && brands.length===state.brands.length && models.length===state.models.length && !removedFolders.size) return state;
  const metadata = {...state.metadata};
  for (const [id,meta] of expiredMedia) metadata[id]={deletedAt:meta.deletedAt,purgedAt:new Date(now).toISOString()};
  for (const [id,meta] of Object.entries(metadata)) {
    if (meta.folder&&removedFolders.has(meta.folder)) metadata[id]={...meta,folder:undefined};
  }
  return {...state,metadata,brands,models,folders:state.folders.filter(item=>!removedFolders.has(item.id))};
}
