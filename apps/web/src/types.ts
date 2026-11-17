export type ItemStatus = "AVAILABLE" | "RESERVED" | "ISSUED" | "IN_REPAIR" | "WRITTEN_OFF" | "LOST";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  AVAILABLE: "Доступно",
  RESERVED: "Заброньовано",
  ISSUED: "Видано",
  IN_REPAIR: "У ремонті",
  WRITTEN_OFF: "Списано",
  LOST: "Втрачено",
};

export interface Category {
  id: string;
  name: string;
  _count?: { items: number };
}

export interface Item {
  id: string;
  code: string;
  name: string;
  serialNumber: string | null;
  spec: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  locationNote: string | null;
  license: string | null;
  purchaseDate: string | null;
  invoiceNumber: string | null;
  purchaseUsd: string | null; // Decimal приходить рядком
  rentalPrice: string | null;
  warrantyUntil: string | null;
  status: ItemStatus;
  notes: string | null;
}

export interface ItemsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Item[];
}

export type ProjectStatus = "DRAFT" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Чернетка",
  CONFIRMED: "Підтверджено",
  IN_PROGRESS: "Видано / в роботі",
  COMPLETED: "Завершено",
  CANCELLED: "Скасовано",
};

export interface Client {
  id: string;
  name: string;
  type: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  _count?: { projects: number };
}

export interface ProjectLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  serialNumber: string | null;
  itemStatus: ItemStatus | null;
  unitPrice: number;
  discount: number;
  amount: number;
}

export interface Project {
  id: string;
  number: string;
  name: string;
  status: ProjectStatus;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  client: { id: string; name: string } | null;
  days: number;
  lines: ProjectLine[];
  total: number;
}

export interface AvailableItem {
  id: string;
  code: string;
  name: string;
  serialNumber: string | null;
  rentalPrice: number | null;
  status: ItemStatus;
  busyWith: string | null;
}
