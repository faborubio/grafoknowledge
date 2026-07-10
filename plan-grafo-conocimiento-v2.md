# Plan v2: Constructor de Grafo de Conocimiento con IA (Node/TS)

## Contexto

El usuario tiene un viejo proyecto (AI_SUMMARIZER) que es un clon reconocible de un tutorial: un wrapper delgado sobre una API de resúmenes, sin backend, con la API key expuesta en el cliente. No diferencia a un perfil senior. Tras explorar varias ideas, el usuario eligió construir algo nuevo, greenfield: un constructor de grafo de conocimiento que lee documentos, extrae entidades y relaciones tipadas automáticamente con un LLM, las almacena en un grafo consultable, y permite preguntarle al grafo en lenguaje natural.

**Pitch del portafolio:** "¿Conoces el grafo de Obsidian? Imagínalo, pero donde las conexiones se construyen solas leyendo tus documentos, tienen significado, y puedes hacerle preguntas." Lo que en Obsidian es trabajo manual (enlazar notas), aquí lo hace la extracción automática + tipado + consulta — ese es el valor de ingeniería.

El viejo repo no se reutiliza salvo, si acaso, el andamiaje de React/Vite/Tailwind del frontend. Este es un proyecto nuevo.

## Decisiones ya tomadas

- **Lenguaje:** Node.js + TypeScript (cohesión con el portafolio JS del usuario; el workload es I/O-bound = orquestación de llamadas a LLM/DB, terreno fuerte de Node; el tipado estático previene una clase entera de bugs en producción).
- **Graph DB:** Neo4j (Cypher, gran visualización, free tier Aura / Community local). Se usa además su **índice vectorial nativo (5.x)** para la resolución de entidades — un store menos que operar.
- **Alcance v1:** pipeline completo INCLUYENDO Q&A en lenguaje natural (arquitectura de dos rutas, ver Fase 3).
- **Arquitectura multi-dominio:** esquemas como configuración intercambiable. Dominio primario de v1 = notas personales / PKM (markdown). 2º dominio en v2 como demo de genericidad (cambio de config, no código nuevo).
- **LLM:** Claude (Anthropic SDK) para extracción, adjudicación de entidades y redacción de respuestas.
- **Embeddings:** Gemini (el usuario ya lo tiene) para resolución de entidades.
- **Modelo para construir:** Opus para diseño; Fable 5 / /fast opcional al codear.

## El muro inesquivable

La resolución de entidades ("Apple" / "AAPL" / "Apple Inc" = un solo nodo) y la extracción sin alucinación (cada relación anclada a su fragmento de origen). Se ataca desde el día 1; si falla, el grafo se llena de duplicados y miente.

## Stack

- **Backend:** Node + TypeScript, Fastify (tipado, rápido; Express como alternativa).
- **LLM:** `@anthropic-ai/sdk` (Claude) — extracción con salida estructurada vía tool use.
- **Embeddings:** SDK de Gemini (`@google/genai`) para dedup de entidades.
- **Validación:** Zod — valida TODA salida del LLM en un único punto tipado.
- **Graph DB:** Neo4j vía `neo4j-driver` oficial (Docker Compose local o Aura free). Índice vectorial nativo para candidatos de resolución.
- **Frontend:** React + Vite + Tailwind (reusa skill del usuario) + react-force-graph.
- **Infra:** Docker Compose para Neo4j en local. Despliegue: frontend en Vercel, backend + Neo4j Aura.
- **(v2) Cola:** BullMQ + Redis para ingesta a escala.

## Estructura del repositorio (monorepo)

```
/backend
  /src
    /ingest      # loaders (markdown), chunking estructural CON overlap
    /extract     # prompts de extracción, esquemas Zod, llamada a Claude
    /resolve     # embudo de resolución: normalización -> vector -> string -> LLM
    /graph       # cliente Neo4j, lógica MERGE, provenance, sesiones read-only
    /query       # router de 2 rutas: GraphRAG + plantillas Cypher parametrizadas
    /schema      # esquemas de dominio como config tipada (PKM primero) <- multi-dominio
    /evals       # dataset dorado + métricas
    server.ts    # API Fastify
/frontend
  /src           # React + react-force-graph + Tailwind
docker-compose.yml  # Neo4j
README.md           # diagrama de arquitectura + narrativa "por qué este stack"
```

## Fases de construcción

### Fase 0 — Fundación

- Scaffold del monorepo (backend Node/TS + frontend React/Vite/TS/Tailwind).
- Neo4j corriendo (Docker Compose) y verificado, **con índice vectorial creado** para los embeddings de entidades.
- SDKs de Claude y Gemini cableados; config de entorno (.env, keys NUNCA en cliente).
- Definir el esquema de dominio PKM como config tipada: tipos de entidad (Concepto, Persona, Proyecto, Fuente…) y tipos de relación (relacionado_con, prerequisito_de, mencionado_en…). Esquemas Zod de la salida de extracción.
- **Hito:** `npm run dev` levanta backend + frontend + Neo4j sin errores.

### Fase 1 — Pipeline de extracción (el núcleo)

- Ingesta de markdown → chunking que respeta encabezados/estructura, **con solapamiento (overlap) de ~10-15% entre chunks** para no cortar relaciones en la frontera ("Apple fue fundada por…" / "…Steve Jobs en 1976").
- Extracción por chunk con Claude + tool use (salida estructurada forzada al esquema) → validada por Zod → entidades + relaciones, cada una con su fragmento de origen (provenance).
- **Dedup de tripletas entre chunks solapados:** la misma tripleta (origen, tipo, destino) extraída de dos ventanas adyacentes se fusiona en el MERGE; ambas provenances se conservan como evidencia doble. No requiere lógica de "fusión parcial" especial — el overlap garantiza que la relación completa aparece en al menos una ventana.
- Escritura ingenua (sin dedup de entidades todavía) a Neo4j para ver un grafo crudo.
- **Hito:** aparece un grafo a partir de un set de notas reales.

### Fase 2 — Resolución de entidades (el muro)

Embudo estricto, ordenado de lo más barato a lo más caro:

1. **Match exacto/normalizado** (lowercase, sin tildes, sin sufijos legales tipo "Inc."/"Ltda.") — gratis, resuelve los casos obvios.
2. **Búsqueda vectorial** (embeddings Gemini contra el índice vectorial nativo de Neo4j) → top-K candidatos. Costo ~O(log N) por entidad nueva gracias al índice — no existe el problema O(N²).
3. **Similitud de strings** (Jaro-Winkler) sobre esos K candidatos — barato y rápido en Node.
4. **Adjudicación por LLM solo en zona gris:** similitud ≥ ~0.95 → merge automático; ≤ ~0.75 → entidad nueva; entre medio → Claude decide con contexto. Esto acota las llamadas al LLM a una fracción pequeña del total.

- Entidad canónica con alias; MERGE en Neo4j por ID canónico.
- Anti-alucinación: rechazar relaciones que el modelo no puede anclar a texto fuente.
- **Hito:** "Apple"/"AAPL" colapsan a un nodo; sin bola de pelos de duplicados.

### Fase 3 — Consulta y Q&A en lenguaje natural (dos rutas + router)

- **Ruta 1 (por defecto): GraphRAG.** El LLM extrae las "entidades semilla" de la pregunta → búsqueda vectorial/string para ubicarlas en el grafo → código determinista en Node extrae el subgrafo a 1-2 saltos → el subgrafo (JSON/texto) se inyecta en el prompt de Claude para redactar la respuesta final con citas a provenance. Robusto, siempre anclado, sin Cypher generado por LLM.
- **Ruta 2: preguntas estructurales vía plantillas Cypher parametrizadas.** Para lo que el grafo hace mejor que RAG plano — "¿cuál es el camino entre A y B?", "¿cuántos proyectos dependen de X?", "¿qué conceptos no tienen prerequisitos?". El LLM NO escribe Cypher libre: clasifica la pregunta y rellena parámetros de plantillas predefinidas (camino más corto, conteo por tipo, vecinos a N saltos). Estas preguntas son el argumento diferenciador del grafo en la demo — no se sacrifican.
- **Router simple** decide la ruta según la forma de la pregunta.
- **Seguridad a nivel de protocolo, no de regex:** toda sesión de consulta se abre con `defaultAccessMode: neo4j.session.READ` — Neo4j rechaza cualquier escritura a nivel de driver. (Las guardas por regex contra DROP/DELETE quedan como defensa secundaria, no primaria.)
- **Hito:** "¿qué conecta X con Y?" devuelve respuesta anclada a fuentes; una pregunta estructural ("camino entre A y B") funciona vía plantilla; un intento de escritura es rechazado por el driver.

### Fase 4 — Visualización y UX (revelación progresiva)

- **Nada de renderizar el grafo completo al abrir.** La pantalla inicial es una búsqueda. Al buscar un concepto se renderiza solo su **ego-network** (el nodo + conexiones directas); doble click expande vecinos.
- **Límite duro de ~150 nodos renderizados** y colapso/agrupación de nodos de grado muy alto. react-force-graph se degrada sobre ~300 nodos / 1000 aristas — el límite es de diseño, no opcional.
- Click en nodo → panel de detalles + fragmento de origen (provenance); búsqueda siempre visible.
- La revelación progresiva ES la narrativa de demo: "busco un concepto, veo sus conexiones, expando, descubro algo que no sabía que estaba conectado" — mejor historia que una nube impresionante pero ilegible.
- **Dirección visual original — "constelación de conocimiento"** (inspiración conceptual de sitios premiados tipo Awwwards está bien; copiar código/assets/modelos 3D de sitios con copyright — que es todos por defecto — no):
  - **Concepto:** fondo oscuro profundo, nodos como partículas brillantes con glow, aristas como hilos de luz tenues. Temáticamente perfecto para un grafo de conocimiento y 100% construible desde cero.
  - **Grafo 3D con partículas:** `react-force-graph-3d` (ya trae Three.js por debajo). Materiales emisivos custom por tipo de entidad (`nodeThreeObject`), partículas direccionales animadas sobre las aristas (`linkDirectionalParticles`) para dar sensación de "conocimiento fluyendo".
  - **Glow/bloom:** `postprocessing` con `UnrealBloomPass` de Three.js (o `@react-three/postprocessing` si se migra a react-three-fiber). Es el efecto que convierte puntos planos en "constelación".
  - **Landing con scroll narrativo (la portada de la demo):** GSAP + ScrollTrigger para la secuencia de entrada — el "antes" (notas dispersas) → el "después" (el grafo conectándose solo) — antes de llegar a la app. Alternativa más liviana: Framer Motion (`useScroll` + `motion`) si GSAP resulta excesivo.
  - **Micro-interacciones de la app:** Framer Motion para paneles de detalle, transiciones de búsqueda y expansión de ego-network.
  - **Tipografía y assets propios:** fuentes con licencia abierta vía Google Fonts (p. ej. Space Grotesk para display + Inter para texto, licencia OFL). Iconos `lucide-react` (MIT). Cero descargas de assets de sitios ajenos; cero código extraído del inspector de otros sitios.
  - **Paleta como design tokens en Tailwind:** definir colores propios (fondo casi-negro, 4-6 acentos neón asignados a tipos de entidad) en `tailwind.config` — coherencia entre la viz 3D y la UI 2D.
- **Hito:** la pantalla de demo impresionante (el "después" de Obsidian), fluida con grafos reales.

### Fase 5 — Evals y pulido

- Dataset dorado: docs con entidades/relaciones esperadas. Medir precisión/recall de extracción y exactitud de resolución de entidades (incluyendo casos de alias conocidos); registrar costo/latencia del LLM por documento.
- README con diagrama de arquitectura + narrativa de decisiones de stack. Secciones oro en entrevista: "por qué Node y no Python", "por qué dos rutas de consulta y no NL→Cypher libre", "por qué el embudo de resolución acota el costo del LLM".
- Desplegar demo pública.

### Fase 6 — v2 (opcional): probar genericidad

- Agregar 2º dominio (papers o docs técnicas) solo por config → mismo motor, distinto esquema. Demuestra que el sistema es genérico.
- BullMQ + Redis para ingesta a escala. Nota de arquitectura políglota (microservicio Python solo si llega ML pesado/GNNs).

## Verificación (end-to-end)

- **Pipeline:** correr ingesta sobre una carpeta de notas de muestra → inspeccionar Neo4j Browser; confirmar nodos y aristas tipadas con provenance. Verificar que tripletas extraídas de chunks solapados no se duplican.
- **Resolución de entidades:** alimentar docs con alias conocidos → assert de un único nodo canónico (no duplicados). Test automatizado. Verificar que las llamadas de adjudicación al LLM son una minoría (loguear conteo por etapa del embudo).
- **Q&A NL:** preguntas con respuesta conocida por ambas rutas → verificar respuesta correcta + citas a fuente. Test explícito: una sesión de consulta intenta una escritura y el driver la rechaza (READ mode).
- **Evals:** correr el harness → reporta precisión/recall de extracción, exactitud de resolución, costo/latencia.
- **Frontend:** búsqueda → ego-network → expandir con doble click; click en nodo muestra detalles + fuente; el render se mantiene fluido bajo el límite de nodos.

## Riesgos y mitigaciones

- **Resolución de entidades (alto):** atacar en Fase 2, no posponer. Embudo de 4 etapas (normalización → índice vectorial → Jaro-Winkler → LLM solo zona gris) con umbrales 0.95/0.75. El índice vectorial nativo elimina el problema O(N²).
- **Alucinación de relaciones (alto):** exigir provenance; rechazar lo no anclado. En Q&A, la ruta GraphRAG inyecta solo subgrafos reales — el LLM redacta, no inventa estructura.
- **NL→Cypher inseguro/frágil (medio → mitigado por diseño):** el LLM nunca escribe Cypher libre. GraphRAG por defecto + plantillas parametrizadas para lo estructural. Sesiones READ a nivel de driver como guarda primaria.
- **Relaciones cortadas en fronteras de chunk (medio):** overlap 10-15% + dedup de tripletas en el MERGE. En notas PKM (cortas) el riesgo es menor que en papers largos.
- **Costo del LLM (medio):** chunking razonable; embudo que minimiza adjudicaciones; modelo más barato en extracción masiva si hace falta; cachear extracciones por hash de contenido.
- **Demo "bola de pelos" (medio → mitigado por diseño):** revelación progresiva (búsqueda → ego-network → expansión), límite ~150 nodos, colapso de alto grado.
- **Librerías JS inmaduras (medio):** stack delgado — SDKs oficiales + driver Neo4j directo, no frameworks gordos.

## Registro de cambios v1 → v2

1. **Fase 1:** chunking ahora con overlap 10-15% + dedup de tripletas entre ventanas solapadas (doble provenance como evidencia).
2. **Fase 2:** embudo reordenado (string normalizado primero, que es lo más barato), índice vectorial nativo de Neo4j (O(log N), no O(N²)), umbrales explícitos 0.95/0.75 para acotar llamadas al LLM.
3. **Fase 3:** reescrita. De "NL→Cypher con regex contra DELETE" a arquitectura de dos rutas (GraphRAG por defecto + plantillas Cypher parametrizadas para preguntas estructurales) con sesiones read-only a nivel de driver (`defaultAccessMode: READ`).
4. **Fase 4:** revelación progresiva como criterio de diseño (no solo mitigación): búsqueda → ego-network → expandir; límite duro de nodos. Dirección visual original detallada ("constelación de conocimiento") con librerías concretas: react-force-graph-3d + bloom (postprocessing/Three.js), GSAP ScrollTrigger para landing con scroll narrativo, Framer Motion para micro-interacciones, fuentes OFL e iconos MIT — sin assets ni código de sitios protegidos.
