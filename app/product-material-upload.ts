import type { Media } from './commerce-demo-data';

export type MaterialUpload = { id: string; file: File; name: string; previewUrl: string };

const fileKey = (file: File) => JSON.stringify([file.name, file.size, file.type, file.lastModified]);

export function selectMaterialFiles(files: File[], existing: Pick<MaterialUpload, 'file'>[]) {
  const seen = new Set(existing.map(item => fileKey(item.file)));
  const accepted: File[] = [], errors: string[] = [];
  for (const file of files) {
    if (!/^(image|video)\//.test(file.type)) { errors.push(`${file.name}：请选择图片或视频。`); continue; }
    if (file.size > 20 * 1024 * 1024) { errors.push(`${file.name}：文件大小不能超过 20MB。`); continue; }
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key); accepted.push(file);
  }
  return { accepted, errors };
}

/** Read the whole batch before the caller commits any media or associations. */
export async function readMaterialUploads(uploads: MaterialUpload[], read: (file: File) => Promise<string>): Promise<Media[]> {
  if (!uploads.length) throw new Error('请先上传图片或视频。');
  if (uploads.some(item => !item.name.trim() || item.name.trim().length > 150)) throw new Error('请为每个素材填写名称，最多 150 个字。');
  const { accepted, errors } = selectMaterialFiles(uploads.map(item => item.file), []);
  if (errors.length) throw new Error(errors.join('\n'));
  if (accepted.length !== uploads.length) throw new Error('存在重复文件，请移除后重试。');
  const createdAt = new Date().toISOString();
  return Promise.all(uploads.map(async item => ({
    id: item.id, name: item.name.trim(), type: item.file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    source: '用户上传', url: await read(item.file), createdAt, space: 'personal' as const,
  })));
}
