import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// El .env vive en la raíz del monorepo, no en /backend
loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const EnvSchema = z.object({
  // Keys opcionales en Fase 0: el server debe levantar sin ellas (hito Fase 0);
  // los módulos que las necesiten fallan explícitamente al usarse.
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Modelo de embeddings PINEADO — cambiarlo invalida el índice vectorial (riesgo del SAD)
  EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),

  NEO4J_URI: z.string().default("bolt://localhost:7687"),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().default("grafoknowledge-dev"),

  PORT: z.coerce.number().int().default(3001),
});

export const env = EnvSchema.parse(process.env);

export function requireKey(name: "ANTHROPIC_API_KEY" | "GEMINI_API_KEY"): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} no está configurada — copia .env.example a .env y complétala.`);
  }
  return value;
}
