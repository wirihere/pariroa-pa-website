# Pariroa Pā Website — the site's own home

purpose: the Pariroa Pā marae website — build, preview, deploy to pariroapa.nz via Cloudflare Pages.
created: 2026-10-01 (site moved here from `pariroa pa\04-website\site`, which remains the content/kaupapa record)
kind: repo — website
status: deployed

## Deploy state (2026-10-01)

- **LIVE: https://pariroa-pa.pages.dev** (95 files, Cloudflare Pages project `pariroa-pa`, first deploy 1 Oct)
- **pariroapa.nz**: zone created in Cloudflare (id ba71f441b2e59c08d7fe29209694a0c6, pending); custom domains pariroapa.nz + www added to the Pages project (initializing)
- **WAITING ON WIRI (one manual step at Porkbun):** set nameservers for pariroapa.nz to `anton.ns.cloudflare.com` + `zariyah.ns.cloudflare.com` (Porkbun → Domain Management → pariroapa.nz → Nameservers). Then also regenerate the wirihere API keys (porkbun.com/account/api — old ones invalid) and toggle per-domain API access ON, so future agents can do this themselves.
- Deploy token: `PARIROA_PAGES_TOKEN` in automation-template .env (scoped: Pages read/write on the account; created 1 Oct via global key). Project `pariroa-pa` exists — wrangler won't need to create it.

## What's here

- `site/` — **THE WEBSITE** (pages: index, our-story, our-future, visit, book, panui, support, contact, photos, **share** (photo uploads), **admin** (photo review) + styles.css + main.js + gallery files + images/). The `pariroa pa\04-website\` folder keeps the plans, copy, fact-checks, trustee flags, and the photo pipeline — this folder holds the deployable site.
- `functions/api/` — Pages Functions for the photo gallery (upload, admin, serving). MUST stay at the repo root, sibling of `site/` — wrangler bundles it from there (deploy.ps1's cwd).
- `wrangler.toml` — Pages config: project name, `site/` as assets dir, PHOTOS → `pariroa-photos` R2 bucket binding. Never add a `[vars]` block (drops project secrets on deploy). Secrets: SESSION_SECRET, ADMIN_KEY, ADMIN_EMAILS — set on the Pages project via API.
- `deploy.ps1` — deploy to Cloudflare Pages (`pariroa-pa` project). Reads the API token from `C:\Users\wirih\repos\automation-template\.env` (CLOUDFLARE_API_TOKEN) — never hardcode it.
- Domain: **pariroapa.nz** (Porkbun, wirihere account) → Cloudflare Pages custom domain.
- **GitHub**: [wirihere/pariroa-pa-website](https://github.com/wirihere/pariroa-pa-website) — public repo, this exact folder. After changes: commit, `git push origin main`, run deploy.ps1. (Token can't create private repos; flip it to private on GitHub if you want.)

## Photo gallery (built 2 Oct 2026)

- `/share.html` — open upload page: sender's email + photos, shrunk on their
  device (≤2000px WebP, EXIF/GPS stripped) → waiting area. Nothing public
  until approved.
- `/admin.html` — review desk: sign in with the admin key
  (`PARIROA_GALLERY_ADMIN_KEY` in automation .env), approve/reject/unpublish.
  Every photo gets eyes — no approve-all.
- Build record + admin key + gotchas: `C:\Users\wirih\my life\20_projects\pariroa-photo-gallery\CONTEXT.md`.

## Deploy

```powershell
& C:\Users\wirih\repos\pariroa-pa-website\deploy.ps1
```
(wrangler pages deploy site --project-name pariroa-pa --branch main; token via env var.)

## Local preview

```powershell
& 'C:\Python314\python.exe' -m http.server 8123 --bind 127.0.0.1 --directory C:\Users\wirih\repos\pariroa-pa-website\site
```
then browse http://127.0.0.1:8123

## Standing rules

- Content changes still get planned/flagged in `pariroa pa\04-website\` (trustee flags, kaumātua review lists live there). This folder is deploy-truth: what's here is what's live.
- Never publish unsighted photos (vision gate) — see `pariroa pa\04-website\phone-photos\` pipeline + the red browser (`repos\jev red browser\`) for harvests.
- Pre-deploy checklist lives in `repos\automation-template\deploy-site.md`.
