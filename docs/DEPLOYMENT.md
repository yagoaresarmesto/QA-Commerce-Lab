# Deploying to the Internet: feasibility study and guide

> **Indicative prices** checked in November 2026 on the providers' websites and recent comparisons (see [Sources](#sources)). Terms change often: **verify them on the official website before signing up**.

## 1. Summary and recommendation

| Question | Answer |
|---|---|
| Is it feasible to host the full application? | **Yes.** It is a lightweight Node + PostgreSQL app: it fits comfortably in 1-2 vCPUs and 2-4 GB of RAM for both environments. |
| Can it be available 24/7? | Yes, with a VPS or paid PaaS services. Free plans **go to sleep** or **expire** (see table). |
| Recommended architecture | **One VPS with Docker Compose**: Caddy (automatic HTTPS) + 2 containers of the same image (`demo` and `testing`) + PostgreSQL with 2 databases and 2 roles. Already prepared in [`deploy/vps`](../deploy/vps). |
| Estimated cost | **~€6-8/month** (VPS 2 vCPU / 4 GB) + optional domain (~€10-15/year). Without a domain: free `sslip.io`-style subdomains. |
| Alternative without managing servers | Railway (Hobby $5/month + usage) or Render (paid web services and Postgres per environment, ~$25-30/month for both). |
| Almost-free alternative | Fly.io (small machine ~$2/month) + Neon Free (serverless Postgres with *autosuspend*). With cold starts and compute limits. |

## 2. How each piece is hosted

The **all-in-one** image (`Dockerfile` at the root) contains the NestJS API **and** the storefront build: the API serves the SPA and `/api/*` on the same origin. Therefore:

- **Frontend + backend**: a single container per environment (no CORS, first-party cookies, one URL for Playwright and Postman).
- **Database**: managed PostgreSQL (Render, Neon, Railway…) or a container with a persistent volume on the VPS.
- **Swagger**: `https://<domain>/api/docs` in both environments (the demo documents the real API; the testing endpoints only appear in testing).
- **HTTPS**: automatic (Caddy on a VPS; included in PaaS).

## 3. Platform comparison

| Option | Approximate price | 24/7 | Postgres | Pros | Cons / limits |
|---|---|---|---|---|---|
| **Hetzner VPS** (CX23: 2 vCPU, 4 GB, 40 GB) | ~€5.49 + €0.50 IPv4/month after the June 2026 price increase (CPX22 as an alternative when out of stock) | ✅ | On the VPS itself | Fixed price, plenty of resources for demo + testing, full control, never sleeps | You manage the server (updates, backups, firewall) |
| **Railway** | Hobby $5/month with $5 of usage included; overage billed by usage | ✅ | Postgres template with a volume | Very easy deployment from GitHub | Variable cost; two environments + 2 databases may exceed the included credit |
| **Render** | Paid Web Starter per service + Postgres from ~$6/month (256 MB) per database; separate workspace plan | ✅ (paid) | Managed | Blueprint included (`render.yaml`), managed backups | Free: the web service sleeps after 15 min (30-60 s cold start) and the free database is **deleted after 30 days** |
| **Fly.io** | shared-cpu-1x 256 MB ≈ $2.19/month (Oct. 2026 prices); Managed Postgres from ~$38/month | ✅ | Expensive managed or external (Neon) | Very cheap for the app | Expensive managed Postgres; no classic free plan |
| **Neon** (database only) | Free: 100 CU-h/project/month, 1 GB per project | ⚠️ Autosuspend (cold start of a few hundred ms) | Serverless | Free, one project per environment | Monthly compute limit; no long backups on free |
| **Supabase** (database only) | Free: 500 MB; Pro $25/month | ⚠️ Free pauses after 1 week of inactivity | Managed | Very complete dashboard | Pauses on free; no automatic backups on free |
| **Koyeb** | Conflicting information in 2026 about the free plan for new accounts | ⚠️ | Postgres with scale-to-zero | | Check the current terms |
| **Oracle Cloud Always Free** | €0 (Ampere A1, reportedly reduced to 2 OCPU / 12 GB in June 2026) | ✅ | On the VM | Free | Irregular capacity availability, risk of idle instances being reclaimed, complex setup |

### Why the VPS?

1. **24/7 with no cold starts**: no test fails because of a timeout on the first request.
2. **Fixed cost** regardless of how many suites you run.
3. Both environments (demo and testing) and their databases fit on one small machine.
4. Reproducible deployment (`docker compose`), automatic HTTPS, backups with `pg_dump`.

## 4. Impact of running hundreds of tests

Estimates for a typical suite (UI + API):

- A UI test generates ~10-40 API requests (HTML/JS/CSS are cached); an API test, 1-10.
- The most expensive operations are password hashing (scrypt, ~50-100 ms of CPU per login/registration) and the checkout (transaction with locks). **Recommendation**: reuse sessions (programmatic login + `storageState`) and create users with the testing API instead of registering them through the UI in every test.
- With 2 vCPUs, the API comfortably handles **4-8 Playwright workers** in parallel; beyond that, the bottleneck is usually the network latency from the GitHub Actions runner, not the server.
- Approximate memory: API 150-250 MB per environment, PostgreSQL 150-300 MB. Total < 1.5 GB for both environments.
- Data: clean up every run (`DELETE /api/test/runs/{runId}`) so the database does not grow; the demo nightly reset keeps it clean.
- There is no rate limiting in testing, so you will not get `429` even if you run hundreds of logins.

## 5. Demo / testing separation

| Aspect | Public demo | Remote testing |
|---|---|---|
| `APP_ENV` | `demo` | `testing` |
| Testing API | **Absent** (module not registered → 404) | Enabled with a secret `TEST_API_KEY` |
| Rate limiting | On (300 req/min per IP; 20/min on login and registration) | Off |
| Global reset | Automatic nightly (`AUTO_RESET_CRON`) | Disabled by default (per-`runId` cleanup) |
| Database | `qacl_demo` with the `qacl_demo` role | `qacl_testing` with the `qacl_testing` role |
| Domain | `demo.<your-domain>` | `testing.<your-domain>` |

Same code and image; only the configuration changes.

## 6. Step-by-step guide (recommended VPS)

### What you need to sign up for or create yourself

1. **A Linux VPS** (Ubuntu 24.04 LTS recommended) with 2 vCPUs and 4 GB of RAM (e.g. Hetzner CX23/CPX22). You will need a card to sign up with the provider.
2. **A domain** (optional). Without a domain you can use `demo.<IP-with-dashes>.sslip.io` and `testing.<IP-with-dashes>.sslip.io`, which resolve to the VPS IP.
3. Access to **GitHub** (the `Release` workflow publishes the image to GitHub Container Registry).

### Steps

```bash
# 1. On your machine: generate an SSH key for automatic deployment
ssh-keygen -t ed25519 -f qacl_deploy -C "qacl-deploy"

# 2. On the VPS (as root or with sudo): Docker + firewall
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cat qacl_deploy.pub >> /home/deploy/.ssh/authorized_keys   # copy the public key
mkdir -p /opt/qa-commerce-lab && chown deploy:deploy /opt/qa-commerce-lab

# 3. As the deploy user: clone the repository and create the configuration files
git clone https://github.com/<user>/qa-commerce-lab.git /opt/qa-commerce-lab
cd /opt/qa-commerce-lab/deploy/vps
cp .env.example .env && cp demo.env.example demo.env && cp testing.env.example testing.env
chmod 600 .env demo.env testing.env
# Edit the three files: domains, e-mail, passwords (openssl rand -base64 32), JWT_SECRET, TEST_API_KEY

# 4. DNS: A records for DEMO_DOMAIN and TESTING_DOMAIN pointing to the VPS IP (not needed with sslip.io)

# 5. First start (the image must exist in GHCR: run the "Release" workflow first)
docker login ghcr.io   # only if the package is private (token with read:packages)
./deploy.sh
```

6. **Automatic deployment** from GitHub: in *Settings → Secrets and variables → Actions* create the secrets `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (contents of `qacl_deploy`), and the variables `DEPLOY_TARGET=vps` and `TESTING_URL=https://testing.<domain>`. Every push to `main` will build the image, publish it and deploy it with a health check.
7. **Backups**: add `30 3 * * * /opt/qa-commerce-lab/deploy/vps/backup.sh >> /var/log/qacl-backup.log 2>&1` to the VPS crontab (keeps 7 days). Regularly copy `/var/backups/qacl` off the server (or enable the provider's snapshots).
8. **Check**: `https://testing.<domain>/api/health/ready`, `https://testing.<domain>/api/info` and `https://demo.<domain>`.

To restore a backup: `docker compose exec -T db pg_restore -U postgres -d qacl_testing --clean < file.dump`.

## 7. PaaS alternative: Render

1. Create an account and connect the GitHub repository.
2. *New → Blueprint* and select the repository: Render reads [`render.yaml`](../render.yaml) and creates `qacl-demo`, `qacl-testing` and their two databases.
3. Fill in `PUBLIC_WEB_URL` for each service with its URL (`https://qacl-testing.onrender.com`…). `TEST_API_KEY` and `JWT_SECRET` are generated automatically: copy `TEST_API_KEY` from the dashboard into your automation repository.
4. Review the plans before applying: the free ones are not suitable for 24/7.

Railway or Fly.io work the same way with the root `Dockerfile`: variables `APP_ENV`, `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_WEB_URL`, `PORT` (and `TEST_API_KEY` in testing). The image applies the migrations and seeds an empty database on start (`SEED_ON_START=if-empty`).

## 8. Operations

| Task | How |
|---|---|
| Logs | `docker compose logs -f testing` (JSON with `requestId` and `testRunId`) |
| Health | `GET /api/health` (liveness), `GET /api/health/ready` (database); built-in Docker healthchecks |
| Migrations | Automatic on container start (`prisma migrate deploy`) |
| Reset the testing environment | `docker compose exec testing node dist/prisma/seed.js --reset` (or `ALLOW_GLOBAL_RESET=true` and `POST /api/test/reset`) |
| Restore reference data | `POST /api/test/seed` |
| Rotate the testing key | Change `TEST_API_KEY` in `testing.env` and run `docker compose up -d testing` |
| Secrets | Only in the server `.env` files (permissions 600) and in GitHub Secrets; never in the repository |

## Sources

Checked in November 2026; indicative figures:

- Render: [render.com/pricing](https://render.com/pricing), [Render Pricing 2026 (temps.sh)](https://temps.sh/blog/render-pricing-2026), [Free PostgreSQL Hosting 2026 (swyftstack)](https://swyftstack.com/blog/free-postgresql-hosting)
- Railway: [docs.railway.com/pricing/plans](https://docs.railway.com/pricing/plans)
- Fly.io: [fly.io/pricing](https://fly.io/pricing), [2026 Pricing Update](https://fly.io/pricing-update/), [Managed Postgres](https://fly.io/docs/mpg)
- Hetzner: [docs.hetzner.com – price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Hetzner Cloud Pricing 2026 (bitdoze)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/)
- Neon: [neon.com/faqs/free-plan-limits-and-quotas](https://neon.com/faqs/free-plan-limits-and-quotas)
- Supabase: [supabase.com/pricing](https://supabase.com/pricing)
- Koyeb: [getdeploying.com/koyeb](https://getdeploying.com/koyeb)
- Oracle Cloud: [docs.oracle.com – Free Tier](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm), [InfoQ – Oracle Cloud free tier limits](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
