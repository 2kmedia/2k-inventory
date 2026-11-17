import type { Category, Item, ItemsPage } from "./types";

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
  updateItem: (id: string, data: Record<string, unknown>) =>
    req<Item>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};
