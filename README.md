# Épicerie Prix — app de prix d'épicerie & coût de recettes (QC)

Monorepo pnpm : API (Fastify + Prisma + Postgres) + mobile (Expo / React Native) + types partagés.

```
apps/api              Fastify + Prisma + Postgres
apps/mobile           Expo (React Native), SDK 54
packages/shared-types Types TypeScript partagés (DTO API)
```

---

## Prérequis

- **Node.js** 20+
- **pnpm** 9+ → `npm install -g pnpm@9`
- **PostgreSQL 16** — natif (recommandé) **ou** via Docker
- **Expo Go** sur ton téléphone (App Store / Play Store) pour tester le mobile
- PC et téléphone sur le **même réseau Wi-Fi**

---

## 1. Installation

```powershell
cd D:\Recipes
pnpm install
```

---

## 2. Base de données

`DATABASE_URL` attendu (dans `apps/api/.env`) :
`postgresql://epicerie:epicerie_dev@127.0.0.1:5432/epicerie`

### Option A — Postgres natif (recommandé, stable)

Installe Postgres 16 (https://www.postgresql.org/download/windows/), port 5432, puis crée le user + la base :

```powershell
$env:PGPASSWORD="<mot_de_passe_postgres>"
psql -U postgres -h 127.0.0.1 -c "CREATE USER epicerie WITH PASSWORD 'epicerie_dev';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE epicerie OWNER epicerie;"
```

### Option B — Docker

```powershell
cd D:\Recipes
docker compose up -d
```
> Si le moteur Docker plante (`pipe\dockerBackendApiServer`) : `wsl --shutdown`, relance Docker Desktop, attends la baleine stable. Redis du compose n'est **pas requis** au runtime.

### Appliquer le schéma + données

```powershell
cd D:\Recipes\apps\api
pnpm exec prisma db push                                              # crée les tables
pnpm exec tsx --env-file=.env prisma/seed.ts                         # données de base (si présent)
pnpm exec tsx --env-file=.env src/services/crawl/iga-stores.crawler.ts   # 303 magasins IGA réels
pnpm exec tsx --env-file=.env src/services/crawl/iga-catalog.crawler.ts  # ~21k produits IGA (optionnel)
```

---

## 3. Variables d'environnement

Copie `apps/api/.env.example` → `apps/api/.env` et remplis :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion Postgres |
| `JWT_SECRET` | Secret auth (≥ 32 caractères) — `openssl rand -hex 32` |
| `ACCESS_TOKEN_TTL` | Durée access token (défaut `15m`) |
| `GROQ_API_KEY` | Parsing recettes par IA (fallback) |
| `PORT` | Port API (défaut `3000`) |

> `.env` est **gitignored** — ne jamais committer de secrets.

---

## 4. Lancer l'API

```powershell
cd D:\Recipes\apps\api
pnpm dev          # tsx watch + charge .env, port 3000
```

Vérifier (⚠️ utilise **`127.0.0.1`**, pas `localhost` — celui-ci résout en IPv6 `::1` alors que le serveur bind IPv4) :

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/health"
```

Autres scripts (depuis `apps/api`) :
```powershell
pnpm test          # 172 tests unitaires (sans DB)
pnpm typecheck     # tsc --noEmit
pnpm exec prisma studio   # explorer la DB
```

---

## 5. Lancer le mobile (Expo Go)

### a. Pointer le mobile vers l'IP LAN du PC (pas localhost)

Trouve l'IP Wi-Fi du PC :
```powershell
ipconfig | Select-String "IPv4"
```
Prends l'IP de la carte **Wi-Fi/Ethernet** (ex. `192.168.1.150`) — **pas** VMware/VMnet.

Dans `apps/mobile/.env` :
```
EXPO_PUBLIC_API_URL=http://192.168.1.150:3000/api/v1
```

### b. Démarrer Expo

```powershell
cd D:\Recipes\apps\mobile
pnpm exec expo start --clear    # 'pnpm exec' = Expo local (SDK 54), pas global
```

Scanne le QR code :
- **iOS** : app Caméra → ouvrir dans Expo Go
- **Android** : Expo Go → Scan QR code

> Expo Go doit être en **SDK 54** (le projet est sur SDK 54). `r` dans le terminal Expo = recharger après un changement de `.env`.

---

## 6. Scrapers / catalogue (optionnel)

```powershell
cd D:\Recipes\apps\api
# IGA — via API Algolia (rapide, sans navigateur)
pnpm exec tsx --env-file=.env src/services/crawl/iga-catalog.crawler.ts
# Maxi / Metro / Super C — Playwright (lent, ~20-40 min)
pnpm exec tsx --env-file=.env src/services/crawl/maxi-catalog.crawler.ts
pnpm exec tsx --env-file=.env src/services/crawl/metro-catalog.crawler.ts        # Metro
pnpm exec tsx --env-file=.env src/services/crawl/metro-catalog.crawler.ts superc # Super C
# Orchestrateur quotidien (Flipp promos + crawls)
pnpm exec tsx --env-file=.env src/services/daily-scrape.service.ts
```

---

## 7. Dépannage rapide

| Symptôme | Cause / fix |
|---|---|
| `Network request failed` (mobile) | `.env` mobile pointe sur `localhost`/mauvaise IP → mettre l'IP LAN du PC. PC + tél même Wi-Fi. |
| API `localhost` ne répond pas (PowerShell) | Utiliser `127.0.0.1` (IPv6 vs IPv4). |
| `P1001 Can't reach database server` | Postgres pas démarré (Docker tombé / service Postgres arrêté). |
| `pipe\dockerBackendApiServer` | Moteur Docker mort → `wsl --shutdown` + relancer Docker Desktop, ou passer à Postgres natif. |
| `project incompatible with this version` (Expo Go) | Décalage SDK — projet = SDK 54. |
| `expo not found` | Lancer `pnpm exec expo ...` depuis `apps/mobile`. |
| Parsing recette tourne en boucle | `GROQ_API_KEY` absent dans `apps/api/.env`. |

---

## Scripts racine (monorepo)

```powershell
pnpm dev:api       # API
pnpm dev:mobile    # Expo
pnpm -r test       # tous les tests
pnpm -r typecheck  # tous les typechecks
```

---

## Documentation

- `docs/LAUNCH-CHECKLIST.md` — chemin vers publication + monétisation
- `legal/` — politique de confidentialité + CGU (brouillons à réviser)
