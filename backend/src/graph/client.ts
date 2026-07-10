import neo4j, { type Driver, type Session } from "neo4j-driver";
import { env } from "../config.js";

let driver: Driver | undefined;

export function getDriver(): Driver {
  driver ??= neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
  );
  return driver;
}

/**
 * ADR-005: toda sesión de CONSULTA se abre read-only a nivel de driver.
 * El módulo /query solo puede usar esta función — nunca writeSession.
 */
export function readSession(): Session {
  return getDriver().session({ defaultAccessMode: neo4j.session.READ });
}

/** Solo para el pipeline de ingesta (/graph) y scripts de init. */
export function writeSession(): Session {
  return getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
}

export async function verifyConnectivity(): Promise<void> {
  await getDriver().verifyConnectivity();
}

export async function closeDriver(): Promise<void> {
  await driver?.close();
  driver = undefined;
}
