import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { registerProjectRoutes } from "./projects.js";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const STATUSES = ["AVAILABLE", "RESERVED", "ISSUED", "IN_REPAIR", "WRITTEN_OFF", "LOST"];

app.get("/api/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

// ---------- Категорії ----------

app.get("/api/categories", async () =>
  prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  }),
);

app.patch("/api/categories/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const name = String((req.body as { name?: string })?.name ?? "").trim();
  if (!name) return reply.code(400).send({ error: "Назва не може бути порожньою" });
  try {
    return await prisma.category.update({ where: { id }, data: { name } });
  } catch {
    return reply.code(409).send({ error: "Категорія з такою назвою вже існує або не знайдена" });
  }
});

// Злиття: усі позиції з fromId переходять у toId, fromId видаляється
app.post("/api/categories/merge", async (req, reply) => {
  const { fromId, toId } = (req.body ?? {}) as { fromId?: string; toId?: string };
  if (!fromId || !toId || fromId === toId) {
    return reply.code(400).send({ error: "Вкажіть дві різні категорії" });
  }
  const [r] = await prisma.$transaction([
    prisma.item.updateMany({ where: { categoryId: fromId }, data: { categoryId: toId } }),
    prisma.category.delete({ where: { id: fromId } }),
  ]);
  const moved = r.count;
  return { moved };
});

// ---------- Позиції ----------

app.get("/api/items", async (req) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
  const where: Record<string, unknown> = {};
  const s = q.q?.trim();
  if (s) {
    where.OR = ["code", "name", "serialNumber", "spec", "notes"].map((f) => ({
      [f]: { contains: s, mode: "insensitive" },
    }));
  }
  if (q.categoryId) where.categoryId = q.categoryId === "none" ? null : q.categoryId;
  if (q.status && STATUSES.includes(q.status)) where.status = q.status;
  if (q.noCode === "1") where.code = { startsWith: "NC-" };

  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
});

app.get("/api/items/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const item = await prisma.item.findUnique({ where: { id }, include: { category: true } });
  return item ?? reply.code(404).send({ error: "Не знайдено" });
});

const TEXT_FIELDS = ["name", "serialNumber", "spec", "locationNote", "license", "invoiceNumber", "notes"];
const DECIMAL_FIELDS = ["purchaseUsd", "rentalPrice"];
const DATE_FIELDS = ["purchaseDate", "warrantyUntil"];

// Розбір і перевірка полів позиції (спільно для створення й редагування)
function parseItemFields(body: Record<string, unknown>): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = String(body[f] ?? "").trim();
      if (f === "name" && !v) return { error: "Назва обов'язкова" };
      data[f] = v === "" ? null : v;
    }
  }
  for (const f of DECIMAL_FIELDS) {
    if (f in body) {
      const raw = body[f];
      if (raw === null || raw === "") data[f] = null;
      else if (Number.isFinite(Number(raw)) && Number(raw) >= 0) data[f] = Number(raw);
      else return { error: `Некоректне число: ${f}` };
    }
  }
  for (const f of DATE_FIELDS) {
    if (f in body) {
      const raw = body[f];
      if (raw === null || raw === "") data[f] = null;
      else if (!Number.isNaN(Date.parse(String(raw)))) data[f] = new Date(String(raw));
      else return { error: `Некоректна дата: ${f}` };
    }
  }
  if ("status" in body) {
    if (!STATUSES.includes(String(body.status))) return { error: "Некоректний статус" };
    data.status = body.status;
  }
  if ("categoryId" in body) data.categoryId = body.categoryId || null;
  return { data };
}

// Наступний вільний код у категорії: максимальний числовий код + 1 (довгі коди >9 цифр ігноруємо)
app.get("/api/items/next-code", async (req) => {
  const { categoryId } = req.query as { categoryId?: string };
  if (!categoryId) return { code: null };
  const rows = await prisma.item.findMany({ where: { categoryId }, select: { code: true } });
  const nums = rows.map((r: { code: string }) => r.code).filter((c: string) => /^\d{1,9}$/.test(c)).map(Number);
  if (nums.length === 0) return { code: null };
  let candidate = Math.max(...nums) + 1;
  while (await prisma.item.findUnique({ where: { code: String(candidate) }, select: { id: true } })) candidate++;
  return { code: String(candidate) };
});

app.post("/api/items", async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? "").trim();
  if (!code) return reply.code(400).send({ error: "Код обов'язковий" });
  const parsed = parseItemFields({ ...body, name: body.name ?? "" });
  if ("error" in parsed) return reply.code(400).send({ error: parsed.error });
  try {
    return await prisma.item.create({
      data: { ...parsed.data, code } as never,
      include: { category: { select: { id: true, name: true } } },
    });
  } catch {
    return reply.code(409).send({ error: `Код ${code} уже існує` });
  }
});

// Код позиції через PATCH не змінюється (етикетки й QR прив'язані до нього)
app.patch("/api/items/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const parsed = parseItemFields((req.body ?? {}) as Record<string, unknown>);
  if ("error" in parsed) return reply.code(400).send({ error: parsed.error });
  try {
    return await prisma.item.update({
      where: { id },
      data: parsed.data as never,
      include: { category: { select: { id: true, name: true } } },
    });
  } catch {
    return reply.code(404).send({ error: "Позицію не знайдено" });
  }
});

registerProjectRoutes(app, prisma);

const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
