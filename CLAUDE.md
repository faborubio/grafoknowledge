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

## Estado del roadmap

- **Fase 0 — Fundación: EN CURSO.** Scaffold + Neo4j + esquema PKM listos.
  - Gates: G-1 ✅ (con reserva: verificar índice vectorial en Aura Free al desplegar, Fase 5;
    dev local usa Docker). G-2 ⬜ pendiente de API keys (script en `backend/src/evals/`).
    G-3 ⬜ spike 3D pendiente. G-4 ⬜ elegir corpus de demo sin datos sensibles.
- Fase 1 (pipeline extracción) → Fase 2 (resolución) → Fase 3 (Q&A) → Fase 4 (viz) →
  Fase 5 (evals+deploy) → Fase 6 (v2, solo con tracción).

## Reglas del proyecto (del método)

1. El SAD cambia solo por ADR o enmienda versionada — nunca ediciones silenciosas.
2. Todo trade-off aceptado → `docs/AUDIT.md` (`AUD-NNN`).
3. Antes de tocar umbrales/heurísticas (p. ej. 0.95/0.75 del embudo) → caso real en
   `docs/CASES.md`. Evidencia, no intuición.
4. Toda salida de LLM pasa por Zod. Toda relación lleva provenance verificada en código.
5. Sesiones de consulta a Neo4j: siempre `defaultAccessMode: READ`.
6. Cierre de fase = DoD del método (ronda crítica → CASES → AUDIT → TROUBLESHOOTING →
   este archivo + README → verde → commit+push).
