import { parse } from "csv-parse/sync";

// Індекси колонок у вкладці INVENTORY (перевірено на експорті 2026-11-17)
const COL = {
  code: 0,
  name: 1,
  altName: 2, // колонка без заголовка: додатковий опис / назва українською
  serial: 3,
  spec: 4,
  room: 5,
  cls: 6,
  license: 7,
  bought: 8,
  invoice: 9,
  costUsd: 10,
  rent: 11,
  warranty: 12,
  status: 20,
  edited: 21,
} as const;

export type ItemStatusDraft = "AVAILABLE" | "IN_REPAIR";

export interface ItemDraft {
  sheetRow: number;
  code: string;
  name: string;
  serialNumber: string | null;
  spec: string | null;
  categoryName: string | null;
  locationNote: string | null;
  itemClass: string | null;
  license: string | null;
  purchaseDate: Date | null;
  invoiceNumber: string | null;
  purchaseUsd: number | null;
  rentalPrice: number | null;
  warrantyUntil: Date | null;
  status: ItemStatusDraft;
  notes: string | null;
  sheetEditedAt: Date | null;
}

export interface Issue {
  row: number;
  level: "error" | "warning";
  message: string;
  raw?: string;
}

export interface ParseResult {
  items: ItemDraft[];
  issues: Issue[];
  stats: {
    totalRows: number;
    emptyRows: number;
    sectionRows: number;
    imported: number;
    skipped: number;
    withoutCode: number;
    duplicateCodes: number;
    categories: string[];
  };
}

const clean = (s: string | undefined): string =>
  (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

// Для S/N зберігаємо переноси рядків (в таблиці там іноді склад комплекту)
const keepLines = (s: string | undefined): string =>
  (s ?? "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

/** "$4 000,00" | "1075" | "999,99" -> число. null, якщо порожньо; NaN, якщо незрозуміло. */
export function parseMoney(s: string): number | null {
  const t = s.replace(/[\s $]/g, "");
  if (!t) return null;
  const norm = t.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(norm)) return NaN;
  return Number(norm);
}

/** yyyy.mm.dd | yyyy-mm-dd | yyyy/mm/dd | dd.mm.yyyy | dd/mm/yyyy -> Date (UTC). null, якщо порожньо; NaN-дата, якщо незрозуміло. */
export function parseDate(s: string): Date | null | "bad" {
  const t = clean(s);
  if (!t) return null;
  let y: number, m: number, d: number;
  let mt = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (mt) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) {
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else {
    return "bad";
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return "bad";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : "bad";
}

const isNumericCode = (c: string) => /^\d+$/.test(c);
const nz = (s: string) => (s ? s : null);

export function parseInventoryCsv(csvText: string): ParseResult {
  const rows: string[][] = parse(csvText, {
    relax_column_count: true,
    bom: true,
    skip_empty_lines: false,
  });

  const issues: Issue[] = [];
  const items: ItemDraft[] = [];
  const seenCodes = new Set<string>();
  const categories = new Set<string>();
  const stats = {
    totalRows: Math.max(rows.length - 1, 0),
    emptyRows: 0,
    sectionRows: 0,
    imported: 0,
    skipped: 0,
    withoutCode: 0,
    duplicateCodes: 0,
  };

  let section: string | null = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sheetRow = i + 1; // рядок 1 у таблиці = заголовок
    const cell = (n: number) => r[n] ?? "";
    const rawShort = r
      .slice(0, 12)
      .map((x) => clean(x).slice(0, 30))
      .join(" | ");

    if (!r.some((x) => clean(x))) {
      stats.emptyRows++;
      continue;
    }

    let code = clean(cell(COL.code));
    const name = clean(cell(COL.name));
    const othersEmpty = r.every((x, n) => n === COL.code || !clean(x));

    // Рядок-заголовок розділу: нечисловий «код», усе інше порожнє
    if (code && !isNumericCode(code) && othersEmpty) {
      section = code;
      stats.sectionRows++;
      continue;
    }

    if (!name) {
      stats.skipped++;
      issues.push({ row: sheetRow, level: "error", message: "немає назви, рядок пропущено", raw: rawShort });
      continue;
    }

    if (!code) {
      stats.withoutCode++;
      code = `NC-${sheetRow}`;
      issues.push({
        row: sheetRow,
        level: "warning",
        message: `немає коду, присвоєно тимчасовий ${code}`,
        raw: rawShort,
      });
    } else if (seenCodes.has(code)) {
      stats.duplicateCodes++;
      const newCode = `${code}-D${sheetRow}`;
      issues.push({
        row: sheetRow,
        level: "warning",
        message: `дубль коду ${code}, присвоєно ${newCode}`,
        raw: rawShort,
      });
      code = newCode;
    }
    seenCodes.add(code);

    // Грошові поля
    const money = (idx: number, label: string): number | null => {
      const raw = cell(idx);
      const v = parseMoney(raw);
      if (v !== null && Number.isNaN(v)) {
        issues.push({ row: sheetRow, level: "warning", message: `не вдалось прочитати ${label}: "${clean(raw)}"` });
        return null;
      }
      return v;
    };
    const date = (idx: number, label: string): Date | null => {
      const v = parseDate(cell(idx));
      if (v === "bad") {
        issues.push({ row: sheetRow, level: "warning", message: `не вдалось прочитати дату (${label}): "${clean(cell(idx))}"` });
        return null;
      }
      return v;
    };

    // Категорія: Class -> розділ таблиці. Room зі словами "Video equipment" — це теж загальна категорія, а не місце.
    const cls = clean(cell(COL.cls));
    const room = clean(cell(COL.room));
    const roomIsCategory = /video equipment/i.test(room);
    const categoryName = cls || (roomIsCategory ? room : null) || (section ? clean(section) : null);
    if (categoryName) categories.add(categoryName);

    // Статус
    const st = clean(cell(COL.status));
    let status: ItemStatusDraft = "AVAILABLE";
    if (/^broken$/i.test(st)) status = "IN_REPAIR";
    else if (st && !/^ok$/i.test(st) && parseDate(st) === "bad") {
      issues.push({ row: sheetRow, level: "warning", message: `невідомий статус "${st}", взято "доступно"` });
    }

    items.push({
      sheetRow,
      code,
      name,
      serialNumber: nz(keepLines(cell(COL.serial))),
      spec: nz(clean(cell(COL.spec))),
      categoryName,
      locationNote: roomIsCategory ? null : nz(room),
      itemClass: nz(cls),
      license: nz(clean(cell(COL.license))),
      purchaseDate: date(COL.bought, "куплено"),
      invoiceNumber: nz(clean(cell(COL.invoice))),
      purchaseUsd: money(COL.costUsd, "вартість USD"),
      rentalPrice: money(COL.rent, "вартість оренди"),
      warrantyUntil: date(COL.warranty, "гарантія"),
      status,
      notes: nz(clean(cell(COL.altName))),
      sheetEditedAt: date(COL.edited, "дата редагування"),
    });
  }

  stats.imported = items.length;
  return { items, issues, stats: { ...stats, categories: [...categories].sort() } };
}
