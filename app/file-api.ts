export type StudioFile = {
  id: string;
  session_id: string;
  message_id?: string;
  name: string;
  kind: string;
  origin: "upload" | "artifact";
  mime: string;
  size: number;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  available: boolean;
  notice?: string;
};
export async function fileRequest(
  token: string,
  path: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`/api/files/${path}`, { ...options, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(body.detail || "文件暂无法查看。");
  }
  return response;
}
export async function fileJson<T>(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  return (await fileRequest(token, path, options)).json();
}
export const fileSize = (bytes: number) =>
  bytes >= 1e6
    ? `${(bytes / 1e6).toFixed(1)} MB`
    : bytes >= 1e3
      ? `${(bytes / 1e3).toFixed(1)} KB`
      : `${bytes} B`;
