# Finvu — Financie pod kontrolou

<p align="center">
  <img src="public/logo.svg" alt="Finvu logo" width="80" height="80" />
</p>

<p align="center">
  <strong>Moderná PWA aplikácia na správu rodinných financií</strong><br/>
  Sledujte príjmy, výdavky, sporenie a rozpočet pre celú domácnosť na jednom mieste.
</p>

<p align="center">
  <a href="https://finvu.pedani.eu">🌐 finvu.pedani.eu</a>
</p>

---

## Funkcie

- **Dashboard** — prehľad príjmov, výdavkov a zostatku s heatmapou a donut grafom
- **Variabilné výdavky** — kategorizácia, import z banky (Revolut, Tatra banka, SLSP, mBank, 365.bank)
- **Fixné výdavky** — opakujúce sa platby s upozorneniami pred splatnosťou
- **Sporenie** — ciele s progress trackingom, pozastavenie/obnovenie, deep link
- **Domácnosť** — zdieľané financie, prehľad podľa členov domácnosti
- **Rozpočet** — limity na kategórie, auto-limit z fixných výdavkov, vizuálny progress
- **5 jazykov** — SK, CS, PL, HU, EN s automatickou detekciou jazyka prehliadača
- **PWA** — inštalovateľné na mobile aj desktop, offline podpora
- **Dark / Light mode**
- **Export** — PDF, XLSX, CSV

---

## Demo

| | |
|---|---|
| URL | https://finvu.pedani.eu |
| Email | `demo@finvu.sk` |
| Heslo | `demo123` |

Demo účet je predvyplnený realistickými dátami: príjmy, výdavky, sporenie, domácnosť s členmi.

---

## Tech stack

### Frontend
- **React 19** + **TypeScript 5.8** + **Vite 8**
- **Tailwind CSS 4**
- **i18n** — vlastný typovaný systém (5 jazykov, 413 kľúčov)
- **Recharts** — grafy
- **PWA** — Vite PWA Plugin + Workbox (Service Worker)
- **Export** — jsPDF, xlsx, papaparse

### Backend
- **Node.js** + **Express 5** + **TypeScript 5.8**
- **PostgreSQL 17** + **Drizzle ORM**
- **JWT** (access token v pamäti) + **httpOnly cookie** (refresh token)
- **WebAuthn** (passkeys), Google OAuth, PIN login

### Infraštruktúra
- **Docker** + **Docker Compose** (backend; PostgreSQL beží vo vlastnom kontajneri)
- **GitHub Actions** — automatický CI/CD deploy na každý push na `main`
- **Hetzner VPS** (Debian, CX23) — `api.pedani.eu`
- **nginx** — frontend `finvu.pedani.eu` (statický build na Hetzner VPS)

---

## Lokálny vývoj

### Požiadavky

- Node.js 22+
- PostgreSQL 17 (najľahšie cez Docker)

`docker-compose.yml` je produkčný: spúšťa iba backend a pripája sa na existujúci Postgres kontajner, na lokálny vývoj nie je.

### Databáza

```bash
docker run -d --name finvu-db -p 5432:5432 \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=finance_tracker \
  postgres:17-alpine
```

### Backend (port 3001)

```bash
cd backend
cp .env.example .env
# V .env: v DATABASE_URL zmeniť host "postgres" na "localhost",
# nastaviť tri JWT_*_SECRET (napr. `openssl rand -hex 32`) a ADMIN_PASSWORD.
npm install
npm run db:setup              # prázdna databáza: pôvodná schéma + všetky migrácie
npm run db:seed-demo          # voliteľné: demo@finvu.sk / demo123 s ukážkovými dátami
npm run dev                   # → http://localhost:3001/api/health
```

Bez `SMTP_HOST` sa e-maily neposielajú, iba logujú, takže nový účet si nevie overiť e-mail. Lokálne použi demo účet.

### Frontend (port 5173)

```bash
cd finance-tracker
cp .env.example .env          # VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # → http://localhost:5173
```

### Kontroly

```bash
cd backend && npm run typecheck && npm test
npm run test:integration      # testy prístupových práv, potrebujú DATABASE_URL na testovaciu databázu
cd ../finance-tracker && npm run lint && npx tsc -b --noEmit && npm test
```

### Databázové migrácie

```bash
cd backend
npm run db:migrate            # nové súbory z migrations/ na existujúcu databázu
npm run db:check-schema       # overí, že databáza sedí so src/db/schema.ts
```

Migrácie sú číslované SQL súbory v `backend/migrations/` a na serveri sa spúšťajú automaticky pri deployi (z hosta, nie z kontajnera). `backend/drizzle/` je zmrazená pôvodná schéma, nové zmeny patria len do `backend/migrations/`. Podrobnosti: [DEPLOYMENT.md](../DEPLOYMENT.md), self-hosting a premenné prostredia: [README.md](../README.md).

---

## Deployment

Každý push na vetvu `main` spustí GitHub Actions workflow, ktorý:

1. Spustí lint, typecheck, testy, `npm audit` a overenie schémy na prázdnej databáze
2. Zbuildí frontend na serveri a nasadí statické súbory (`finvu.pedani.eu`)
3. Spustí migrácie a vymení backend Docker kontajner (čaká na healthcheck)

```bash
# Manuálny deploy (záloha, keď nejde GitHub Actions)
./deploy.sh frontend

# Reštart backendu na serveri
docker compose restart backend
```

---

## Autentifikácia

Podporované metódy:

| Metóda | Popis |
|---|---|
| Email + heslo | Štandardná registrácia |
| Google OAuth | Prihlásenie cez Google účet |
| WebAuthn (Passkeys) | Biometria / hardvérový kľúč |
| PIN | Rýchle prihlásenie PIN kódom |
| Demo | Testovací účet bez registrácie |

---

## Licencia

Súkromný projekt. Všetky práva vyhradené.
