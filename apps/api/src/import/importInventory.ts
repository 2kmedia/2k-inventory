import { readFileSync, writeFileSync } from "node:fs";
import { parseInventoryCsv, type ParseResult } from "./parseInventory.js";

// Використання:
//   npm run import:inventory -w apps/api -- "шлях/до/файлу.csv"          (запис у БД)
//   npm run import:inventory -w apps/api -- "шлях/до/файлу.csv" --dry    (лише звіт, БД не чіпає)

function buildReport(res: ParseResult, dry: boolean): string {
  const { stats, issues } = res;
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const lines = [
    `Імпорт INVENTORY ${dry ? "(пробний запуск, без запису в БД)" : ""}`.trim(),
    ``,
    `Рядків у таблиці (без заголовка): ${stats.totalRows}`,
    `Порожніх рядків: ${stats.emptyRows}`,
    `Заголовків розділів: ${stats.sectionRows}`,
    `Позицій до імпорту: ${stats.imported}`,
    `Пропущено (помилки): ${stats.skipped}`,
    `Без коду (тимчасові NC-…): ${stats.withoutCode}`,
    `Дублів коду: ${stats.duplicateCodes}`,
    `Категорій: ${stats.categories.length}`,
    ``,
    `== Помилки (${errors.length}) ==`,
    ...errors.map((e) => `рядок ${e.row}: ${e.message}  [${e.raw ?? ""}]`),
    ``,
    `== Попередження (${warnings.length}) ==`,
    ...warnings.map((w) => `рядок ${w.row}: ${w.message}${w.raw ? `  [${w.raw}]` : ""}`),
    ``,
    `== Категорії ==`,
    ...stats.categories,
  ];
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error('Вкажіть шлях до CSV: npm run import:inventory -w apps/api -- "файл.csv" [--dry]');
    process.exit(1);
  }

  const res = parseInventoryCsv(readFileSync(path, "utf-8"));
  const report = buildReport(res, dry);
  writeFileSync("import-report.txt", report);

  if (dry) {
    console.log(report.split("\n").slice(0, 12).join("\n"));
    console.log("\nПовний звіт: import-report.txt");
    return;
  }

  // Prisma підключаємо лише тут, щоб пробний запуск працював без БД
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const catIds = new Map<string, string>();
    for (const name of res.stats.categories) {
      const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
      catIds.set(name, c.id);
    }

    for (const it of res.items) {
      const { categoryName, ...rest } = it;
      const data = { ...rest, categoryId: categoryName ? catIds.get(categoryName) ?? null : null };
      await prisma.item.upsert({ where: { code: it.code }, update: data, create: data });
    }

    const run = await prisma.importRun.create({
      data: {
        source: `CSV ${path}`,
        imported: res.items.length,
        skipped: res.stats.skipped,
        errors: {
          create: res.issues.map((i) => ({
            sheetRow: i.row,
            message: `${i.level === "error" ? "ПОМИЛКА" : "увага"}: ${i.message}`,
            rawData: i.raw ? { raw: i.raw } : undefined,
          })),
        },
      },
    });
    console.log(`Готово: імпортовано ${res.items.length}, пропущено ${res.stats.skipped}. ImportRun ${run.id}`);
    console.log("Повний звіт: import-report.txt");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
