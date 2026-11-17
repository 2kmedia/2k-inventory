import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/api/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

app.get("/api/items", async () =>
  prisma.item.findMany({ take: 100, orderBy: { code: "asc" } }),
);

const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
