# GrafoKnowledge

Constructor de grafo de conocimiento con IA: lee documentos markdown, extrae entidades y
relaciones tipadas con Claude, las resuelve contra un grafo Neo4j y permite preguntarle al
grafo en lenguaje natural con respuestas ancladas a fuentes.

**Fuente de verdad del diseño:** [SAD-grafoknowledge.md](SAD-grafoknowledge.md) (v1.1.0).
Detalle operativo: [plan-grafo-conocimiento-v2.md](plan-grafo-conocimiento-v2.md).
Método de trabajo: `../metodo/MANIFIESTO.md` (proporcionalidad, ADRs, DoD por fase).

## Stack

- **Backend:** Node 24 + TypeScript estricto, Fastify. Monorepo npm workspaces.
- **LLM:** Claude (`@anthropic-ai/sdk`) — extracción con tool use, adjudicación, redacción.
- **Embeddings:** Gemini (`@google/genai`) — modelo pineado en `.env` (`EMBEDDING_MODEL`).
- **Grafo:** Neo4j 5 (Docker Compose local), índice vectorial nativo sobre `:Alias`.
- **Validación:** Zod en un único punto tipado para TODA salida de LLM.
- **Frontend:** React + Vite + Tailwind (+ react-force-graph-3d en Fase 4).

## Comandos

```bash
npm install              # instala workspaces (backend + frontend)
npm run db:up            # levanta Neo4j (Docker) — Browser en http://localhost:8474
npm run db:init          # crea constraints + índice vectorial (idempotente)
npm run dev              # backend (:3001) + frontend (:5173) en paralelo
npm run typecheck        # tsc en ambos workspaces
npm run db:down          # apaga Neo4j
```

Requiere `.env` en la raíz (copiar de `.env.example`; las keys nunca al repo).

## Estado del roadmap (actualizado 2026-07-10)

- **Fase 0 — Fundación: HITO TÉCNICO LOGRADO Y VERIFICADO.**
  - `npm run dev` levanta backend (:3001) + frontend (:5173); Neo4j sano en Docker con
    `db:init` ejecutado (constraint `entity_id`, índices de hash, índice vectorial
    `alias_embedding` 768 dims/cosine). Verificado: `/health` → `{ok, domain: pkm}` y
    `/health/db` → `{ok}`. Typecheck y build en verde.
  - Repo público: https://github.com/faborubio/grafoknowledge (remote HTTPS, push al día).
  - **Ojo local:** el Browser de Neo4j va en **:8474**, no :7474 (rango excluido por
    Windows — ver TROUBLESHOOTING). No existe `.env` aún; los defaults de `config.ts`
    coinciden con docker-compose, por eso todo funciona sin él.
  - Gates: **G-1** 🟡 resuelto con reserva (confirmar índice vectorial en Aura Free recién
    al desplegar, Fase 5). **G-2** ⬜ bloqueado por el autor: poner API keys en `.env` y
    correr `npm run gate:cost` (el script ya funciona). **G-3** ⬜ spike 3D — no bloquea
    hasta Fase 4. **G-4** ⬜ elegir corpus de demo sin datos sensibles — bloquea solo el
    deploy público.
  - **Para cerrar la fase formalmente falta el DoD** (§4 del método): G-2 + ronda crítica
    final. No hay deuda registrada aún (AUDIT vacío es correcto a esta altura).
- **SIGUIENTE: Fase 1 — pipeline de extracción.** Plan detallado en
  [plan-grafo-conocimiento-v2.md](plan-grafo-conocimiento-v2.md) (Fase 1): loader markdown +
  chunking estructural con overlap 10-15% → extracción con Claude tool use (usar
  `buildExtractionSchema` de `src/extract/schemas.ts`, ya existe) → verificación de
  provenance en código (ADR-003) → dedup de tripletas entre chunks solapados → escritura
  ingenua a Neo4j (sin resolución todavía) → hash por chunk desde el día 1 (ADR-009).
  Hito: aparece un grafo desde notas reales (probar con `backend/fixtures/sample-note.md`).
- Luego: Fase 2 (resolución) → Fase 3 (Q&A) → Fase 4 (viz) → Fase 5 (evals+deploy) →
  Fase 6 (v2, solo con tracción).

## Qué existe ya en el código (no reinventar)

- `src/schema/domain.ts` + `pkm.ts` — dominio como config (ADR-008), 5 tipos de entidad,
  6 de relación.
- `src/extract/schemas.ts` — el punto Zod único de validación de extracción.
- `src/graph/client.ts` — driver singleton; `readSession()` (para /query) vs `writeSession()`.
- `scripts/init-db.ts` — índices idempotentes; correr tras cualquier reset de la base.
- `src/evals/cost-gate.ts` — gate G-2; también sirve de referencia de cómo llamar a Claude
  con tool use + prompt de extracción construido desde el dominio.
- `frontend/src/index.css` — design tokens de la constelación (un acento por tipo de entidad).

## Reglas del proyecto (del método)

1. El SAD cambia solo por ADR o enmienda versionada — nunca ediciones silenciosas.
2. Todo trade-off aceptado → `docs/AUDIT.md` (`AUD-NNN`).
3. Antes de tocar umbrales/heurísticas (p. ej. 0.95/0.75 del embudo) → caso real en
   `docs/CASES.md`. Evidencia, no intuición.
4. Toda salida de LLM pasa por Zod. Toda relación lleva provenance verificada en código.
5. Sesiones de consulta a Neo4j: siempre `defaultAccessMode: READ`.
6. Cierre de fase = DoD del método (ronda crítica → CASES → AUDIT → TROUBLESHOOTING →
   este archivo + README → verde → commit+push).
