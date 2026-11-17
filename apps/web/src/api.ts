import type { AvailableItem, Category, Client, Item, ItemsPage, Project } from "./types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Помилка ${r.status}`);
  return body as T;
}

export const api = {
  categories: () => req<Category[]>("/api/categories"),
  renameCategory: (id: string, name: string) =>
    req<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  mergeCategories: (fromId: string, toId: string) =>
    req<{ moved: number }>("/api/categories/merge", { method: "POST", body: JSON.stringify({ fromId, toId }) }),
  items: (params: Record<string, string>) =>
    req<ItemsPage>(`/api/items?${new URLSearchParams(params).toString()}`),
  createItem: (data: Record<string, unknown>) =>
    req<Item>("/api/items", { method: "POST", body: JSON.stringify(data) }),
  nextCode: (categoryId: string) =>
    req<{ code: string | null }>(`/api/items/next-code?categoryId=${categoryId}`),
  updateItem: (id: string, data: Record<string, unknown>) =>
    req<Item>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  clients: () => req<Client[]>("/api/clients"),
  createClient: (data: Record<string, unknown>) =>
    req<Client>("/api/clients", { method: "POST", body: JSON.stringify(data) }),
  projects: () => req<Project[]>("/api/projects"),
  project: (id: string) => req<Project>(`/api/projects/${id}`),
  createProject: (data: Record<string, unknown>) =>
    req<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Record<string, unknown>) =>
    req<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  available: (id: string, q: string) =>
    req<AvailableItem[]>(`/api/projects/${id}/available?q=${encodeURIComponent(q)}`),
  addLine: (id: string, itemId: string) =>
    req<Project>(`/api/projects/${id}/lines`, { method: "POST", body: JSON.stringify({ itemId }) }),
  updateLine: (id: string, lineId: string, data: Record<string, unknown>) =>
    req<Project>(`/api/projects/${id}/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(data) }),
  removeLine: (id: string, lineId: string) =>
    req<Project>(`/api/projects/${id}/lines/${lineId}`, { method: "DELETE" }),
  issue: (id: string) =>
    req<{ issued: number; skipped: number; project: Project }>(`/api/projects/${id}/issue`, { method: "POST", body: "{}" }),
  returnAll: (id: string) =>
    req<{ returned: number; project: Project }>(`/api/projects/${id}/return`, { method: "POST", body: "{}" }),
};
