import { env } from "../src/config.js";
import { writeSession, closeDriver } from "../src/graph/client.js";

/**
 * Crea constraints e índices del modelo de datos (SAD §5). Idempotente.
 * El índice vectorial va sobre :Alias.embedding — no sobre :Entity — para que
 * las formas fusionadas sigan siendo buscables (enmienda SAD v1.1.0).
 */
const statements = [
  `CREATE CONSTRAINT entity_id IF NOT EXISTS
   FOR (e:Entity) REQUIRE e.id IS UNIQUE`,

  `CREATE INDEX document_hash IF NOT EXISTS
   FOR (d:Document) ON (d.hash)`,

  `CREATE INDEX chunk_hash IF NOT EXISTS
   FOR (c:Chunk) ON (c.hash)`,

  `CREATE VECTOR INDEX alias_embedding IF NOT EXISTS
   FOR (a:Alias) ON (a.embedding)
   OPTIONS { indexConfig: {
     \`vector.dimensions\`: ${env.EMBEDDING_DIM},
     \`vector.similarity_function\`: 'cosine'
   }}`,
];

const session = writeSession();
try {
  for (const stmt of statements) {
    await session.run(stmt);
    console.log(`OK: ${stmt.trim().split("\n")[0]}`);
  }
  console.log(
    `\nÍndices listos (embedding: ${env.EMBEDDING_MODEL}, ${env.EMBEDDING_DIM} dims).`,
  );
} finally {
  await session.close();
  await closeDriver();
}
