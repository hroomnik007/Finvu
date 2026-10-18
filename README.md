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
- **Docker** + **Docker Compose** (backend + PostgreSQL)
- **GitHub Actions** — automatic CI/CD deploy on every push to `main`
- **VPS server** (backend API)
- Frontend: https://finvu.pedani.eu

---

## Local development

### Requirements

- Node.js 22+
- Docker + Docker Compose

### Frontend

```bash
cd finance-tracker
cp .env.example .env          # set VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # → http://localhost:5173
```

### Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, etc.
docker compose up -d postgres # start database only
npm install
npm run db:setup              # empty database: legacy schema + all migrations
npm run dev                   # → http://localhost:3001
```

### Database migrations

```bash
# Local (existing database)
npm run db:migrate

# Production (inside Docker container)
docker exec <backend-container> node dist/scripts/migrate.js
```

Migrations are numbered SQL files in `backend/migrations/` and run automatically on deploy. `backend/drizzle/` is the frozen legacy schema; add new changes only to `backend/migrations/`. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Self-hosting

### Requirements

- VPS with min. **2 GB RAM** (4 GB recommended)
- **Docker** + **Docker Compose** (v2)
- **Nginx** as reverse proxy
- Own domain and SSL certificate (Certbot)

### Step-by-step setup

**1. Clone the repository**

```bash
git clone https://github.com/hroomnik/finvu.git
cd finvu
```

**2. Configure environment files**

```bash
# Backend
cp backend/.env.example backend/.env
nano backend/.env

# Frontend
cp finance-tracker/.env.example finance-tracker/.env
nano finance-tracker/.env   # set VITE_API_URL=https://api.yourdomain.com
```

**3. Start containers**

```bash
docker compose up -d
```

**4. Run database migrations**

```bash
docker exec finvu-backend-1 node dist/scripts/migrate.js
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
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`postgresql://user:pass@postgres:5432/db`) |
| `JWT_ACCESS_SECRET` | ✅ | Secret key for access tokens (min. 32 characters) |
| `JWT_REFRESH_SECRET` | ✅ | Secret key for refresh tokens (min. 32 characters) |
| `JWT_ADMIN_SECRET` | ✅ | Secret key for admin tokens (min. 32 characters) |
| `ADMIN_USERNAME` | ✅ | Admin account username |
| `ADMIN_PASSWORD` | ✅ | Admin account password (min. 12 characters) |
| `PORT` | — | Backend port (default `3001`) |
| `NODE_ENV` | — | `production` or `development` |
| `BCRYPT_ROUNDS` | — | Number of bcrypt rounds (default `12`) |
| `APP_URL` | — | Frontend URL (default `https://finvu.pedani.eu`) |
| `SMTP_HOST` | — | SMTP server for emails |
| `SMTP_PORT` | — | SMTP port (default `587`) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Email sender address |
| `GOOGLE_CLIENT_ID` | — | Google OAuth Client ID (if you want Google login) |
| `WEBAUTHN_ORIGIN` | — | WebAuthn origin (`https://yourdomain.com`) |
| `WEBAUTHN_RP_ID` | — | WebAuthn relying party ID (`yourdomain.com`) |

#### Frontend (`finance-tracker/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | Backend URL (`https://api.yourdomain.com`) |

### Automated deployment (CI/CD)

If you fork this repository, GitHub Actions will automatically build and deploy the app on every push to `main`. No manual steps are required after the initial server setup.

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
