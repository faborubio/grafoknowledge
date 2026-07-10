import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config.js";
import { verifyConnectivity } from "./graph/client.js";
import { pkmDomain } from "./schema/pkm.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: ["http://localhost:5173"] });

app.get("/health", async () => ({
  status: "ok",
  domain: pkmDomain.id,
  uptime: process.uptime(),
}));

app.get("/health/db", async (_req, reply) => {
  try {
    await verifyConnectivity();
    return { status: "ok", neo4j: env.NEO4J_URI };
  } catch (err) {
    reply.status(503);
    return {
      status: "unavailable",
      hint: "¿Está Neo4j arriba? Corre `npm run db:up` en la raíz.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

await app.listen({ port: env.PORT });
