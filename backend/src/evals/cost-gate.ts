import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireKey } from "../config.js";
import { buildExtractionSchema } from "../extract/schemas.js";
import { pkmDomain } from "../schema/pkm.js";
import type { DomainSchema } from "../schema/domain.js";

/**
 * Gate G-2 (SAD §2): mide el costo real de extracción por documento ANTES de
 * construir el pipeline. Uso:
 *
 *   npm run gate:cost [-w backend] [-- ruta/a/nota.md]
 *
 * Reporta tokens de entrada/salida y, si PRICE_IN_MTOK / PRICE_OUT_MTOK están
 * definidos (USD por millón de tokens del modelo elegido), el costo estimado.
 */

const EXTRACTION_MODEL = process.env["EXTRACTION_MODEL"] ?? "claude-sonnet-5";

function extractionTool(domain: DomainSchema) {
  const entityTypes = domain.entityTypes.map((t) => t.name);
  const relationTypes = domain.relationTypes.map((t) => t.name);
  return {
    name: "registrar_extraccion",
    description: "Registra entidades y relaciones extraídas del texto.",
    input_schema: {
      type: "object" as const,
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              surface: { type: "string", description: "Forma EXACTA en el texto" },
              type: { type: "string", enum: entityTypes },
            },
            required: ["surface", "type"],
          },
        },
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              type: { type: "string", enum: relationTypes },
              target: { type: "string" },
              provenance: {
                type: "string",
                description: "Cita TEXTUAL exacta del fragmento que sostiene la relación",
              },
            },
            required: ["source", "type", "target", "provenance"],
          },
        },
      },
      required: ["entities", "relations"],
    },
  };
}

function buildPrompt(domain: DomainSchema, text: string): string {
  const entityDefs = domain.entityTypes
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  const relationDefs = domain.relationTypes
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  return [
    domain.promptContext,
    "\nTipos de entidad:\n" + entityDefs,
    "\nTipos de relación:\n" + relationDefs,
    "\nReglas: extrae SOLO lo que el texto afirma explícitamente. Cada relación",
    "debe llevar en `provenance` la cita textual exacta que la sostiene — si no",
    "puedes citarla, no la extraigas.",
    "\n--- TEXTO ---\n" + text,
  ].join("\n");
}

const defaultNote = fileURLToPath(new URL("../../fixtures/sample-note.md", import.meta.url));
const notePath = process.argv[2] ?? defaultNote;
const text = readFileSync(notePath, "utf-8");

const client = new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") });
const tool = extractionTool(pkmDomain);

console.log(`Modelo: ${EXTRACTION_MODEL} · Documento: ${notePath} (${text.length} chars)\n`);

const response = await client.messages.create({
  model: EXTRACTION_MODEL,
  max_tokens: 4096,
  tools: [tool],
  tool_choice: { type: "tool", name: tool.name },
  messages: [{ role: "user", content: buildPrompt(pkmDomain, text) }],
});

const toolUse = response.content.find((b) => b.type === "tool_use");
if (!toolUse || toolUse.type !== "tool_use") {
  throw new Error("El modelo no devolvió tool_use — revisar prompt/modelo.");
}

// El punto Zod único (ADR-003) también se ejercita en el gate
const parsed = buildExtractionSchema(pkmDomain).parse(toolUse.input);

console.log(`Entidades: ${parsed.entities.length} · Relaciones: ${parsed.relations.length}`);
console.log(`Tokens — entrada: ${response.usage.input_tokens}, salida: ${response.usage.output_tokens}`);

const priceIn = Number(process.env["PRICE_IN_MTOK"] ?? 0);
const priceOut = Number(process.env["PRICE_OUT_MTOK"] ?? 0);
if (priceIn && priceOut) {
  const cost =
    (response.usage.input_tokens / 1e6) * priceIn +
    (response.usage.output_tokens / 1e6) * priceOut;
  console.log(`Costo estimado del documento: $${cost.toFixed(4)} USD`);
} else {
  console.log(
    "Define PRICE_IN_MTOK y PRICE_OUT_MTOK (USD/MTok del modelo, ver pricing vigente) para el costo.",
  );
}
console.log("\nRegistrar el resultado en el estado del gate G-2 (SAD §2).");
