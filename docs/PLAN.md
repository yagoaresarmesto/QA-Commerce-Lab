# Análisis, riesgos y plan por fases

## 1. Análisis de requisitos

El objetivo es un **System Under Test** realista y duradero, no una demo. De los requisitos se derivan cinco ejes que guían todas las decisiones:

1. **Funcionalidad real y coherente**: cada acción de la UI llama a la API y tiene efectos verificables en base de datos (stock, pagos, pedidos, cupones, emails).
2. **Backend como fuente de verdad**: precios, totales, stock, permisos y transiciones de estado se calculan y validan en el servidor.
3. **Testabilidad sin trampas**: sin CAPTCHA ni bloqueos en testing, datos deterministas, selectores estables y accesibles, contratos documentados (OpenAPI) y errores con códigos estables.
4. **Control del entorno**: API de testing para preparar, aislar, simular fallos y limpiar; inexistente en la demo pública.
5. **Operación sencilla y barata**: Docker en local, una sola imagen para los entornos remotos, despliegue automatizado y coste mensual bajo.

## 2. Arquitectura definitiva

Ver [ARCHITECTURE.md](ARCHITECTURE.md) (stack, módulos, modelo de datos, seguridad) y [DEPLOYMENT.md](DEPLOYMENT.md) (viabilidad, costes, separación demo/testing).

## 3. Seeds, reset y aislamiento

Ver [TESTING.md](TESTING.md):

- **Seed determinista** basado en *upserts* por claves naturales (slug, SKU, código, email): el mismo código sirve para sembrar desde cero (IDs idénticos tras `TRUNCATE ... RESTART IDENTITY`) y para **restaurar** los datos de referencia sin borrar los de otras ejecuciones.
- **Tres niveles de limpieza**: por ejecución (`runId`, seguro en paralelo), restauración de referencia y reset global (solo entornos dedicados).
- **Aislamiento lógico** por `runId`: etiquetado de datos, catálogo con visibilidad por ejecución, fallos acotados y limpieza que revierte efectos colaterales en datos compartidos.

## 4. Riesgos técnicos y mitigación

| Riesgo | Impacto | Mitigación aplicada |
|---|---|---|
| Sobreventa / carreras en el checkout | Datos incoherentes, tests de concurrencia imposibles | Decremento atómico condicional, bloqueo del carrito, idempotencia, control optimista de estados (verificado con tests de integración) |
| Suites paralelas que se pisan | Tests inestables | `runId`, visibilidad del catálogo por ejecución, escenarios que crean datos nuevos, limpieza por ejecución |
| Reset global destruye otras ejecuciones | Fallos en cascada | Deshabilitado por defecto en testing; alternativas por `runId` y restauración de referencia |
| API de testing expuesta en producción | Borrado de datos de la demo | Módulo no registrado en demo/production (garantía en código), clave técnica obligatoria y ≥ 24 caracteres en remoto, auditoría |
| Fallos simulados que afectan a otros | Falsos negativos | Reglas siempre acotadas (runId/usuario), con caducidad y número de usos; globales solo con flag explícito |
| Planes gratuitos que se duermen o caducan | Timeouts en el primer test, pérdida de datos | Recomendación de VPS 24/7 de coste fijo; tabla de límites documentada |
| Selectores frágiles | Mantenimiento de suites costoso | HTML semántico, labels exactos, roles ARIA, `data-testid` estables documentados, sin IDs aleatorios en el DOM público |
| Deriva del dataset de referencia (stock, ventas, valoraciones) | Asserts que dejan de cumplirse con el tiempo | Limpieza que revierte efectos, `POST /api/test/seed`, reset nocturno de la demo, contadores derivados recalculados |
| Dependencia de servicios externos (pagos, email, imágenes) | Entorno inestable | Simulador de pagos propio, buzón en BD (SMTP opcional), ilustraciones SVG generadas por la propia API |
| Diferencias entre entornos | "En local funciona" | Misma imagen y mismo código; configuración validada al arrancar; `GET /api/info` |
| Esquema y migraciones desincronizados | Despliegues rotos | Comprobación `prisma migrate diff --exit-code` en CI |
| Secretos en el repositorio | Seguridad | `.env` ignorados, plantillas `*.example`, secretos en GitHub Secrets |

## 5. Plan por fases y estado

| Fase | Entregables verificables | Estado |
|---|---|---|
| 1. Arquitectura | Monorepo, esquema Prisma y migración, configuración por entorno, Docker Compose | ✅ Completada |
| 2. Catálogo | 168 productos/16 categorías/20 marcas deterministas, home, fichas, búsqueda sin tildes, filtros combinables con facetas, ordenación, paginación, ilustraciones propias | ✅ Completada |
| 3. Usuarios | Registro, login, logout, refresh, sesiones revocables, roles, perfil, direcciones, recuperación de contraseña con buzón simulado | ✅ Completada |
| 4. Compra | Carrito persistente e invitado con fusión, cupones con 9 reglas, checkout transaccional, simulador de pagos (9 escenarios), pedidos, inventario, reservas con caducidad | ✅ Completada |
| 5. Funcionalidades adicionales | Favoritos, reseñas, historial, cancelaciones, devoluciones, panel de administración completo | ✅ Completada |
| 6. API y documentación | OpenAPI de 99 operaciones con esquemas, catálogo de errores, documentación funcional, técnica y de API | ✅ Completada |
| 7. Infraestructura QA | Seeds deterministas, reset, restauración, 27 escenarios, fixtures, faults, buzón, aislamiento por runId, auditoría | ✅ Completada |
| 8. Despliegue | Imagen all-in-one, stack VPS (Caddy + 2 entornos + 2 BD), Render Blueprint, workflows de CI y Release con despliegue SSH | ✅ Preparado · ⏳ **Pendiente de tu acción**: contratar VPS/dominio y configurar secretos (ver DEPLOYMENT.md §6) |
| 9. Validación final | Lint, tipos, 14 tests unitarios, 8 de integración, recorridos E2E por la UI (compra completa, pago rechazado y reintento, pago asíncrono, cancelación, admin), stack Docker y modo demo verificados | ✅ Completada en local · ⏳ Verificación remota tras el despliegue |

## 6. Siguientes pasos sugeridos (no bloqueantes)

- Ejecutar el workflow **Release** y desplegar en el VPS (requiere tu cuenta y secretos).
- Añadir subida de imágenes de producto en el panel admin (hoy se aceptan URLs o se generan ilustraciones).
- Exportar métricas (Prometheus) si quieres practicar pruebas de rendimiento con observabilidad.
- Internacionalización (inglés) si el portfolio lo requiere.
