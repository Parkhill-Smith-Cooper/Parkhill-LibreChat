# Parkhill LibreChat — Fork Customizations

This file is the single source of truth for **how this fork diverges from upstream
`danny-avila/LibreChat`**. Keep it updated whenever you add a customization, so that
merging upstream updates stays a 2-minute chore instead of an investigation.

> **Golden rule:** keep `main` as close to upstream as possible. Push every
> customization into **config, env, or bind-mounts** instead of editing tracked
> source files. Code edits are the only thing that conflicts on merge.

---

## Remotes

| Remote | URL |
|---|---|
| `origin` | `https://github.com/Parkhill-Smith-Cooper/Parkhill-LibreChat.git` (our fork) |
| `upstream` | `https://github.com/danny-avila/LibreChat.git` (community) |

---

## What we changed vs. upstream

### 1. Branding assets (committed to `main`)
These are deliberate binary/SVG replacements. They rarely conflict; if upstream ever
changes the same file, resolve by **keeping ours**.

- `client/public/assets/logo.svg`
- `client/public/assets/favicon-16x16.png`
- `client/public/assets/favicon-32x32.png`

The assets are injected into the running container via bind-mounts in
`docker-compose.override.yml` (git-ignored — see below), so they apply to prebuilt
images too, without a rebuild.

### 2. Runtime configuration (NOT in git — by design)
These hold environment-specific values and/or secrets and are git-ignored:

| File | Purpose | Where the real value lives |
|---|---|---|
| `.env` | Secrets + env (incl. `MONGO_URI` → Azure Cosmos DB) | Azure Key Vault in prod |
| `librechat.yaml` | App config: branding text, endpoints, interface | Committed template = `librechat.example.yaml` |
| `docker-compose.override.yml` | Branding bind-mounts, external Mongo wiring | Reference = `docker-compose.override.yml.example` |

Notable `librechat.yaml` settings we rely on:
- `interface.customWelcome` — "Welcome to Parkhill AI!"
- `interface.privacyPolicy.externalUrl` / `interface.termsOfService.externalUrl` →
  `https://parkhill.red/page/1725/policies-and-security`

### 3. Data layer
- MongoDB is **external**: Azure Cosmos DB (Mongo vCore). `MONGO_URI` uses
  `retryWrites=false` (required for Cosmos).
- The bundled `mongodb` container is **not used** in production (disable it in the
  override — see the "DISABLE THE MONGODB CONTAINER" stanza).

---

## Things we must NOT do

- ❌ Do **not** delete upstream-maintained files (`.env.example`,
  `librechat.example.yaml`, `docker-compose.override.yml.example`). Deleting them
  causes delete/modify merge conflicts on every update and throws away reference
  templates. Keep them as-is.
- ❌ Do **not** edit tracked source files (`.tsx`, `.ts`, `.html`) for branding/text
  when a `librechat.yaml` or env setting can do it instead.
- ❌ Do **not** commit `.env`, `librechat.yaml`, or `docker-compose.override.yml`.

---

## Updating from upstream

Run `scripts/update-from-upstream.ps1` (or follow the steps below) on a regular
cadence — ideally per upstream release. **Read the upstream changelog first** for
breaking config/schema changes.

```powershell
git fetch upstream
git checkout main
git merge upstream/main      # only branding assets can conflict → keep ours
git push origin main
```

If a conflict appears on a branding asset, keep ours:
```powershell
git checkout --ours client/public/assets/logo.svg
git add client/public/assets/logo.svg
```