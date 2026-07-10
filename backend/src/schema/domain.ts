/**
 * ADR-008: los dominios son configuración intercambiable. El motor
 * (ingest/extract/resolve/graph/query) no conoce el dominio: recibe un DomainSchema.
 */

export interface EntityTypeDef {
  /** Nombre del tipo, usado como label en Neo4j (PascalCase, sin espacios). */
  name: string;
  /** Descripción para el prompt de extracción — qué ES y qué NO es este tipo. */
  description: string;
}

export interface RelationTypeDef {
  /** Nombre del tipo de relación en Neo4j (SCREAMING_SNAKE_CASE). */
  name: string;
  description: string;
  /** Tipos de entidad válidos como origen/destino ("*" = cualquiera). */
  sourceTypes: string[] | "*";
  targetTypes: string[] | "*";
}

export interface DomainSchema {
  /** Identificador del dominio (p. ej. "pkm"). */
  id: string;
  /** Contexto de dominio inyectado al prompt de extracción. */
  promptContext: string;
  entityTypes: EntityTypeDef[];
  relationTypes: RelationTypeDef[];
}

export function entityTypeNames(schema: DomainSchema): [string, ...string[]] {
  const names = schema.entityTypes.map((t) => t.name);
  if (names.length === 0) throw new Error(`Dominio ${schema.id} sin tipos de entidad`);
  return names as [string, ...string[]];
}

export function relationTypeNames(schema: DomainSchema): [string, ...string[]] {
  const names = schema.relationTypes.map((t) => t.name);
  if (names.length === 0) throw new Error(`Dominio ${schema.id} sin tipos de relación`);
  return names as [string, ...string[]];
}
