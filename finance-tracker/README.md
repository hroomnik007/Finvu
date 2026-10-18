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
- **Docker** + **Docker Compose** (backend + PostgreSQL)
- **GitHub Actions** — automatický CI/CD deploy na každý push na `main`
- **Hetzner VPS** (Debian, CX23) — `api.pedani.eu`
- **nginx** — frontend `finvu.pedani.eu` (statický build na Hetzner VPS)

---

## Lokálny vývoj

### Požiadavky

- Node.js 22+
- Docker + Docker Compose

### Frontend

```bash
cd finance-tracker
cp .env.example .env          # nastaviť VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # → http://localhost:5173
```

### Backend

```bash
cd backend
cp .env.example .env          # nastaviť DATABASE_URL, JWT_SECRET, atď.
docker compose up -d postgres # spustiť iba databázu
npm install
npm run db:setup              # prázdna databáza: pôvodná schéma + všetky migrácie
npm run dev                   # → http://localhost:3001
```

### Databázové migrácie

```bash
# Lokálne (existujúca databáza)
npm run db:migrate

# Produkcia (v Docker kontajneri)
docker exec finance-tracker-repo-backend-1 node dist/scripts/migrate.js
```

Migrácie sú číslované SQL súbory v `backend/migrations/` a spúšťajú sa automaticky pri deployi. `backend/drizzle/` je zmrazená pôvodná schéma, nové zmeny patria len do `backend/migrations/`. Podrobnosti: [DEPLOYMENT.md](../DEPLOYMENT.md).

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
