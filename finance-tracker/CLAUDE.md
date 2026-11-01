# Finvu 2026 v3 — CLAUDE.md

## Povinné pravidlo pre každý prompt
Na začiatku každého promptu si prečítaj tento CLAUDE.md súbor celý, pred tým ako začneš akúkoľvek prácu. Toto zabezpečí že poznáš aktuálnu štruktúru projektu, konvencie a gotchas bez toho aby si musel hľadať súbory manuálne.

---

## O projekte
PWA aplikácia na sledovanie rodinných financií. Mobile-first, privacy-first.
Inšpirovaná Monarch Money. Hostovaná na `pedani.eu` (Hetzner CX23).
Aktuálna verzia: **Finvu 2026 v3**, vizuál je Aurora design system: CSS premenné `--aurora-*` v `src/index.css`. Fonty (`@theme` v `index.css`): DM Sans (`--font-sans`, základný text), DM Mono (`--font-mono`), Outfit (`--font-outfit`) a Manrope (`--font-manrope`) pre Aurora komponenty, Plus Jakarta Sans (`--font-landing`) pre landing.

## Tech Stack

### Frontend
- React 19 + TypeScript 5.7 + Vite 8
- Tailwind CSS 4 (Vite plugin)
- Recharts — grafy
- Vite PWA Plugin + Workbox — offline/PWA
- jsPDF + xlsx + papaparse — export (PDF, XLSX, CSV)
- CSV import: Revolut, Tatra banka, SLSP, mBank, 365.bank (via CsvImportModal)
- i18n — SK / CS / PL / HU / EN (5 jazykov, auto-detekcia pri prvej návšteve)

### Autentifikácia
- WebAuthn (passkeys)
- Google OAuth
- PIN login
- JWT — Bearer token v pamäti (nie localStorage)
- Refresh token — httpOnly cookie
- Token refresh queue pre súbežné 401 requesty

### Dátová vrstva
- REST API cez axios (`src/api/client.ts`)
- Backend: `https://api.pedani.eu` (Hetzner CX23)
- Dev: `http://localhost:3001` (VITE_API_URL env)

## Štruktúra projektu
Pevné počty súborov sa tu nevedú (zastarávali) — aktuálny stav zisti cez `ls`.
```
finance-tracker/src/
├── api/          # axios klient (client.ts: interceptory, token refresh) + jeden modul na oblasť
│                 # (auth, transactions, allTransactions, categories, savings, households, admin, …)
├── components/   # zdieľané React komponenty (GlassCard, HeroCard, CategoryDonutCard, BottomSheet, …)
├── pages/        # jedna stránka na route/sekciu
├── hooks/        # custom hooky
├── context/      # React kontexty (Auth, Settings, PinLock, …)
├── i18n/         # preklady sk/en/cs/pl/hu + index.ts
├── types/        # TypeScript typy
└── utils/        # pomocné funkcie (format.ts, parsery CSV výpisov, …)
```

## Auth flows (implementované)
- login / register / logout / refreshToken / getMe
- verifyEmail / forgotPassword / resetPassword
- googleLogin / pinLogin / savePin / deletePin
- adminLogin
- WebAuthn register + authenticate (options + verify)
- updateAvatar / updateWeeklyEmail / updateUserSettings
- createSharedReport / getSharedReport
- deleteAccount

## Internacionalizácia (i18n)

- **5 jazykov**: SK (primárny), CS, PL, HU, EN
- **Súbory**: `finance-tracker/src/i18n/{sk,en,cs,pl,hu}.ts` (5 súborov)
- **Štruktúra**: všetkých 5 súborov musí mať **identickú štruktúru** zodpovedajúcu `typeof sk` — TypeScript to vynucuje cez `satisfies`
- **Hook**: `useTranslation()` vracia `{ t: Translations }` — `t` je priamy objekt SK/CS/PL/HU/EN podľa aktívneho jazyka
- **Auto-detekcia**: pri prvej návšteve sa jazyk deteguje z prehliadača (i18next-browser-languagedetector alebo `navigator.language`)
- **Uloženie preferencie**: jazyk sa ukladá do DB (`users.language`, migrácia 014) aj do `localStorage`
- **Language switcher**: `src/components/LanguageSwitcher.tsx` — 2 varianty:
  - `compact` — na Login/Register stránke (top-right, tmavé sklo, zobrazuje vlajka + kód + chevron)
  - `full` — v Settings → Financie → Jazyk (celá šírka, zobrazuje vlajka + celý názov)
  - Dropdown používa `position: fixed` s `getBoundingClientRect()` aby unikol `overflow: hidden` z `SectionCard`
- **Tagline na Login stránke**: `{t.nav.appTagline.toUpperCase()}` — nie hardcoded string

## Príkazy
```bash
cd finance-tracker
npm run dev       # dev server → http://localhost:5173 (API → localhost:3001)
npm run build     # produkčný build
npm run preview   # preview buildu
```

## Deployment
- Frontend: statický build na serveri (nginx), nasadzuje GitHub Actions
- Backend: Hetzner CX23, `https://api.pedani.eu`
- **Produkčné nasadenie robí výlučne GitHub Actions** (`.github/workflows/deploy.yml`, popis v `DEPLOYMENT.md`) po pushi na `main`: job `lint` (ESLint, typecheck, testy, npm audit, kontrola schémy) a potom `deploy-frontend` (ak sa zmenilo `finance-tracker/**`) a `deploy-backend` (ak sa zmenilo `backend/**`). Workflow sa dá spustiť aj ručne (`workflow_dispatch`)
- `deploy.sh` v root adresári je len ručná záloha pre prípad, že GitHub Actions nie sú dostupné. **`deploy.sh` ani iné nasadzovacie skripty sa nespúšťajú proti produkcii bez výslovného pokynu majiteľa**
- Konfigurácia nginx (`nginx/*.conf`) sa cez CI nenasadzuje (pozri `DEPLOYMENT.md`)

## Databázové migrácie

Migrácie sú číslované SQL súbory v `backend/migrations/` (posledná v čase písania je 036; vždy over cez `ls backend/migrations`), spúšťa ich `backend/src/scripts/migrate.ts` (`npm run db:migrate`) pri každom deployi v GitHub Actions. Nová migrácia = **ďalšie číslo** za poslednou a patrí **len do `backend/migrations/`**. `backend/drizzle/` je zmrazená pôvodná schéma (len pre prázdnu databázu cez `npm run db:setup`) — **nič do nej nepridávať**. CI overuje, že schéma postavená od nuly zodpovedá `backend/src/db/schema.ts` (`npm run db:check-schema`).

**Spustenie migrácií v produkcii** (vnútri Docker kontajnera):
```bash
docker exec finance-tracker-repo-backend-1 node dist/scripts/migrate.js
```
- Migrácie musia byť **skopírované do produkčného Dockerfile stage** (COPY migrations) — inak nie sú dostupné v kontajneri
- Len GitHub remote (`origin`) je relevantný pre server-side git operácie — Gitea je LAN-only a server ho nedosiahne

## Pravidlá pre Claude

## Modul Sporenie

- **API endpointy**: `GET/POST /api/savings`, `PATCH /api/savings/:id`, `DELETE /api/savings/:id`
- **Pozastaviť/Obnoviť**: `PATCH /api/savings/:id/pause` a `/resume` — nastavujú `paused` boolean v DB
  - Pozastavené ciele preskakujú mesačné prevody a notifikácie
  - UI: oranžový badge `POZASTAVENÉ` na karte aj v detail modali; tlačidlo prepína medzi `Pozastaviť`/`Obnoviť`
- **Deep link**: otvorenie detailu cieľa zapíše `#sporenie?id=GOAL_ID` do URL
  - F5 / zdieľanie URL: `useEffect` v `SavingsPage` pri načítaní goals skontroluje hash parameter `?id=` a auto-otvorí detail
  - `App.tsx → getPageFromHash()` stripuje query params (`split('?')[0]`), takže `#sporenie?id=X` zostane na savings stránke
- **SavingsDetailModal**: `maxHeight: 90svh` (iOS safe area), `WebkitOverflowScrolling: touch`, bottom padding `env(safe-area-inset-bottom)`
- **Hook**: `useSavings` — exportuje `{ goals, addGoal, updateGoal, deleteGoal, pauseGoal, resumeGoal, reload }`

## Modul Kategórie

- **auto_limit**: boolean stĺpec na `categories` — keď `true`, budget limit kategórie sa automaticky vypočítava zo sumy fixných výdavkov priradených tej kategórii
- Prepočítava sa pri každom vytvorení / aktualizácii / zmazaní fixného výdavku
- Ak používateľ nastaví manuálny limit na kategórii s `auto_limit = true`, dostane varovanie

## Modul Profil

- **Úspory stat**: suma všetkých `savedAmount` naprieč savings goals; zobrazuje `—` keď žiadne ciele neexistujú (nie `0 €`)
- **Telefón**: pole bolo odstránené z UI aj save logiky
- **Krajina**: SK, CZ, HU, PL, GB (Veľká Británia) — AT a DE boli odstránené
- **Jazyk**: zmena jazyka v Profile/Settings ukladá preferenicu do DB (`users.language`)
- **Štatistiky v hlavičke**: počet transakcií (z API), celkové sporenie, dátum registrácie

## Onboarding

- **7 krokov**: Vitajte → Príjmy → Výdavky → Sporenie → Domácnosť → Nastavenia → Spôsob prihlásenia
- **Budget template**: výber šablóny **nahradí** existujúce kategórie (nie pridá k nim) — `replaceCategories` flag
- **"Preskočiť" na template kroku**: zachová default kategórie nezmenené
- Onboarding sa zobrazí len raz — stav sleduje `user.onboarding_complete` (DB) a `user.onboarding_banner_dismissed`

## Lokálne overovanie (demo účet neexistuje)

Demo účet bol zrušený (2026-11-01) a z kódu aj databázy odstránený. Lokálne sa overuje cez seed vývojového používateľa:

- **Seed**: `cd backend && npm run db:seed-dev-user` (`backend/src/scripts/seed-dev-user.ts`), idempotentný
- **Email**: `dev@finvu.local`, **heslo**: `DevPass123!` (len lokálna DB; údaje sa nedávajú do README)
- Bežný účet s overeným e-mailom (bez SMTP), bez domácnosti. Dáta: kategórie, 3 mesiace transakcií, fixný výdavok (Nájom) a opakujúci sa príjem (Výplata)
- Skript odmietne beh pri `NODE_ENV=production` aj pri `DATABASE_URL` mimo `localhost`/`127.0.0.1`

### Kód
- Vždy TypeScript — žiadny `any`, žiadne implicitné typy
- Komponenty: funkcionálne + hooks, žiadne class components
- **Štýlovanie (ako to v appke naozaj funguje)**: dominuje inline `style={{…}}` s CSS premennými (v `src/` je ~2000 `style={` v 69 súboroch; Tailwind triedy sú vzácne, väčšinou len layout utility ako `flex`, `grid`, `hidden lg:flex`). Globálne štýly sú v `src/index.css` (Tailwind import, `--aurora-*` tokeny pre dark aj light, ~110 pomenovaných tried, napr. `.dense-card`, `.btn-primary`, `.input`)
  - **Farby, pozadia, okraje a tiene vždy cez tokeny** (`var(--aurora-glass)`, `--aurora-gline`, `--aurora-hi/lo/faint`, `--aurora-hover`, `--aurora-card-shadow`, akcenty `--aurora-violet/emerald/rose/amber/cyan`) — nikdy hardcoded hex/rgba, inak sa rozbije light mode
  - **Najprv použi zdieľaný komponent**: `GlassCard` (sklenená karta), `HeroCard`, `CategoryDonutCard`, `DenseList` (`.dense-card`), `BottomSheet`/`CompactModal`, `ConfirmDialog`. Nový vzhľad karty nepíš odznova, rozšír tieto
  - **Pomenovaná trieda v `index.css`** patrí tam, kde inline štýl nevie: `:hover`/`@media (hover: hover)`, media queries (`.dt-only`, `.mb-only`), pseudo-elementy, animácie, štýly opakované v mnohých súboroch
  - **Inline štýl** je v poriadku pre hodnoty závislé od props/stavu/dát (farba kategórie, šírka progress baru, `transform`), pre jednorazové rozmery a pre `style` override na zdieľanom komponente (`<GlassCard style={{ padding: 20 }}>`)
  - **Tailwind utility triedy** na jednoduchý layout a responzivitu (`flex`, `grid`, `gap-*`, `hidden lg:flex`); nemiešať Tailwind a inline štýl pre tú istú vlastnosť
- Mobile-first — každý komponent najprv pre mobil
- Všetky UI texty cez i18n — žiadne hardcoded strings v SK ani EN

### API a dáta
- Všetky API volania cez `src/api/client.ts` — nikdy priamy fetch/axios mimo klienta
- **Dátumy**: nikdy `toISOString().slice(0, 10)` na „dnes“ (je to UTC, o polnoci dá zlý deň). Frontend používa `todayISO()` / `toLocalISO()` z `src/utils/format.ts`, backend `localDateISO()` z `backend/src/lib/localDate.ts`
- **Zoznamy transakcií**: nikdy jedna požiadavka s `limit: 200` (server vráti max. 200 riadkov). Používa sa `getAllTransactions` (`src/api/allTransactions.ts`), ktorá stránkuje
- Token nikdy do localStorage — iba pamäť (access) + httpOnly cookie (refresh)
- `household_enabled` sa ukladá do DB (`users.household_enabled`) — nie len localStorage
- Stav domácnosti sa číta z `user.household_enabled` (AuthContext) — nie localStorage
- Avatar (fotka) sa ukladá ako súbor na disku (`uploads/avatars/<userId>.<ext>`, Docker volume `uploads_data`); DB (`users.avatar_url`) drží len cestu `/uploads/avatars/…?v=<ts>`. Emoji avatar sa ukladá priamo ako string, prázdny string avatar zmaže. Frontend rieši URL cez `utils/avatar.ts` (`isPhotoUrl`, `avatarSrc`)
- Theme preference: ukladá sa do DB aj localStorage cache

### Deploy
- Server: pedani.eu (Hetzner CX23); nasadenie robí GitHub Actions (pozri sekciu Deployment vyššie), nie ručný `deploy.sh`
- `.npmrc` má `legacy-peer-deps=true` kvôli vite-plugin-pwa@1.2/vite@8 konfliktu
- Do gitu pridávaj **len konkrétne upravené súbory explicitne** (`git add cesta/k/súboru …`), nikdy `git add -A` ani `git commit -a` — priečinok `rev/` v koreni repozitára je cudzí a untracked. Potom `git commit` a push na `origin` aj `gitea`
- git remotes: `origin` = GitHub (triggers Actions), `gitea` = self-hosted Gitea
- VŽDY pushuj na oba: `git push origin main && git push gitea main`
- Ak je `gitea` nedostupná, uveď to v zhrnutí a remote nemeň (ani URL, ani token)
- GitHub Actions automaticky nasadí na pedani.eu pri každom push na origin/main

### Štýl práce
- Surgical changes — meniť len čo je potrebné, nič navyše
- Pred implementáciou: krátky plán čo sa zmení a prečo
- Po každej zmene: overiť že `npm run build` prebehne bez chýb
- Pri nejasnostiach: opýtať sa, nie hádať

### Čo netreba vysvetľovať každú session
- Projekt je PWA rodinný finance tracker, backend na api.pedani.eu
- Frontend volá REST API cez axios klienta, nie Dexie
- Auth: WebAuthn + Google OAuth + PIN + JWT/httpOnly cookies
- Žiadny TweaksPanel — bol odstránený
- Notifikácie (NotificationCenter.tsx): jeden server-computed feed `GET /api/notifications/feed?today=YYYY-MM-DD` (kind + params, texty sa prekladajú na klientovi vo `feedItemToNotification`); read stav sa persistuje do `localStorage` kľúča `finvu_read_notifications`
- Topbar má `NotificationCenter` ako self-contained komponent (vlastný state, vlastné API volania)

## Serverové poznámky (pedani.eu)
- NIKDY nespúšťať build/deploy príkazy ako root (sudo) — spôsobuje permission problémy
- Ak nastane EACCES/permission denied: `sudo chown -R deploy:deploy /var/www/finance-tracker-repo /var/www/finance-tracker`
- .env súbor pre frontend: `/var/www/finance-tracker-repo/finance-tracker/.env` s `VITE_API_URL=https://api.pedani.eu`
- Backend .env: `/var/www/finance-tracker-api/.env`

## Backend infraštruktúra

### Docker
- Backend beží ako Docker container: `finance-tracker-repo-backend-1`
- PostgreSQL beží ako separátny Docker container: `finance-tracker-postgres-1`
- Príkazy (BEZ pomlčky — nová syntax):
```bash
docker compose restart backend
docker compose logs backend --tail=50
docker compose up --build -d
```
- **NIKDY nepoužívať `docker-compose` (s pomlčkou)** — na tomto serveri nie je k dispozícii

### PostgreSQL — definícia a upgrade
- Postgres **NIE je** v repo `docker-compose.yml` (ten definuje len backend) — je v samostatnom `/var/www/finance-tracker/docker-compose.yml`, image `postgres:17-alpine`, dáta v named volume `finance-tracker_postgres_data` (external)
- **Dve DB identity** (rôzne roly!):
  - Backend kontajner: rola `user`, host `postgres` (container link) — v `backend/.env`
  - CI deploy migrácia: rola `finance_user` (vlastník schémy), host `localhost:5432` — v GitHub secrete `DATABASE_URL`
- **`pg_hba.conf`**: `127.0.0.1`/`::1`/`local` = `trust` (bez hesla); všetko ostatné vrátane docker bridge subnetu = `scram-sha-256` → docker-published spojenia **vyžadujú heslo**
- **Major version upgrade gotcha** (16→17): `pg_dump` jednej databázy **nezachová cluster roly ani heslá** (sú globálne). Po fresh init + restore treba `finance_user` znovu vytvoriť s LOGIN + heslom zhodným s GitHub secretom `DATABASE_URL`, inak CI deploy zlyhá na `password authentication failed for user "finance_user"` (kód `28P01`). Postup: čistý volume → `docker compose up -d postgres` → restore z `pg_dump` ako rola `user` → `ALTER ROLE finance_user WITH LOGIN PASSWORD '...'` + `ALTER ROLE "user" PASSWORD '...'` (decoded z `backend/.env` DATABASE_URL)
- **`gh secret set`**: hodnotu posielať cez **stdin** (`printf '...' | gh secret set DATABASE_URL --repo ...`) — **NIE** `--body -` (nastaví doslovný reťazec, prejaví sa ako `getaddrinfo ENOTFOUND base`)

### Nginx
- Konfigurácia v repozitári: `nginx/api.pedani.eu.conf` (a `nginx/finvu.pedani.eu.conf`). Živý súbor `/etc/nginx/sites-enabled/api.pedani.eu.conf` je **symlink** na `/etc/nginx/sites-available/api.pedani.eu.conf`
- **Pravidlo: najprv diff, potom nasadiť.** Živý súbor nikdy neprepisuj naslepo, môže obsahovať ručné opravy, ktoré v repe nie sú. Postup: diff repo vs. živý súbor, záloha živého súboru s časovou pečiatkou mimo `sites-enabled`, skopírovať, `sudo nginx -t`, až potom `sudo systemctl reload nginx` (reload, nie restart). Pri zlyhaní `nginx -t` vrátiť zálohu
- `api.pedani.eu` má **rate limit 30 r/s s burstom 100 na IP** (`limit_req_zone api_per_ip`, `limit_req ... burst=100 nodelay` v `location /`); nad limit prichádza **429**. Hromadné akcie vo frontende preto musia posielať požiadavky po dávkach (pozri `src/lib/deleteAllTransactions.ts`)
- **Security hlavičky (HSTS, X-XSS-Protection a pod.) posiela helmet** z `backend/src/index.ts`; nginx ich nemá duplikovať. Nginx pridáva `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` a `Permissions-Policy`
- `client_max_body_size 20M` — potrebné pre avatar upload (base64 ~5MB)

### Rate limiting (`backend/src/routes/auth.ts`, `backend/src/lib/authLimiters.ts`)
Limity na IP (express-rate-limit), všetky odpovedajú rovnakým telom `AUTH_RATE_LIMITED`:
- `registerLimiter` (aj `resend-verification`): 5 req / 15 min
- `loginLimiter` (`admin-login`, `google`): 20 req / 15 min, počíta všetky požiadavky
- `passwordLoginLimiter` (`login`): 20 req / 15 min; `pinLoginLimiter` (`pin-login`): 8 req / 10 min; `webauthnVerifyLimiter`: 20 req / 10 min — to sú `signInLimiter`, ktoré počítajú **len zlyhané pokusy** (`skipSuccessfulRequests`)
- `generalLimiter` (verify-email, forgot/reset-password): 20 req / 15 min
- `sensitiveLimiter` (zmena hesla/PIN, zmazanie účtu, deaktivácia, reauth): 10 req / 15 min
- `webauthnOptionsLimiter`: 20 req / 10 min; `pinDeviceStatusLimiter`: 30 req / 10 min
- `methodsLimiter`, `sessionCheckLimiter`, `pingLimiter`: 60 req / 15 min
- `refreshLimiter`: 200 req / 15 min — **MUSÍ byť vysoký**, inak F5 spôsobuje logout
- `refreshLimiter` **NESMIE** používať custom `keyGenerator` s `req.ip` priamo (IPv6 bug)

Zámok prihlasovania (`lib/loginLockout.ts`, `lib/lockoutStore.ts`, politika v `lib/lockoutPolicy.ts`) je samostatný a beží nad limitmi: 5 pokusov v okne 15 min zamkne kľúč na 15 min, uložené v Postgrese (`login_lockouts`).
- Pokus sa **rezervuje pred porovnaním hesla** (`reserveAttempt`, jeden atomický upsert pred vyhľadaním používateľa a bcrypt), takže paralelné požiadavky nemôžu prejsť kontrolou naraz; zamknutý kľúč dostane 429 aj so správnym heslom
- Kľúče: heslo = `passwordKey` (hash e-mailu, funguje aj pre neexistujúci účet), PIN = `pinKey` (userId), **admin = `adminKey` viazaný na IP** (nie jeden globálny zámok)

### Avatar upload
- Max veľkosť: 10MB binárne (kontrolované v `auth.controller.ts` — `avatarUrl.length > 14_000_000` base64 znakov)
- Formát: base64 data URL poslaný ako JSON `{ avatarUrl: string }` — server ho dekóduje a uloží na disk (`lib/avatarStorage.ts`), do DB ide len verejná cesta
- Statické servovanie: `GET /uploads/…` (express.static, immutable cache, `?v=` cache-buster); helmet má `crossOriginResourcePolicy: cross-origin` aby frontend origin mohol obrázky embednúť
- Express JSON limit: 1mb globálne, 15mb len pre `/api/auth/avatar`; Nginx limit: 20M
- Migrácia starých base64 avatarov z DB: `docker exec finance-tracker-repo-backend-1 node dist/scripts/migrate-avatars.js`

---

## Layout & UI pravidlá

### Grid a šírky
- Kostra aplikácie (navigácia, `Topbar`, obsah stránky v `PullToRefresh`) je v `src/App.tsx`; presné štýly wrapperov pozri tam
- Šírku a centrovanie obsahu riadi `PullToRefresh` (`PAGE_MAX_WIDTH` = 1232): nastaví CSS premennú `--page-inset` na scroll kontajneri a stránky ju pridávajú do horizontálneho paddingu (`padding: 20px calc(20px + var(--page-inset, 0px))`), takže scrollbar ostáva na okraji obrazovky. Na page-level komponentoch (Dashboard, Income, …) sa nepoužíva `max-w-*`; k 2026-11-01 sa `max-w-*` v `src/` vyskytuje len v `ConfirmDialog` a `ToastContainer` (dialóg/toast, nie stránky). Sidebar a Topbar zostávajú na celú šírku
- Dashboard má na desktope (lg+) dva stĺpce (hlavný obsah vľavo, kontextový panel vpravo), na mobile jeden stĺpec; presné rozmery pozri `src/pages/Dashboard.tsx`

### Sidebar
- Komponent `src/components/AppNav.tsx`; má rozbalený a zbalený stav, šírky idú cez CSS premenné `--sidebar-w` a `--sidebar-collapsed-w`

### Farby a pozadie
- Pozadie stránky a farby všeobecne: tokeny `--aurora-bg` / `--aurora-bg-image` a ostatné `--aurora-*` z `src/index.css` (dark aj light), nie hardcoded hex

### Dashboard — sekcie
Pevné detaily jednotlivých sekcií sa tu nevedú (zastarávali) — zdroj pravdy je `src/pages/Dashboard.tsx`. Stručne: hero karta (`HeroCard`), karta denného rozpočtu, heatmapa výdavkov (`ExpenseHeatmap`) a donut graf (`CategoryDonutCard`), pravý panel s kartami (nadchádzajúce platby, predikcia cez `ForecastCard`, sporenie ak `savings_enabled`, …). Mobil: jeden stĺpec; desktop (lg+): dva stĺpce.

### Responsive pravidlo
- Desktop (lg+): sidebar + 2-stĺpcový grid
- Mobile: bottom pill nav, single column, FAB pre pridávanie

### Topbar
- Desktop: 2 sekcie — ľavá (greeting 22px bold + dátum) | pravá (toggle + monthNav + themeBtn + avatar)
- Mobile: 2 riadky — Row1: logo + greeting + avatar | Row2: monthNav + toggle (len na relevantných stránkach)
- Theme toggle: ☀️/🌙 button v Topbar (desktop aj mobile) — mení `data-theme` na `<html>` + localStorage

### Login/Register stránky
- Background: `var(--bg)` — NIE hardcoded `#0a0814` (kvôli light mode kompatibilite)
- Input polia: theme-aware — svetlé pozadie v light mode cez `inputStyle(focused, theme)` funkciu
- Theme toggle: `position: fixed, top: 16, right: 16` — dostupný pred prihlásením
- Language switcher (compact): `position: fixed, top: 16, left: 16` — vlajka + kód + chevron, dropdown `position: fixed`

### CsvImportModal
- Podporované banky: Revolut, Tatra banka, SLSP, mBank, 365.bank, Vlastný CSV
- 365.bank: semicolon delimiter, stĺpce `Dátum`/`Popis`/`Suma`/`Mena`/`Zostatok`
- Dostupný v: Príjmy, Variabilné výdavky, Fixné výdavky

### Kategórie
- Desktop header button: `Pridať kategóriu` (BEZ leading `+` — `Plus` ikona ho už zobrazuje)
- Celkové využitie rozpočtu: summary bar nad gridom — `totalSpent`/`totalLimit` zo všetkých kategórií s limitom
- `auto_limit` kategórie: budget limit sa auto-prepočíta keď sa zmení fixný výdavok s touto kategóriou

### Domácnosť
- Názov domácnosti sa zobrazuje s prefixom `"Rodina "` — napr. `"Rodina Bližňákovcov"`
- Default dashboard view: `family` keď `householdEnabled === true` a nie je uložená preferencia

## Known patterns & conventions
- **BottomSheet swipe-to-close**: drag handle + header area are touch targets. Swipe down >80px closes with 250ms slide-out animation. `translateY` state + `isDragging` ref control the gesture. `touchAction: 'none'` on panel prevents scroll conflict.
- **BottomSheet `onImportCsv` prop**: optional prop — when provided, shows a 36×36px `FileUp` icon button in the header (right of title, left of close). Only pass when NOT in edit mode. On click: close sheet first, open CSV modal after 150ms timeout.
- **Import CSV button — desktop**: outlined style — `height: 40px`, `padding: 0 20px`, `borderRadius: 12px`, `border: 1.5px solid var(--violet)`, `background: transparent`, hover `rgba(124,58,237,0.08)`. Same height as primary Pridať button.
- **Import CSV button — mobile**: removed from header row entirely. Accessible via BottomSheet header icon when user taps FAB.
- **Header row — mobile**: Income, VariableExpenses, FixedExpenses pages use `className="hidden lg:flex"` on the header row — completely hidden on mobile. FAB handles add action, BottomSheet header handles Import CSV.
- **dashView default**: initializes from `localStorage || 'family'`. Force-reset to `'personal'` only fires after `!isLoading && user && !householdEnabled` — never before user data is loaded. Complementary effect sets `'family'` when household becomes enabled and no saved preference exists.
- **Pie chart interaction**: outer `pieChartCard` div has `onClick={() => { setClickedIndex(null); setLegendHoverIndex(null) }}`. Pie wrapper stops propagation. Three states: `activeIndex` (pie hover), `legendHoverIndex` (legend hover), `clickedIndex` (locked click). Effective display index = `clickedIndex ?? legendHoverIndex ?? activeIndex`. Legend items highlight on hover AND click. Segment expands for all three states via `activeShape={renderPieShape}`.
- **Settings useEffect**: NEVER call `html.setAttribute('data-theme', ...)` in Settings mount useEffect. Theme is managed by App.tsx IIFE on load and Topbar/Login `toggleTheme`. Settings only applies accent color and compact mode on mount.
- **Theme toggle buttons in Settings**: column layout (icon 18px above label 11px), `minWidth: 56px`, `padding: 8px 12px`, `borderRadius: 12px`, violet border+bg when active, `var(--bg3)` when inactive.
- **MutationObserver for theme reactivity**: ExpenseHeatmap, Settings theme state, and Topbar theme state all use `MutationObserver` on `document.documentElement` watching `data-theme` attribute to stay in sync when theme changes from another component.
- **Login/Register light mode**: background uses `var(--bg)` not hardcoded `#0a0814`. Input styles use theme-aware colors via `inputStyle(focused, theme)` function. Google button background/color also theme-aware.

## Modules
- **BottomSheet** (`components/BottomSheet.tsx`): props: `open`, `onClose`, `title`, `children`, `footer?`, `onImportCsv?`. Mobile: slides up from bottom with drag-to-close. Desktop: centered modal. Drag handle + header are swipe targets on mobile.

## PIN lock — gotchas

- `loginWithPin` v `AuthContext` musí volať `sessionStorage.setItem('pin_verified_session', 'true')` — inak `PinLock` sa ukáže druhýkrát po PIN prihlásení
- Po logout musí `usePinLock` resetovať `locked = true` — inak ďalší login cez heslo/Google nevyvolá PinLock
- `pin_verified_session` kľúč (sessionStorage) + `lock_method` (localStorage) sú dve rôzne veci — nemiešať

## Key constraints
- `BottomSheet` `onImportCsv` must be `undefined` when in edit mode — import only makes sense when adding new records
- Never render both mobile and desktop Import CSV buttons simultaneously — use `hidden lg:flex` / `lg:hidden` pattern
- `dashView` force-reset to `'personal'` requires `user` to be loaded — add `&& user` guard to prevent premature reset on initial render
- **i18n — nový jazykový kľúč**: pridať do **všetkých 5 súborov** (`finance-tracker/src/i18n/{sk,en,cs,pl,hu}.ts`) naraz; v angličtine (`en.ts`) sa apostrofy escapujú (`'You\'re'`); TypeScript build zlyhá ak chýba kľúč v niektorom súbore
- **LanguageSwitcher dropdown**: používa `position: fixed` + `getBoundingClientRect()` — **nie** `position: absolute`, pretože `SectionCard` má `overflow: hidden` ktoré by dropdown orizlo
- **Savings deep link**: `App.tsx → getPageFromHash()` stripuje `?` query params — bez toho by `#sporenie?id=X` padlo na dashboard
- **Docker migrácie**: spustiť `docker exec ... node dist/scripts/migrate.js` po každej novej migrácii; migrácie musia byť COPY-ované v Dockerfile pred `npm run build`
