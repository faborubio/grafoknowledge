import type { DomainSchema } from "./domain.js";

/**
 * Dominio primario v1: notas personales / PKM en markdown (SAD §1).
 * La prueba de genericidad (Fase 6) es que un 2º dominio entre solo con otro archivo así.
 */
export const pkmDomain: DomainSchema = {
  id: "pkm",
  promptContext:
    "Los documentos son notas personales de conocimiento (PKM) en markdown: " +
    "apuntes de estudio, ideas, proyectos, referencias a personas y fuentes. " +
    "Extrae solo lo que el texto afirma explícitamente.",
  entityTypes: [
    {
      name: "Concepto",
      description:
        "Una idea, tema, técnica o área de conocimiento (p. ej. 'grafos de conocimiento', " +
        "'programación reactiva'). NO es un proyecto ni una persona.",
    },
    {
      name: "Persona",
      description: "Un ser humano identificable por nombre (autor, colega, figura pública).",
    },
    {
      name: "Proyecto",
      description:
        "Un esfuerzo con objetivo y desarrollo propio (p. ej. 'GrafoKnowledge', 'FleetPilot'). " +
        "NO es un concepto abstracto.",
    },
    {
      name: "Fuente",
      description:
        "Un material referenciable: libro, artículo, video, curso, repositorio, sitio.",
    },
    {
      name: "Herramienta",
      description:
        "Software, librería, servicio o tecnología utilizable (p. ej. 'Neo4j', 'React').",
    },
  ],
  relationTypes: [
    {
      name: "RELACIONADO_CON",
      description: "Conexión semántica general y explícita entre dos entidades.",
      sourceTypes: "*",
      targetTypes: "*",
    },
    {
      name: "PREREQUISITO_DE",
      description: "Entender/completar el origen es necesario antes del destino.",
      sourceTypes: ["Concepto"],
      targetTypes: ["Concepto", "Proyecto"],
    },
    {
      name: "PARTE_DE",
      description: "El origen es un componente o subtema del destino.",
      sourceTypes: "*",
      targetTypes: ["Concepto", "Proyecto"],
    },
    {
      name: "CREADO_POR",
      description: "El origen fue creado/escrito/fundado por la persona destino.",
      sourceTypes: ["Concepto", "Proyecto", "Fuente", "Herramienta"],
      targetTypes: ["Persona"],
    },
    {
      name: "USA",
      description: "El proyecto/concepto origen usa la herramienta o concepto destino.",
      sourceTypes: ["Proyecto", "Concepto"],
      targetTypes: ["Herramienta", "Concepto"],
    },
    {
      name: "TRATA_SOBRE",
      description: "La fuente origen trata sobre el concepto/proyecto/persona destino.",
      sourceTypes: ["Fuente"],
      targetTypes: "*",
    },
  ],
};
