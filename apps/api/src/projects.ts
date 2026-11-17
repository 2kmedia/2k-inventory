import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const PROJECT_STATUSES = ["DRAFT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
// Проєкти з цими статусами займають обладнання на свої дати
const BLOCKING = ["DRAFT", "CONFIRMED", "IN_PROGRESS"];
const NOT_RENTABLE = ["WRITTEN_OFF", "LOST", "IN_REPAIR"];
const DAY = 86400000;

const parseDay = (v: unknown): Date | null => {
  const t = Date.parse(String(v ?? ""));
  return Number.isNaN(t) ? null : new Date(t);
};
// Дні вважаються включно: з 20-го по 20-те = 1 доба
const daysBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY) + 1);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(p: any) {
  const days = daysBetween(p.startsAt, p.endsAt);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (p.bookings ?? []).flatMap((b: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.lines.map((l: any) => {
      const unitPrice = Number(l.unitPrice);
      const discount = Number(l.discount);
      return {
        id: l.id,
        itemId: l.itemId,
        code: l.item?.code ?? "",
        name: l.item?.name ?? "",
        serialNumber: l.item?.serialNumber ?? null,
        itemStatus: l.item?.status ?? null,
        unitPrice,
        discount,
        amount: Math.round(unitPrice * days * (1 - discount / 100) * 100) / 100,
      };
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = Math.round(lines.reduce((s: number, l: any) => s + l.amount, 0) * 100) / 100;
  return {
    id: p.id,
    number: p.number,
    name: p.name,
    status: p.status,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    location: p.location,
    notes: p.notes,
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    days,
    lines,
    total,
  };
}

const projectInclude = {
  client: true,
  bookings: { include: { lines: { include: { item: true }, orderBy: { id: "asc" as const } } } },
};

export function registerProjectRoutes(app: FastifyInstance, prisma: PrismaClient) {
  async function findConflicts(itemIds: string[], start: Date, end: Date, excludeProjectId: string) {
    if (itemIds.length === 0) return [];
    return prisma.bookingLine.findMany({
      where: {
        itemId: { in: itemIds },
        booking: {
          project: {
            id: { not: excludeProjectId },
            status: { in: BLOCKING as never },
            startsAt: { lte: end },
            endsAt: { gte: start },
          },
        },
      },
      include: {
        booking: { include: { project: { select: { id: true, number: true, name: true, startsAt: true, endsAt: true } } } },
      },
    });
  }

  const loadProject = (id: string) => prisma.project.findUnique({ where: { id }, include: projectInclude });

  // ---------- Контрагенти ----------

  app.get("/api/clients", async () =>
    prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } }),
  );

  app.post("/api/clients", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "Назва контрагента обов'язкова" });
    const opt = (k: string) => {
      const v = String(b[k] ?? "").trim();
      return v === "" ? null : v;
    };
    return prisma.client.create({
      data: { name, type: opt("type"), contact: opt("contact"), phone: opt("phone"), email: opt("email"), notes: opt("notes") },
    });
  });

  // ---------- Проєкти ----------

  app.get("/api/projects", async () => {
    const list = await prisma.project.findMany({ orderBy: { startsAt: "desc" }, include: projectInclude });
    return list.map(shape);
  });

  app.post("/api/projects", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? "").trim();
    const startsAt = parseDay(b.startsAt);
    const endsAt = parseDay(b.endsAt);
    if (!name) return reply.code(400).send({ error: "Назва проєкту обов'язкова" });
    if (!startsAt || !endsAt || endsAt < startsAt) return reply.code(400).send({ error: "Вкажіть коректні дати (кінець не раніше початку)" });

    let clientId = b.clientId ? String(b.clientId) : null;
    const newClient = String(b.newClientName ?? "").trim();
    if (!clientId && newClient) {
      clientId = (await prisma.client.create({ data: { name: newClient } })).id;
    }

    const year = startsAt.getUTCFullYear();
    let n = (await prisma.project.count({ where: { number: { startsWith: `P-${year}-` } } })) + 1;
    while (await prisma.project.findUnique({ where: { number: `P-${year}-${String(n).padStart(3, "0")}` }, select: { id: true } })) n++;
    const number = `P-${year}-${String(n).padStart(3, "0")}`;

    const created = await prisma.project.create({
      data: {
        number,
        name,
        clientId,
        startsAt,
        endsAt,
        location: String(b.location ?? "").trim() || null,
        notes: String(b.notes ?? "").trim() || null,
      },
    });
    return shape(await loadProject(created.id));
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await loadProject(id);
    return p ? shape(p) : reply.code(404).send({ error: "Проєкт не знайдено" });
  });

  app.patch("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, unknown>;
    const current = await loadProject(id);
    if (!current) return reply.code(404).send({ error: "Проєкт не знайдено" });
    const data: Record<string, unknown> = {};

    if ("name" in b) {
      const v = String(b.name ?? "").trim();
      if (!v) return reply.code(400).send({ error: "Назва обов'язкова" });
      data.name = v;
    }
    if ("clientId" in b) data.clientId = b.clientId ? String(b.clientId) : null;
    if ("location" in b) data.location = String(b.location ?? "").trim() || null;
    if ("notes" in b) data.notes = String(b.notes ?? "").trim() || null;
    if ("status" in b) {
      if (!PROJECT_STATUSES.includes(String(b.status))) return reply.code(400).send({ error: "Некоректний статус" });
      data.status = b.status;
    }
    if ("startsAt" in b || "endsAt" in b) {
      const s = parseDay(b.startsAt ?? current.startsAt);
      const e = parseDay(b.endsAt ?? current.endsAt);
      if (!s || !e || e < s) return reply.code(400).send({ error: "Некоректні дати" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemIds = current.bookings.flatMap((bk: any) => bk.lines.map((l: any) => l.itemId).filter(Boolean)) as string[];
      const conflicts = await findConflicts(itemIds, s, e, id);
      if (conflicts.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = conflicts[0];
        const pr = c.booking.project;
        return reply.code(409).send({
          error: `Нові дати перетинаються з проєктом ${pr.number} «${pr.name}» (${fmt(pr.startsAt)} — ${fmt(pr.endsAt)})`,
        });
      }
      data.startsAt = s;
      data.endsAt = e;
    }

    await prisma.project.update({ where: { id }, data: data as never });
    if (data.startsAt) {
      await prisma.booking.updateMany({ where: { projectId: id }, data: { startsAt: data.startsAt as Date, endsAt: data.endsAt as Date } });
    }
    return shape(await loadProject(id));
  });

  // ---------- Обладнання в проєкті ----------

  // Пошук обладнання для додавання: з позначкою, чим зайнято на ці дати
  app.get("/api/projects/:id/available", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { q } = req.query as { q?: string };
    const p = await loadProject(id);
    if (!p) return reply.code(404).send({ error: "Проєкт не знайдено" });
    const s = q?.trim();
    if (!s) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inProject = new Set<string>(p.bookings.flatMap((bk: any) => bk.lines.map((l: any) => l.itemId)));
    const items = await prisma.item.findMany({
      where: {
        status: { notIn: ["WRITTEN_OFF", "LOST"] as never },
        OR: ["code", "name", "serialNumber", "spec"].map((f) => ({ [f]: { contains: s, mode: "insensitive" } })),
      },
      orderBy: { code: "asc" },
      take: 40,
    });
    const candidates = items.filter((i: { id: string }) => !inProject.has(i.id));
    const conflicts = await findConflicts(candidates.map((i: { id: string }) => i.id), p.startsAt, p.endsAt, id);
    const busy = new Map<string, string>();
    for (const c of conflicts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pr = (c as any).booking.project;
      busy.set(c.itemId as string, `${pr.number} «${pr.name}» (${fmt(pr.startsAt)} — ${fmt(pr.endsAt)})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return candidates.map((i: any) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      serialNumber: i.serialNumber,
      rentalPrice: i.rentalPrice === null ? null : Number(i.rentalPrice),
      status: i.status,
      busyWith: busy.get(i.id) ?? (i.status === "IN_REPAIR" ? "У ремонті" : null),
    }));
  });

  app.post("/api/projects/:id/lines", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { itemId } = (req.body ?? {}) as { itemId?: string };
    const p = await loadProject(id);
    if (!p) return reply.code(404).send({ error: "Проєкт не знайдено" });
    if (p.status === "CANCELLED" || p.status === "COMPLETED") {
      return reply.code(409).send({ error: "Проєкт закрито, додавати обладнання не можна" });
    }
    const item = itemId ? await prisma.item.findUnique({ where: { id: itemId } }) : null;
    if (!item) return reply.code(404).send({ error: "Позицію не знайдено" });
    if (NOT_RENTABLE.includes(item.status)) return reply.code(409).send({ error: "Ця позиція недоступна для оренди (ремонт/списано/втрачено)" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (p.bookings.some((bk: any) => bk.lines.some((l: any) => l.itemId === item.id))) {
      return reply.code(409).send({ error: "Позиція вже є в цьому проєкті" });
    }
    const conflicts = await findConflicts([item.id], p.startsAt, p.endsAt, id);
    if (conflicts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pr = (conflicts[0] as any).booking.project;
      return reply.code(409).send({ error: `Уже зайнято в проєкті ${pr.number} «${pr.name}» (${fmt(pr.startsAt)} — ${fmt(pr.endsAt)})` });
    }

    let bookingId: string | undefined = p.bookings[0]?.id;
    if (!bookingId) {
      bookingId = (await prisma.booking.create({ data: { projectId: id, startsAt: p.startsAt, endsAt: p.endsAt } })).id;
    }
    await prisma.bookingLine.create({
      data: { bookingId, itemId: item.id, unitPrice: item.rentalPrice === null ? 0 : Number(item.rentalPrice) },
    });
    return shape(await loadProject(id));
  });

  app.patch("/api/projects/:id/lines/:lineId", async (req, reply) => {
    const { id, lineId } = req.params as { id: string; lineId: string };
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("unitPrice" in b) {
      const v = Number(b.unitPrice);
      if (!Number.isFinite(v) || v < 0) return reply.code(400).send({ error: "Некоректна ціна" });
      data.unitPrice = v;
    }
    if ("discount" in b) {
      const v = Number(b.discount);
      if (!Number.isFinite(v) || v < 0 || v > 100) return reply.code(400).send({ error: "Знижка 0–100%" });
      data.discount = v;
    }
    try {
      await prisma.bookingLine.update({ where: { id: lineId }, data: data as never });
    } catch {
      return reply.code(404).send({ error: "Рядок не знайдено" });
    }
    return shape(await loadProject(id));
  });

  app.delete("/api/projects/:id/lines/:lineId", async (req, reply) => {
    const { id, lineId } = req.params as { id: string; lineId: string };
    const line = await prisma.bookingLine.findUnique({ where: { id: lineId }, include: { item: true } });
    if (!line) return reply.code(404).send({ error: "Рядок не знайдено" });
    if (line.item?.status === "ISSUED") return reply.code(409).send({ error: "Позицію видано, спершу поверніть її" });
    await prisma.bookingLine.delete({ where: { id: lineId } });
    return shape(await loadProject(id));
  });

  // ---------- Видача / повернення (поки кнопками; зі сканера буде на кроці 6) ----------

  app.post("/api/projects/:id/issue", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await loadProject(id);
    if (!p) return reply.code(404).send({ error: "Проєкт не знайдено" });
    if (p.status === "CANCELLED" || p.status === "COMPLETED") return reply.code(409).send({ error: "Проєкт закрито" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = p.bookings.flatMap((bk: any) => bk.lines.map((l: any) => l.item)).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuable = items.filter((i: any) => i.status === "AVAILABLE" || i.status === "RESERVED");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skipped = items.filter((i: any) => !(i.status === "AVAILABLE" || i.status === "RESERVED") && i.status !== "ISSUED").length;
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...issuable.map((i: any) => prisma.item.update({ where: { id: i.id }, data: { status: "ISSUED" } })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...issuable.map((i: any) => prisma.movement.create({ data: { type: "ISSUE", itemId: i.id, projectId: id } })),
      prisma.project.update({ where: { id }, data: { status: "IN_PROGRESS" } }),
    ]);
    return { issued: issuable.length, skipped, project: shape(await loadProject(id)) };
  });

  app.post("/api/projects/:id/return", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await loadProject(id);
    if (!p) return reply.code(404).send({ error: "Проєкт не знайдено" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = p.bookings.flatMap((bk: any) => bk.lines.map((l: any) => l.item)).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issued = items.filter((i: any) => i.status === "ISSUED");
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...issued.map((i: any) => prisma.item.update({ where: { id: i.id }, data: { status: "AVAILABLE" } })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...issued.map((i: any) => prisma.movement.create({ data: { type: "RETURN", itemId: i.id, projectId: id } })),
      prisma.project.update({ where: { id }, data: { status: "COMPLETED" } }),
    ]);
    return { returned: issued.length, project: shape(await loadProject(id)) };
  });
}
