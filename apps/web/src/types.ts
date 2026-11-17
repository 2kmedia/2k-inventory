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
