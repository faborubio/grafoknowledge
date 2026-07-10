# TROUBLESHOOTING — Incidentes y sus arreglos

> Cada falla resuelta se registra: síntoma → causa raíz → arreglo. Los incidentes graves,
> con postmortem. (Método, §2.)

## 2026-07-10 — Neo4j no levantaba en local (Docker Desktop + puertos excluidos de Windows)

- **Síntoma 1:** `docker compose up` fallaba con el engine devolviendo 500 en el pipe
  `dockerDesktopLinuxEngine` durante >15 min, con procesos de Docker Desktop corriendo.
- **Causa raíz:** arranque atascado de Docker Desktop (engine Linux nunca terminó de iniciar).
- **Arreglo:** matar todos los procesos `*docker*`, `wsl --terminate docker-desktop` y relanzar
  Docker Desktop. Engine sano en ~1 min.
- **Síntoma 2:** con el engine sano, `bind: An attempt was made to access a socket in a way
  forbidden by its access permissions` al exponer el puerto 7474.
- **Causa raíz:** Windows (Hyper-V/WSL) reserva rangos de puertos dinámicos — `netsh interface
  ipv4 show excludedportrange protocol=tcp` mostró 7431-7530 excluido, que atrapa el 7474 del
  Browser de Neo4j. Bolt (7687) no estaba afectado.
- **Arreglo:** remapear el Browser a `8474:7474` en `docker-compose.yml`. Si algún día cae
  también el 7687, el mismo diagnóstico aplica (los rangos excluidos cambian entre reinicios).
- **Nota:** el healthcheck del contenedor marca `unhealthy` durante el primer boot (creación
  de la base tarda más que los reintentos); se vuelve `healthy` solo — esperar antes de
  diagnosticar.
