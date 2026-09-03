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
| `docker-compose.override.yml` | Branding bind-mounts, external Mongo wiring | Reference = `docker-compose.override.yml.example` |

`librechat.yaml` is the exception: it is listed in `.gitignore` (inherited from upstream)
but **force-added and tracked in this fork**, because `parkhill-deploy.yml` uploads it
from the git checkout to the Azure Files `config` share. An uncommitted change to it
never reaches production. Upstream does not track the file at all, so it can never
conflict on merge. Keep it tracked.

Notable `librechat.yaml` settings we rely on:
- `interface.customWelcome` — "Welcome to Parkhill AI!"
- `interface.privacyPolicy.externalUrl` / `interface.termsOfService.externalUrl` →
  `https://parkhill.red/page/1725/policies-and-security`
- `endpoints.agents.recursionLimit: 150` / `maxRecursionLimit: 300` — see §4.

### 3. Data layer
- MongoDB is **external**: Azure Cosmos DB (Mongo vCore). `MONGO_URI` uses
  `retryWrites=false` (required for Cosmos).
- The bundled `mongodb` container is **not used** in production (disable it in the
  override — see the "DISABLE THE MONGODB CONTAINER" stanza).

### 4. Agent step limit (config) + step-limit error copy (code)
Users were hitting `Recursion limit of 58 reached without hitting a stop condition`
mid-run. That is LangGraph's per-run step budget: the fork's own default is 50
(`packages/api/src/agents/config.ts`) plus 8 steps of steer/preemption headroom from
`@librechat/agents`. 50 steps is roughly 24 tool calls, which our MCP-heavy agents
(Rhino, SketchUp, Microsoft 365, Elastic) exhaust on real tasks.

**Config, no conflict risk** — `librechat.yaml` → `endpoints.agents`:
`recursionLimit: 150` (≈74 tool calls; subagents get `floor(150/3)` = 50 turns) with
`maxRecursionLimit: 300` as the ceiling any per-agent "Max Agent Steps" override is
clamped to. Per-agent tuning stays in the agent builder UI.

**Code, upstream-maintained files — resolve by keeping ours:**
- `client/src/components/Messages/Content/Error.tsx` — a `graphRecursionLimit` regex
  branch that returns localized guidance instead of the raw LangGraph text. It sits
  directly beside upstream's `langChainModelNotFoundUrl` branch and follows the same
  pattern, so an upstream refactor of that function is the one place this can be lost.
- `client/src/locales/en/translation.json` — the `com_error_recursion_limit` key.

Both are guarded by tests in
`client/src/components/Messages/Content/__tests__/Error.spec.tsx`, which resolve the key
against the real English catalog. If a merge drops either edit, those tests fail rather
than the regression reaching users — **do not delete them to make a merge go green.**

Known gap, deliberately not fixed: `api/server/controllers/agents/responses.js` builds
its run configs without `recursionLimit`, so the Responses-compatible API stays at the
SDK default of 50. The normal chat UI and `openai.js` both honour the YAML.

---

## Things we must NOT do

- ❌ Do **not** delete upstream-maintained files (`.env.example`,
  `librechat.example.yaml`, `docker-compose.override.yml.example`). Deleting them
  causes delete/modify merge conflicts on every update and throws away reference
  templates. Keep them as-is.
- ❌ Do **not** edit tracked source files (`.tsx`, `.ts`, `.html`) for branding/text
  when a `librechat.yaml` or env setting can do it instead.
- ❌ Do **not** commit `.env` or `docker-compose.override.yml`.
- ✅ Do commit `librechat.yaml` — the deploy workflow uploads it from the checkout, so
  an uncommitted change to it silently never ships. It is `.gitignore`d but tracked.

---

## Updating from upstream

Run `scripts/update-from-upstream.ps1` (or follow the steps below) on a regular
cadence — ideally per upstream release. **Read the upstream changelog first** for
breaking config/schema changes.

```powershell
git fetch upstream
git checkout main
git merge upstream/main      # branding assets + the §4 client files can conflict → keep ours
git push origin main
```

If a conflict appears on a branding asset, keep ours:
```powershell
git checkout --ours client/public/assets/logo.svg
git add client/public/assets/logo.svg
```