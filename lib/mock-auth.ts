/** Browser-only demo identities. Passwords and backend tokens are never persisted. */
export const mockAuthStorageKey = "agentscope-studio-demo-auth-v1";
const accountsKey = "agentscope-studio-demo-accounts-v1";
export type MockUser = { id: string; username: string; created_at: string };
type LocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function read(key: string, storage: LocalStorage): unknown {
  try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
}
function validUser(value: unknown): value is MockUser {
  return !!value && typeof value === "object" && "id" in value && typeof value.id === "string" && "username" in value && typeof value.username === "string" && "created_at" in value && typeof value.created_at === "string";
}
function accounts(storage: LocalStorage): MockUser[] {
  const saved = read(accountsKey, storage);
  return Array.isArray(saved) ? saved.filter(validUser) : [];
}
export function readMockUser(storage: LocalStorage = localStorage): MockUser | null {
  const saved = read(mockAuthStorageKey, storage);
  return saved && typeof saved === "object" && "mode" in saved && saved.mode === "mock" && "user" in saved && validUser(saved.user) ? saved.user : null;
}
function validateName(name: string) {
  if (!/^[A-Za-z0-9]{4,40}$/.test(name)) throw new Error("用户名需为 4–40 位英文或数字。");
}
export function signInMock(mode: "login" | "register", username: string, password: string, storage: LocalStorage = localStorage): MockUser {
  const name = username.trim();
  validateName(name);
  if (Array.from(password).length < 6) throw new Error("密码至少 6 位。");
  const users = accounts(storage);
  const existing = users.find(user => user.username.toLowerCase() === name.toLowerCase());
  if (mode === "register" && existing) throw new Error("该用户名已注册，请直接登录。");
  const user = existing ?? { id: `demo-${crypto.randomUUID()}`, username: name, created_at: new Date().toISOString() };
  if (!existing) storage.setItem(accountsKey, JSON.stringify([...users, user]));
  storage.setItem(mockAuthStorageKey, JSON.stringify({ mode: "mock", user }));
  return user;
}
export function renameMockUser(id: string, username: string, storage: LocalStorage = localStorage): MockUser {
  const name = username.trim();
  validateName(name);
  const users = accounts(storage);
  const user = users.find(item => item.id === id);
  if (!user) throw new Error("请重新登录演示账号。");
  if (users.some(item => item.id !== id && item.username.toLowerCase() === name.toLowerCase())) throw new Error("该用户名已被使用。");
  const updated = { ...user, username: name };
  storage.setItem(accountsKey, JSON.stringify(users.map(item => item.id === id ? updated : item)));
  if (readMockUser(storage)?.id === id) storage.setItem(mockAuthStorageKey, JSON.stringify({ mode: "mock", user: updated }));
  return updated;
}
export function signOutMock(storage: LocalStorage = localStorage) { storage.removeItem(mockAuthStorageKey); }
