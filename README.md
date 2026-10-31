# Finvu — Finances under control

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

<p align="center">
  <img src="finance-tracker/public/logo.svg" alt="Finvu logo" width="80" height="80" />
</p>

<p align="center">
  <strong>A modern PWA app for managing household finances</strong><br/>
  Track income, expenses, savings and budget for your entire household in one place.
</p>

<p align="center">
  <a href="https://finvu.pedani.eu">🌐 finvu.pedani.eu</a>
</p>

---

## Features

- **Dashboard** — overview of income, expenses and balance with a heatmap and donut chart
- **Variable expenses** — categorisation, bank import (Revolut, Tatra banka, SLSP, mBank, 365.bank)
- **Fixed expenses** — recurring payments with due-date reminders
- **Savings** — goals with progress tracking, pause/resume, deep link
- **Household** — shared finances, per-member breakdown
- **Budget** — category limits, auto-limit from fixed expenses, visual progress
- **5 languages** — SK, CS, PL, HU, EN with automatic browser language detection
- **PWA** — installable on mobile and desktop, offline support
- **Dark / Light mode**
- **Export** — PDF, XLSX, CSV

---

## Demo

| | |
|---|---|
| URL | https://finvu.pedani.eu |
| Email | `demo@finvu.sk` |
| Password | `demo123` |

The demo account is pre-filled with realistic data: income, expenses, savings, and household members.

---

## Tech stack

### Frontend
- **React 19** + **TypeScript 5.8** + **Vite 8**
- **Tailwind CSS 4**
- **i18n** — custom typed system (5 languages, 413 keys)
- **Recharts** — charts
- **PWA** — Vite PWA Plugin + Workbox (Service Worker)
- **Export** — jsPDF, xlsx, papaparse

### Backend
- **Node.js** + **Express 5** + **TypeScript 5.8**
- **PostgreSQL 17** + **Drizzle ORM**
- **JWT** (access token in memory) + **httpOnly cookie** (refresh token)
- **WebAuthn** Google OAuth, PIN login

### Infrastructure
- **Docker** + **Docker Compose** (backend; PostgreSQL runs in its own container)
- **GitHub Actions** — automatic CI/CD deploy on every push to `main`
- **VPS server** (backend API)
- Frontend: https://finvu.pedani.eu

---

## Local development

### Requirements

- Node.js 22+
- PostgreSQL 17 (any way you like; Docker is the easiest)

`docker-compose.yml` is the production setup: it only runs the backend and joins an existing Postgres container, so it is not meant for local development.

### Database

```bash
docker run -d --name finvu-db -p 5432:5432 \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=finance_tracker \
  postgres:17-alpine
```

### Backend (port 3001)

```bash
cd backend
cp .env.example .env
# In .env: change the DATABASE_URL host from "postgres" to "localhost",
# and set the three JWT_*_SECRET values (e.g. `openssl rand -hex 32`) and ADMIN_PASSWORD.
npm install
npm run db:setup              # empty database: legacy schema + all migrations
npm run db:seed-demo          # optional: demo@finvu.sk / demo123 with sample data
npm run dev                   # → http://localhost:3001/api/health
```

Without `SMTP_HOST` e-mails are not sent, only logged, so a newly registered account can't verify its e-mail. Use the demo account locally.

### Frontend (port 5173)

```bash
cd finance-tracker
cp .env.example .env          # VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # → http://localhost:5173
```

In development the backend accepts requests from `http://localhost:5173` and `http://localhost:3000`.

### Checks

```bash
cd backend && npm run typecheck && npm test
npm run test:integration      # access control tests, need DATABASE_URL to a throw-away database
cd ../finance-tracker && npm run lint && npx tsc -b --noEmit && npm test
```

### Database migrations

```bash
cd backend
npm run db:migrate            # apply new files from migrations/ to an existing database
npm run db:check-schema       # check that the database matches src/db/schema.ts
```

Migrations are numbered SQL files in `backend/migrations/`. `backend/drizzle/` is the frozen legacy schema; add new changes only to `backend/migrations/`. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Self-hosting

### Requirements

- VPS with min. **2 GB RAM** (4 GB recommended)
- **Docker** + **Docker Compose** (v2)
- **Nginx** as reverse proxy
- Own domain and SSL certificate (Certbot)

### Step-by-step setup

The repository is set up for one server (finvu.pedani.eu). Before you run it on your own domain:

- `docker-compose.yml` joins an external network `finance-tracker_default` and a Postgres container named `finance-tracker-postgres-1`. Run Postgres 17 under those names or edit the file.
- The production CORS origin is hardcoded to `https://finvu.pedani.eu` in `backend/src/index.ts`. Change it to your frontend URL.
- `nginx/` has the configs used in production.

**1. Clone the repository**

```bash
git clone https://github.com/hroomnik007/Finvu.git
cd Finvu
```

**2. Configure environment files**

```bash
cp backend/.env.example backend/.env
nano backend/.env            # NODE_ENV=production, APP_URL, secrets, SMTP

cp finance-tracker/.env.example finance-tracker/.env
nano finance-tracker/.env    # VITE_API_URL=https://api.yourdomain.com
```

**3. Create the database schema**

The backend image doesn't contain the legacy schema, so run this from the repository on the host, with `DATABASE_URL` pointing at your Postgres:

```bash
cd backend && npm ci
DATABASE_URL=postgresql://... npm run db:setup     # first time
DATABASE_URL=postgresql://... npm run db:migrate   # every update after that
```

**4. Start the backend and build the frontend**

```bash
docker compose up -d --build backend     # → 127.0.0.1:3001
cd finance-tracker && npm ci && npm run build   # serve dist/ with nginx
```

**5. Nginx — example configuration**

```nginx
# /etc/nginx/sites-available/api.yourdomain.com
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
}
```

**6. SSL certificate (Certbot)**

```bash
certbot --nginx -d api.yourdomain.com -d yourdomain.com
```

### Environment variables

#### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`postgresql://user:pass@postgres:5432/db` in Docker, `@localhost` locally) |
| `JWT_ACCESS_SECRET` | ✅ | Secret key for access tokens (min. 32 characters) |
| `JWT_REFRESH_SECRET` | ✅ | Secret key for refresh tokens (min. 32 characters) |
| `JWT_ADMIN_SECRET` | ✅ | Secret key for admin tokens (min. 32 characters) |
| `ADMIN_USERNAME` | — | Admin area username (default `admin`) |
| `ADMIN_PASSWORD` | ✅ | Admin area password (min. 12 characters) |
| `PORT` | — | Backend port (default `3001`) |
| `NODE_ENV` | — | `production` on the server (secure cookies, production CORS origin), `development` locally |
| `BCRYPT_ROUNDS` | — | Number of bcrypt rounds (default `12`) |
| `APP_URL` | — | Frontend URL, used in e-mail links (default `https://finvu.pedani.eu`) |
| `SMTP_HOST` | — | SMTP server for e-mails; without it e-mails are only logged |
| `SMTP_PORT` | — | SMTP port (default `587`) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address (default `noreply@finvu.pedani.eu`) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth Client ID; without it Google sign-in answers 503 |
| `WEBAUTHN_ORIGIN` | — | WebAuthn origin (default: origin of `APP_URL`) |
| `WEBAUTHN_RP_ID` | — | WebAuthn relying party ID (default: host of `APP_URL`) |
| `UPLOAD_DIR` | — | Where avatars are stored (default `uploads`) |

#### Frontend (`finance-tracker/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | — | Backend URL (default `http://localhost:3001`) |
| `VITE_GOOGLE_CLIENT_ID` | — | Same Google Client ID as the backend, to show Google sign-in |
| `VITE_BASE_URL` | — | Base path of the app (default `/`) |

### Automated deployment (CI/CD)

`.github/workflows/deploy.yml` runs the checks and deploys to the original server on every push to `main`. In a fork it needs the secrets `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `DATABASE_URL` and `VITE_VAPID_PUBLIC_KEY`, and the paths and API URL in the workflow changed to yours. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Authentication

Supported methods:

| Method | Description |
|---|---|
| Email + password | Standard registration |
| Google OAuth | Sign in with Google account |
| PIN | Quick PIN login |
| Demo | Test account without registration |

---

## License

This project is licensed under the GNU Affero General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
