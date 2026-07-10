import { z } from "zod";
import {
  entityTypeNames,
  relationTypeNames,
  type DomainSchema,
} from "../schema/domain.js";

/**
 * ADR-003: TODA salida del LLM se valida aquí, en un único punto tipado.
 * Los esquemas se construyen desde el DomainSchema (ADR-008) — el motor no
 * hardcodea tipos de ningún dominio.
 */

export function buildExtractionSchema(domain: DomainSchema) {
  const entityType = z.enum(entityTypeNames(domain));
  const relationType = z.enum(relationTypeNames(domain));

  const ExtractedEntity = z.object({
    /** Forma de superficie EXACTA como aparece en el texto (será un :Alias). */
    surface: z.string().min(1),
    type: entityType,
  });

  const ExtractedRelation = z.object({
    source: z.string().min(1),
    type: relationType,
    target: z.string().min(1),
    /**
     * Cita textual del chunk que sostiene la relación. Se verifica EN CÓDIGO
     * contra el texto del chunk (ADR-003) — lo no anclado se rechaza.
     */
    provenance: z.string().min(1),
  });

  return z.object({
    entities: z.array(ExtractedEntity),
    relations: z.array(ExtractedRelation),
  });
}

export type ExtractionResult = z.infer<ReturnType<typeof buildExtractionSchema>>;
