# Despliegue en Internet: estudio de viabilidad y guía

> **Precios orientativos** consultados en noviembre de 2026 en las webs de los proveedores y en comparativas recientes (ver [Fuentes](#fuentes)). Las condiciones cambian a menudo: **verifícalas en la web oficial antes de contratar**.

## 1. Resumen y recomendación

| Pregunta | Respuesta |
|---|---|
| ¿Es viable alojar la aplicación completa? | **Sí.** Es una app Node + PostgreSQL ligera: cabe holgadamente en 1-2 vCPU y 2-4 GB de RAM para ambos entornos. |
| ¿Puede estar accesible 24/7? | Sí, con un VPS o servicios PaaS de pago. Los planes gratuitos **se duermen** o **caducan** (ver tabla). |
| Arquitectura recomendada | **Un VPS con Docker Compose**: Caddy (HTTPS automático) + 2 contenedores de la misma imagen (`demo` y `testing`) + PostgreSQL con 2 bases de datos y 2 roles. Ya está preparada en [`deploy/vps`](../deploy/vps). |
| Coste estimado | **~6-8 €/mes** (VPS 2 vCPU / 4 GB) + dominio opcional (~10-15 €/año). Sin dominio: subdominios gratuitos tipo `sslip.io`. |
| Alternativa sin administrar servidores | Railway (Hobby 5 $/mes + consumo) o Render (servicios web y Postgres de pago por entorno, ~25-30 $/mes para los dos). |
| Alternativa casi gratuita | Fly.io (máquina pequeña ~2 $/mes) + Neon Free (Postgres serverless con *autosuspend*). Con arranques en frío y límites de cómputo. |

## 2. Cómo se aloja cada pieza

La imagen **all-in-one** (`Dockerfile` en la raíz) contiene la API NestJS **y** el build del storefront: la API sirve la SPA y `/api/*` en el mismo origen. Por eso:

- **Frontend + backend**: un único contenedor por entorno (sin CORS, cookies first-party, una sola URL para Playwright y Postman).
- **Base de datos**: PostgreSQL gestionado (Render, Neon, Railway…) o un contenedor con volumen persistente en el VPS.
- **Swagger**: `https://<dominio>/api/docs` en ambos entornos (la demo documenta la API real; los endpoints de testing solo aparecen en testing).
- **HTTPS**: automático (Caddy en VPS; incluido en PaaS).

## 3. Comparativa de plataformas

| Opción | Precio aproximado | 24/7 | Postgres | Pros | Contras / límites |
|---|---|---|---|---|---|
| **VPS Hetzner** (CX23: 2 vCPU, 4 GB, 40 GB) | ~5,49 € + 0,50 € IPv4/mes tras la subida de junio 2026 (alternativa CPX22 si no hay stock) | ✅ | En el propio VPS | Precio fijo, recursos de sobra para demo + testing, control total, sin dormirse | Administras tú el servidor (actualizaciones, backups, firewall) |
| **Railway** | Hobby 5 $/mes con 5 $ de consumo incluido; el exceso se cobra por uso | ✅ | Plantilla Postgres con volumen | Despliegue desde GitHub muy sencillo | Coste variable; dos entornos + 2 BD pueden superar el crédito incluido |
| **Render** | Web Starter de pago por servicio + Postgres desde ~6 $/mes (256 MB) por BD; plan de workspace aparte | ✅ (de pago) | Gestionado | Blueprint incluido (`render.yaml`), backups gestionados | Gratis: el servicio web se duerme a los 15 min (30-60 s de arranque en frío) y la BD gratuita se **borra a los 30 días** |
| **Fly.io** | shared-cpu-1x 256 MB ≈ 2,19 $/mes (tarifas oct. 2026); Managed Postgres desde ~38 $/mes | ✅ | Gestionado caro o externo (Neon) | Muy barato para la app | Postgres gestionado caro; sin plan gratuito clásico |
| **Neon** (solo BD) | Free: 100 CU-h/proyecto/mes, 1 GB por proyecto | ⚠️ Autosuspend (arranque en frío de cientos de ms) | Serverless | Gratis, un proyecto por entorno | Límite de cómputo mensual; sin backups largos en free |
| **Supabase** (solo BD) | Free: 500 MB; Pro 25 $/mes | ⚠️ Free se pausa tras 1 semana sin actividad | Gestionado | Panel muy completo | Pausa en free; sin backups automáticos en free |
| **Koyeb** | Información contradictoria en 2026 sobre el plan gratuito para cuentas nuevas | ⚠️ | Postgres con scale-to-zero | | Verificar condiciones actuales |
| **Oracle Cloud Always Free** | 0 € (Ampere A1, reducido según informes a 2 OCPU / 12 GB en junio 2026) | ✅ | En la VM | Gratis | Disponibilidad de capacidad irregular, riesgo de reclamación de instancias inactivas, configuración compleja |

### ¿Por qué el VPS?

1. **24/7 sin arranques en frío**: ningún test falla por timeouts del primer request.
2. **Coste fijo** independientemente de cuántas suites ejecutes.
3. Los dos entornos (demo y testing) y sus bases de datos caben en una sola máquina pequeña.
4. Despliegue reproducible (`docker compose`), HTTPS automático, backups con `pg_dump`.

## 4. Impacto de ejecutar cientos de tests

Estimaciones para una suite típica (UI + API):

- Un test de UI genera ~10-40 peticiones a la API (HTML/JS/CSS se cachean); un test de API, 1-10.
- Las operaciones más costosas son el hash de contraseñas (scrypt, ~50-100 ms de CPU por login/registro) y el checkout (transacción con bloqueos). **Recomendación**: reutilizar sesiones (login programático + `storageState`) y crear usuarios con la API de testing en lugar de registrarlos por la UI en cada test.
- Con 2 vCPU, la API sostiene sin problema **4-8 workers** de Playwright en paralelo; más allá, el cuello de botella suele ser la latencia de red desde el runner de GitHub Actions, no el servidor.
- Memoria aproximada: API 150-250 MB por entorno, PostgreSQL 150-300 MB. Total < 1,5 GB para los dos entornos.
- Datos: limpia cada ejecución (`DELETE /api/test/runs/{runId}`) para que la BD no crezca; el nightly reset de la demo la mantiene limpia.
- No hay rate limiting en testing, por lo que no habrá `429` aunque lances cientos de logins.

## 5. Separación demo / testing

| Aspecto | Demo pública | Testing remoto |
|---|---|---|
| `APP_ENV` | `demo` | `testing` |
| API de testing | **Inexistente** (módulo no registrado → 404) | Habilitada con `TEST_API_KEY` secreta |
| Rate limiting | Activo (300 req/min por IP; 20/min en login y registro) | Desactivado |
| Reset global | Automático nocturno (`AUTO_RESET_CRON`) | Deshabilitado por defecto (limpieza por `runId`) |
| Base de datos | `qacl_demo` con rol `qacl_demo` | `qacl_testing` con rol `qacl_testing` |
| Dominio | `demo.<tu-dominio>` | `testing.<tu-dominio>` |

Mismo código e imagen; solo cambia la configuración.

## 6. Guía paso a paso (VPS recomendado)

### Requisitos que tienes que contratar o crear tú

1. **Un VPS** Linux (Ubuntu 24.04 LTS recomendado) con 2 vCPU y 4 GB de RAM (ej. Hetzner CX23/CPX22). Necesitarás tarjeta para darte de alta en el proveedor.
2. **Dominio** (opcional). Sin dominio puedes usar `demo.<IP-con-guiones>.sslip.io` y `testing.<IP-con-guiones>.sslip.io`, que resuelven a la IP del VPS.
3. Acceso a **GitHub** (el workflow `Release` publica la imagen en GitHub Container Registry).

### Pasos

```bash
# 1. En tu máquina: genera una clave SSH para el despliegue automático
ssh-keygen -t ed25519 -f qacl_deploy -C "qacl-deploy"

# 2. En el VPS (como root o con sudo): Docker + firewall
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cat qacl_deploy.pub >> /home/deploy/.ssh/authorized_keys   # copia la clave pública
mkdir -p /opt/qa-commerce-lab && chown deploy:deploy /opt/qa-commerce-lab

# 3. Como usuario deploy: clona el repositorio y crea los ficheros de configuración
git clone https://github.com/<usuario>/qa-commerce-lab.git /opt/qa-commerce-lab
cd /opt/qa-commerce-lab/deploy/vps
cp .env.example .env && cp demo.env.example demo.env && cp testing.env.example testing.env
chmod 600 .env demo.env testing.env
# Edita los tres ficheros: dominios, email, contraseñas (openssl rand -base64 32), JWT_SECRET, TEST_API_KEY

# 4. DNS: registros A de DEMO_DOMAIN y TESTING_DOMAIN apuntando a la IP del VPS (no necesario con sslip.io)

# 5. Primer arranque (la imagen debe existir en GHCR: ejecuta antes el workflow "Release")
docker login ghcr.io   # solo si el paquete es privado (token con read:packages)
./deploy.sh
```

6. **Despliegue automático** desde GitHub: en *Settings → Secrets and variables → Actions* crea los secretos `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (contenido de `qacl_deploy`), y las variables `DEPLOY_TARGET=vps` y `TESTING_URL=https://testing.<dominio>`. Cada push a `main` construirá la imagen, la publicará y la desplegará con comprobación de salud.
7. **Backups**: añade al crontab del VPS `30 3 * * * /opt/qa-commerce-lab/deploy/vps/backup.sh >> /var/log/qacl-backup.log 2>&1` (guarda 7 días). Copia periódicamente `/var/backups/qacl` fuera del servidor (o activa los snapshots del proveedor).
8. **Comprobación**: `https://testing.<dominio>/api/health/ready`, `https://testing.<dominio>/api/info` y `https://demo.<dominio>`.

Para restaurar un backup: `docker compose exec -T db pg_restore -U postgres -d qacl_testing --clean < fichero.dump`.

## 7. Alternativa PaaS: Render

1. Crea una cuenta y conecta el repositorio de GitHub.
2. *New → Blueprint* y selecciona el repositorio: Render leerá [`render.yaml`](../render.yaml) y creará `qacl-demo`, `qacl-testing` y sus dos bases de datos.
3. Rellena `PUBLIC_WEB_URL` de cada servicio con su URL (`https://qacl-testing.onrender.com`…). `TEST_API_KEY` y `JWT_SECRET` se generan automáticamente: copia `TEST_API_KEY` desde el panel para tu repositorio de automatización.
4. Revisa los planes antes de aplicar: los gratuitos no son aptos para 24/7.

Railway o Fly.io funcionan igual con el `Dockerfile` raíz: variables `APP_ENV`, `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_WEB_URL`, `PORT` (y `TEST_API_KEY` en testing). La imagen aplica las migraciones y siembra la BD vacía al arrancar (`SEED_ON_START=if-empty`).

## 8. Operación

| Tarea | Cómo |
|---|---|
| Logs | `docker compose logs -f testing` (JSON con `requestId` y `testRunId`) |
| Salud | `GET /api/health` (liveness), `GET /api/health/ready` (BD); healthchecks Docker integrados |
| Migraciones | Automáticas al arrancar el contenedor (`prisma migrate deploy`) |
| Reset del entorno de testing | `docker compose exec testing node dist/prisma/seed.js --reset` (o `ALLOW_GLOBAL_RESET=true` y `POST /api/test/reset`) |
| Restaurar datos de referencia | `POST /api/test/seed` |
| Rotar la clave de testing | Cambia `TEST_API_KEY` en `testing.env` y `docker compose up -d testing` |
| Secretos | Solo en los `.env` del servidor (permisos 600) y en GitHub Secrets; nunca en el repositorio |

## Fuentes

Consultadas en noviembre de 2026; cifras orientativas:

- Render: [render.com/pricing](https://render.com/pricing), [Render Pricing 2026 (temps.sh)](https://temps.sh/blog/render-pricing-2026), [Free PostgreSQL Hosting 2026 (swyftstack)](https://swyftstack.com/blog/free-postgresql-hosting)
- Railway: [docs.railway.com/pricing/plans](https://docs.railway.com/pricing/plans)
- Fly.io: [fly.io/pricing](https://fly.io/pricing), [2026 Pricing Update](https://fly.io/pricing-update/), [Managed Postgres](https://fly.io/docs/mpg)
- Hetzner: [docs.hetzner.com – price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Hetzner Cloud Pricing 2026 (bitdoze)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/)
- Neon: [neon.com/faqs/free-plan-limits-and-quotas](https://neon.com/faqs/free-plan-limits-and-quotas)
- Supabase: [supabase.com/pricing](https://supabase.com/pricing)
- Koyeb: [getdeploying.com/koyeb](https://getdeploying.com/koyeb)
- Oracle Cloud: [docs.oracle.com – Free Tier](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm), [InfoQ – Oracle Cloud free tier limits](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
