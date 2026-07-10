# SAD — grafoknowledge

> Software Architecture Document del constructor de grafo de conocimiento con IA.
> **Fuente de verdad** del diseño y su porqué. Cambia solo por ADR nuevo o enmienda
> versionada (regla 1 del [método](../metodo/MANIFIESTO.md)). Detalle operativo paso a paso
> en [plan-grafo-conocimiento-v2.md](plan-grafo-conocimiento-v2.md).

**Versión 1.1.0 · 2026-07-10 · faborubio**

---

## 1. Contexto y objetivos

### El problema
Las notas personales (PKM, markdown) acumulan conocimiento pero las conexiones entre ideas
son trabajo manual (enlazar notas al estilo Obsidian) o directamente no existen. El
conocimiento conectado — "¿qué une X con Y?", "¿qué depende de Z?" — queda enterrado.

### La solución
Un pipeline que lee documentos, extrae entidades y relaciones **tipadas** automáticamente con
un LLM, las almacena en un grafo consultable, y permite preguntarle al grafo en lenguaje
natural con respuestas ancladas a la fuente.

**Pitch:** "¿Conoces el grafo de Obsidian? Imagínalo, pero donde las conexiones se construyen
solas leyendo tus documentos, tienen significado, y puedes hacerle preguntas."

### Objetivos
1. **Portafolio senior:** demostrar ingeniería real — resolución de entidades, anti-alucinación
   por provenance, arquitectura de consulta segura — no un wrapper sobre una API.
2. **v1 completa:** ingesta → extracción → resolución → grafo → Q&A NL → visualización.
3. **Genericidad demostrable:** esquemas de dominio como configuración; un 2º dominio en v2
   debe entrar por config, no por código nuevo.

### No-objetivos (v1)
- Multi-usuario, auth, o SaaS: es una herramienta de un usuario (proporcionalidad, §1 del método).
- Ingesta a escala con colas (BullMQ/Redis) — reservado para v2 "solo con tracción".
- Edición manual del grafo desde la UI.

---

## 2. Gates (antes de construir)

Verificaciones que condicionan la arquitectura. **Se ejecutan en Fase 0, antes de escribir
código de producto.** Si un gate falla, se enmienda el ADR afectado — no se construye sobre arena.

| Gate | Verifica | Condiciona | Estado |
|---|---|---|---|
| **G-1** | Neo4j Aura Free soporta índice vectorial (5.x) y sus límites (nodos/relaciones/tamaño) alcanzan para la demo | ADR-002; si falla → Neo4j Community en Docker + hosting propio, o store vectorial aparte | 🟡 Resuelto con reserva (2026-07-10): Aura Free = 200k nodos / 400k relaciones — sobra para la demo. Índice vectorial es estándar de Neo4j 5.x+; dev local usa Docker (soporte completo). Confirmar índice vectorial en el tier Free al desplegar (Fase 5); el fallback de ADR-002 sigue vigente. |
| **G-2** | Costo real de extracción con Claude por documento típico (medir con 3-5 notas reales) y cuota/costo de embeddings Gemini | ADR-003/004; presupuesto del proyecto; elección de modelo para extracción masiva | ⬜ Pendiente de API keys. Script listo: `npm run gate:cost -w backend` (mide tokens/costo por doc contra el esquema PKM real). |
| **G-3** | `react-force-graph-3d` + bloom (`UnrealBloomPass`) corre fluido con ~150 nodos en el hardware objetivo de la demo (spike de 1 hora) | ADR-007; si falla → versión 2D o sin postprocesado | ⬜ Pendiente (spike antes de Fase 4; no bloquea Fases 1-3) |
| **G-4** | Los documentos a ingerir en la demo pública no contienen datos personales/sensibles de terceros | Selección del corpus de demo; qué se publica | ⬜ Pendiente (decisión del autor al elegir corpus; bloquea solo el deploy público) |

---

## 3. Drivers de calidad

En orden de prioridad — los conflictos se resuelven a favor del de arriba:

1. **Fidelidad (anti-alucinación):** ninguna relación sin fragmento de origen (provenance).
   Un grafo que miente es peor que no tener grafo.
2. **Unicidad de entidades:** "Apple"/"AAPL"/"Apple Inc" = un nodo. Sin esto el grafo es una
   bola de duplicados y el proyecto fracasa (el "muro inesquivable").
3. **Seguridad de consulta:** el LLM jamás obtiene capacidad de escritura sobre el grafo.
4. **Costo acotado de LLM:** las llamadas caras (adjudicación) deben ser una fracción minoritaria,
   medible y logueada.
5. **Legibilidad de la demo:** la visualización debe contar una historia, no impresionar con una
   nube ilegible.
6. **Genericidad:** el motor no conoce el dominio; el dominio es config.

---

## 4. Decisiones de arquitectura (ADRs)

### ADR-001 — Node.js + TypeScript (no Python)
- **Contexto:** el ecosistema "grafo + LLM" tiene más ejemplos en Python; el portafolio del
  autor es JS/TS.
- **Decisión:** backend Node.js + TypeScript con Fastify. El workload es I/O-bound
  (orquestación de llamadas a LLM y DB), terreno fuerte de Node; el tipado estático elimina
  una clase entera de bugs; cohesión con el resto del portafolio.
- **Sacrifica:** el ecosistema Python de NLP/grafos (spaCy, NetworkX, LangChain maduro). Si
  llega ML pesado (GNNs), se aísla en un microservicio Python (nota en Fase 6) — no se migra
  el core.

### ADR-002 — Neo4j con índice vectorial nativo (no graph DB + vector store aparte)
- **Contexto:** la resolución de entidades necesita búsqueda por similitud de embeddings;
  la opción común es operar un vector store dedicado (Pinecone, Qdrant) junto a la graph DB.
- **Decisión:** Neo4j 5.x como único store: grafo + índice vectorial nativo para los
  embeddings de entidades. Cypher, visualización integrada (Neo4j Browser), Docker Compose
  local y Aura free tier (sujeto a G-1).
- **Sacrifica:** las features avanzadas de un vector store dedicado (filtrado híbrido rico,
  escala masiva). A la escala de este proyecto no se necesitan, y operar un solo store es
  menos superficie de fallo.

### ADR-003 — Extracción con Claude vía tool use + validación Zod + provenance obligatoria
- **Contexto:** los LLM alucinan relaciones y devuelven JSON malformado si se les pide texto libre.
- **Decisión:** extracción por chunk con Claude usando tool use (salida estructurada forzada
  al esquema), validada por Zod en un único punto tipado. Toda entidad/relación lleva su
  fragmento de origen; **lo no anclado a texto fuente se rechaza**. El anclaje se verifica
  **en código, no por confianza**: el fragmento devuelto debe encontrarse en el chunk (match
  exacto o fuzzy sobre texto normalizado) — un LLM puede alucinar también la cita. Embeddings
  con Gemini (SDK `@google/genai`, ya disponible para el autor).
- **Sacrifica:** algo de recall — relaciones válidas pero difíciles de anclar se pierden, y
  las expresadas por correferencia entre chunks ("él fundó la empresa…") no se capturan
  (limitación aceptada; se mitiga parcialmente inyectando título + ruta de encabezados al
  prompt de extracción). Se acepta: el driver 1 (fidelidad) manda sobre exhaustividad.

### ADR-004 — Embudo de resolución de entidades en 4 etapas
- **Contexto:** resolver duplicados con LLM en cada par es O(N²) y carísimo; no resolverlos
  destruye el grafo (driver 2).
- **Decisión:** embudo ordenado de lo más barato a lo más caro:
  1. Match exacto/normalizado (lowercase, sin tildes, sin sufijos legales) — gratis.
  2. Búsqueda vectorial (Gemini + índice nativo de Neo4j) → top-K candidatos, ~O(log N).
  3. Jaro-Winkler sobre los K candidatos — barato en Node.
  4. Adjudicación por LLM **solo en zona gris**: Jaro-Winkler ≥ ~0.95 merge automático,
     ≤ ~0.75 entidad nueva, entre medio decide Claude con contexto.
  **Guardas del auto-merge** (Jaro-Winkler premia prefijos comunes — "Juan Pérez"/"Juana
  Pérez" supera 0.95): (a) nunca auto-merge entre tipos de entidad distintos; (b) nombres
  cortos (≤ 4 caracteres) y acrónimos jamás se auto-fusionan — van siempre a adjudicación
  LLM; (c) la etapa de resolución se **serializa por nombre normalizado** dentro de un batch
  — dos chunks procesados en paralelo no pueden crear la misma entidad "nueva" dos veces.
  Entidad canónica con alias; MERGE en Neo4j por ID canónico. Cada fusión registra qué etapa
  del embudo la decidió y con qué evidencia (merges auditables). Se loguea el conteo por
  etapa para verificar que las adjudicaciones LLM son minoría (driver 4).
- **Sacrifica:** los umbrales 0.95/0.75 son heurísticos y necesitarán calibración con datos
  reales (cada recalibración exige su caso en `CASES.md`, regla 3 del método — el mini
  dataset dorado de Fase 2 existe para esto). Deshacer un merge incorrecto es costoso incluso
  con auditoría: las relaciones ya quedaron fusionadas.

### ADR-005 — Consulta en dos rutas; el LLM nunca escribe Cypher libre
- **Contexto:** NL→Cypher generado por LLM es frágil (queries inválidas) e inseguro (escrituras,
  inyección); las guardas por regex contra DROP/DELETE son defensa de papel.
- **Decisión:** arquitectura de dos rutas + router:
  - **Ruta 1 (por defecto), GraphRAG:** el LLM extrae entidades semilla de la pregunta →
    localización por vector/string → **código determinista** extrae el subgrafo a 1-2 saltos →
    el subgrafo se inyecta al prompt y Claude redacta la respuesta con citas a provenance.
  - **Ruta 2, plantillas Cypher parametrizadas** para preguntas estructurales (camino entre
    A y B, conteos por tipo, vecinos a N saltos): el LLM clasifica y rellena parámetros de
    plantillas predefinidas.
  - **Seguridad a nivel de protocolo:** toda sesión de consulta se abre con
    `defaultAccessMode: READ` — el driver de Neo4j rechaza cualquier escritura. Los valores
    de plantilla se pasan como **parámetros del driver, jamás interpolados** en el string
    Cypher. Regex solo como defensa secundaria.
  - **Invariante de honestidad:** si las entidades semilla no se encuentran en el grafo o el
    subgrafo resultante es vacío, la respuesta es "no hay evidencia en el grafo" — **nunca**
    se responde desde el conocimiento paramétrico del modelo.
  - **Presupuesto de contexto:** el subgrafo se poda a un presupuesto de tokens antes de
    inyectarse (nodos de grado alto truncados, relaciones rankeadas por relevancia a la
    pregunta) — una ego-network de un hub puede tener cientos de aristas.
- **Sacrifica:** flexibilidad — preguntas estructurales fuera del catálogo de plantillas no
  se responden por Ruta 2 (caen a GraphRAG o se declaran no soportadas), y la poda del
  subgrafo puede omitir contexto relevante en nodos muy conectados. Es el precio del
  driver 3 y del driver 1.

### ADR-006 — Chunking estructural con overlap 10-15% + dedup de tripletas
- **Contexto:** cortar por tamaño fijo parte relaciones en la frontera ("Apple fue fundada
  por…" / "…Steve Jobs en 1976") y las pierde.
- **Decisión:** chunking que respeta encabezados/estructura del markdown, con solapamiento
  de ~10-15% entre chunks. La misma tripleta (origen, tipo, destino) extraída de dos ventanas
  adyacentes se fusiona en el MERGE conservando ambas provenances como evidencia doble.
- **Sacrifica:** ~10-15% de tokens extra en extracción (costo, driver 4) y la necesidad del
  paso de dedup. Aceptado: perder relaciones de frontera viola el driver 1.

### ADR-007 — Visualización por revelación progresiva ("constelación de conocimiento")
- **Contexto:** renderizar el grafo completo produce la clásica "bola de pelos" ilegible, y
  react-force-graph se degrada sobre ~300 nodos / 1000 aristas.
- **Decisión:** la pantalla inicial es una búsqueda; al buscar se renderiza solo la
  **ego-network** del concepto (nodo + conexiones directas); doble click expande vecinos.
  **Límite duro ~150 nodos** renderizados y colapso de nodos de grado alto — es un límite de
  diseño, no una optimización. Dirección visual propia: `react-force-graph-3d`, materiales
  emisivos por tipo de entidad, bloom (`UnrealBloomPass`), partículas en aristas; landing con
  scroll narrativo (GSAP/Framer Motion); fuentes OFL e iconos MIT — cero assets o código de
  sitios ajenos. (Sujeto a G-3.)
- **Sacrifica:** el "wow" de la nube gigante al abrir, y no hay vista global del grafo completo
  en v1. La revelación progresiva ES la narrativa de la demo.

### ADR-008 — Esquemas de dominio como configuración intercambiable
- **Contexto:** un extractor con el dominio hardcodeado no demuestra ingeniería genérica.
- **Decisión:** los tipos de entidad y relación viven en `/schema` como config tipada
  (Zod). Dominio primario v1: PKM/notas personales (Concepto, Persona, Proyecto, Fuente;
  relacionado_con, prerequisito_de, mencionado_en…). El motor (ingest/extract/resolve/graph/query)
  no conoce el dominio. Prueba de fuego: el 2º dominio (v2) entra sin código nuevo.
- **Sacrifica:** algo de precisión que darían prompts ultra-especializados por dominio, y una
  capa de indirección en el código.

### ADR-009 — Re-ingesta idempotente: las notas son documentos vivos
- **Contexto:** el dominio primario es PKM — las notas se **editan y borran** constantemente.
  Un pipeline append-only acumula relaciones huérfanas de versiones viejas del texto: el
  grafo termina mintiendo por desactualización, que viola el driver 1 tanto como una
  alucinación.
- **Decisión:** la ingesta es idempotente a nivel de **chunk**: hash por chunk (no solo por
  documento); al re-ingerir un documento editado, solo los chunks cambiados se re-extraen
  (de paso, el cache de extracción opera a esta granularidad — driver 4). Las relaciones
  cuya única provenance proviene de chunks obsoletos **se retiran**; las entidades que quedan
  sin ninguna mención se marcan huérfanas (limpieza explícita, no borrado en caliente).
  Borrar un documento retira sus chunks y dispara la misma lógica.
- **Sacrifica:** bookkeeping (conteo de provenance vigente por relación) y la simplicidad de
  un pipeline append-only. Ineludible: sin esto el producto no sirve para su dominio primario.

---

## 5. Modelo de datos (Neo4j)

### Nodos
- **`:Entity`** (label adicional por tipo del esquema: `:Concepto`, `:Persona`, `:Proyecto`, `:Fuente`…)
  - `id` (canónico, clave del MERGE), `name` (forma canónica), `type` (del esquema de
    dominio), `createdAt`.
- **`:Alias`** — cada forma de superficie conocida de una entidad, **con su propio
  embedding**: `surface` (texto tal como apareció), `embedding: float[]` (índice vectorial),
  `mergedByStage` + `evidence` (auditoría del merge, ADR-004). Toda entidad tiene al menos
  un alias (su nombre canónico). *Por qué:* si "AAPL" se fusiona en "Apple Inc" y el nodo
  solo guarda el embedding del nombre canónico, la próxima mención de "AAPL" no lo encuentra
  por vector — los alias deben seguir siendo buscables. El embedding se calcula sobre
  `surface + tipo + contexto breve de la mención` (un nombre solo es ambiguo: "Mercurio"
  planeta vs. elemento).
- **`:Document`** — `path`, `hash`, `ingestedAt`.
- **`:Chunk`** — `id`, `hash` (granularidad del cache y de la re-ingesta, ADR-009), `text`,
  `order`, `headingPath` (posición estructural en el doc).

### Relaciones
- **`(:Entity)-[r:REL_TYPE]->(:Entity)`** — tipo del esquema de dominio
  (`RELACIONADO_CON`, `PREREQUISITO_DE`…). Propiedades: `provenance: string[]` (fragmentos de
  origen — puede haber varios por dedup de overlap), `chunkIds: string[]`, `confidence`.
- **`(:Alias)-[:ALIAS_OF]->(:Entity)`** — la búsqueda vectorial golpea alias y sigue esta
  arista hasta el canónico.
- **`(:Chunk)-[:PART_OF]->(:Document)`**
- **`(:Entity)-[:MENTIONED_IN]->(:Chunk)`** — ancla de provenance navegable; su ausencia
  total marca la entidad como huérfana (ADR-009).

### Índices
- Índice vectorial nativo sobre `Alias.embedding` (resolución, ADR-004) — sobre alias, no
  sobre la entidad, para que las formas fusionadas sigan siendo buscables.
- Constraint de unicidad sobre `Entity.id`; índices sobre `Document.hash` y `Chunk.hash`.

### Invariantes
- Ninguna relación entre entidades sin `provenance` no vacío (ADR-003) **y vigente** — si
  todos sus chunks de origen fueron reemplazados por re-ingesta, la relación se retira (ADR-009).
- Un `Entity.id` por entidad del mundo real; los duplicados detectados tarde se fusionan, no
  se toleran (ADR-004).
- Todo merge es auditable: el alias conserva qué etapa lo fusionó y con qué evidencia (ADR-004).

---

## 6. Vista de arquitectura

```
                          ┌─────────────────────────────────────────────┐
 markdown ──► /ingest ──► │ /extract (Claude tool use + Zod + provenance)│
 (chunking + overlap)     └──────────────────┬──────────────────────────┘
                                             ▼
                          /resolve (embudo: normaliza → vector → J-W → LLM)
                                             ▼
                          /graph (MERGE canónico + provenance)  ──►  Neo4j
                                                                   (grafo +
                                             ┌─────────────────────  índice
                                             ▼                       vectorial)
                     /query ── router ──┬─ Ruta 1: GraphRAG (subgrafo → Claude redacta)
                   (sesiones READ)      └─ Ruta 2: plantillas Cypher parametrizadas
                                             ▼
                          API Fastify ──► Frontend React (búsqueda → ego-network 3D)
```

Monorepo: `/backend/src/{ingest,extract,resolve,graph,query,schema,evals}` + `/frontend` +
`docker-compose.yml` (Neo4j). Estructura completa en el
[plan v2](plan-grafo-conocimiento-v2.md).

---

## 7. Roadmap por fases

Cada fase cierra con el **Definition of Done del método** (ronda crítica → CASES → AUDIT →
TROUBLESHOOTING → CLAUDE.md/README → verde → commit+push). Detalle paso a paso en el plan v2.

| Fase | Entrega | Hito de cierre |
|---|---|---|
| **0 — Fundación** | **Gates G-1…G-4 resueltos**, scaffold monorepo, Neo4j + índice vectorial arriba, SDKs cableados, esquema PKM como config | `npm run dev` levanta backend + frontend + Neo4j sin errores |
| **1 — Pipeline de extracción** | Ingesta markdown → chunking con overlap → extracción Claude/Zod con provenance verificada en código → dedup de tripletas → escritura ingenua; hash por chunk desde el día 1 (base de ADR-009) | Aparece un grafo desde notas reales; re-ingerir el mismo doc no duplica nada |
| **2 — Resolución de entidades** | Embudo de 4 etapas con guardas de auto-merge, alias con embedding propio, rechazo de lo no anclado; **mini dataset dorado (~20-30 casos de alias/homónimos) para calibrar los umbrales con evidencia** (regla 3 del método); re-ingesta idempotente completa (ADR-009) | "Apple"/"AAPL" colapsan a un nodo; editar una nota actualiza el grafo sin huérfanos; umbrales calibrados contra el mini-dorado |
| **3 — Q&A en lenguaje natural** | GraphRAG + plantillas + router; sesiones READ a nivel driver | Respuesta anclada a fuentes; pregunta estructural vía plantilla; escritura rechazada por el driver |
| **4 — Visualización y UX** | Búsqueda → ego-network → expansión; constelación 3D con bloom; landing narrativa | Demo fluida con grafos reales bajo el límite de nodos |
| **5 — Evals y pulido** | Dataset dorado, precisión/recall de extracción, exactitud de resolución, costo/latencia; README con narrativa de decisiones; deploy público | Demo pública + harness de evals reportando |
| **6 — v2 (solo con tracción)** | 2º dominio por config; BullMQ/Redis para escala | Mismo motor, distinto esquema, cero código nuevo de dominio |

---

## 8. Riesgos

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Resolución de entidades falla → grafo de duplicados | Alto | ADR-004: embudo en Fase 2, no se pospone; umbrales calibrados con evidencia (CASES) |
| Alucinación de relaciones | Alto | ADR-003: provenance obligatoria; GraphRAG inyecta solo subgrafos reales — el LLM redacta, no inventa estructura |
| NL→Cypher inseguro/frágil | Mitigado por diseño | ADR-005: el LLM nunca escribe Cypher libre; READ a nivel de driver |
| Relaciones cortadas en fronteras de chunk | Medio | ADR-006: overlap + dedup de tripletas |
| Costo del LLM | Medio | G-2 lo mide antes de construir; embudo acota adjudicaciones; cache por hash de contenido; modelo más barato en extracción masiva si hace falta |
| Demo "bola de pelos" | Mitigado por diseño | ADR-007: revelación progresiva + límite duro de nodos |
| Free tier de Aura insuficiente | Medio | G-1 lo verifica en Fase 0; fallback documentado en ADR-002 |
| Grafo desactualizado por notas editadas/borradas | Alto (dominio PKM) | ADR-009: re-ingesta idempotente por hash de chunk; retiro de relaciones con provenance obsoleta |
| Merge automático incorrecto (difícil de deshacer) | Medio | Guardas de ADR-004 (tipos distintos nunca, nombres cortos/acrónimos nunca) + merges auditables vía `:Alias` |
| Cambio del modelo de embeddings invalida el índice | Medio | Versión del modelo **pineada** y registrada como metadato del grafo; migrar = re-embed batch de todos los alias |
| Librerías JS inmaduras en el nicho grafo+LLM | Medio | Stack delgado: SDKs oficiales + driver Neo4j directo, sin frameworks gordos |

---

## 9. Documentos compañeros

Según el método: [`docs/AUDIT.md`](docs/AUDIT.md) (deuda, `AUD-NNN`),
[`docs/CASES.md`](docs/CASES.md) (casos raros del dominio — obligatorio antes de tocar
umbrales/heurísticas), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) (incidentes),
[`CLAUDE.md`](CLAUDE.md) (reentrada en 5 minutos). `SECURITY.md` y `DEPLOY.md` se crean
cuando llegue el despliegue público (Fase 5) — proporcionalidad.

---

## Historial de revisiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0.0 | 2026-07-09 | Baseline. Destilado del [plan v2](plan-grafo-conocimiento-v2.md) al formato del método (MANIFIESTO v1.1.0): 4 gates explícitos (Aura free tier, costo LLM/embeddings, viabilidad 3D+bloom, datos del corpus), 6 drivers de calidad priorizados, 8 ADRs con sus sacrificios, modelo de datos Neo4j con invariantes, roadmap de 7 fases con DoD. |
| 1.1.0 | 2026-07-10 | **Enmienda por ronda crítica (vista de halcón) pre-Fase 0.** (1) **ADR-009 nuevo — re-ingesta idempotente:** las notas PKM son documentos vivos; el pipeline append-only del baseline dejaba el grafo mintiendo por desactualización. Hash a nivel de chunk, retiro de relaciones con provenance obsoleta, entidades huérfanas. (2) **ADR-004 endurecido:** guardas del auto-merge (Jaro-Winkler premia prefijos — nunca entre tipos distintos, nunca nombres cortos/acrónimos), resolución serializada por nombre normalizado (carrera de duplicados en paralelo), merges auditables. (3) **Modelo de datos:** embeddings movidos de `:Entity` a nodos `:Alias` (las formas fusionadas deben seguir siendo buscables por vector); embedding = superficie + tipo + contexto (nombres solos son ambiguos). (4) **ADR-003:** la provenance se verifica en código contra el chunk (el LLM puede alucinar la cita); correferencia entre chunks documentada como limitación. (5) **ADR-005:** invariante de honestidad ("sin evidencia" > respuesta paramétrica), presupuesto de tokens para subgrafos de hubs, parámetros Cypher vía driver. (6) **Roadmap:** mini dataset dorado adelantado a Fase 2 — calibrar umbrales en Fase 2 con evals en Fase 5 contradecía la regla 3 del método. (7) Riesgos nuevos: desactualización, merge irreversible, pin del modelo de embeddings. |

---

*El SAD cambia solo por ADR nuevo o enmienda versionada. Una decisión sin su ADR es una
decisión que nadie tomó.*
