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
- `client/src/components/Messages/Content/Error/index.tsx` — a `graphRecursionLimit`
  regex checked first inside upstream's `getLangChainErrorKey`, returning localized
  guidance instead of the raw LangGraph text. It matches the bare "Recursion limit of N
  reached" sentence too, which upstream's URL-based `parseLangChainErrorCode` does not.
  (Until v0.8.8 this lived in `Error.tsx`; upstream deleted that file and split it into
  the `Error/` folder, so the branch was re-applied there during the v0.8.8 merge.)
- `client/src/locales/en/translation.json` — the `com_error_recursion_limit` key.

Both are guarded by tests in
`client/src/components/Messages/Content/__tests__/Error.spec.tsx`, which resolve the key
against the real English catalog. If a merge drops either edit, those tests fail rather
than the regression reaching users — **do not delete them to make a merge go green.**

Since v0.8.8 upstream treats the step limit as a normal terminal state
(`isStepLimitError` in `packages/api/src/agents/errors.ts`): the turn is saved as
unfinished and the UI offers to continue, so the localized error is now mainly a fallback
for older persisted messages and paths that still surface the raw text. v0.8.8 also makes
the Responses API honour the resolved recursion limit, closing the gap previously noted
here.

### 5. Admin-only models (data, not code)

When a new frontier model ships we want admins to evaluate it before everyone gets it.
**No source files are involved** — the gate is a config override document in Mongo.

**Files:** `scripts/admin-models.json` (which models), `scripts/set-admin-models.ps1`
(applies it). Both tracked. The override itself lives in the `configs` collection.

**How it works.** This fork resolves config per request by principal: the YAML base, then
overrides for the user's role / groups / user id, merged by priority
(`packages/data-schemas/src/app/resolution.ts`, `packages/api/src/app/service.ts`). An
endpoint present only in the ADMIN role's override is absent from every non-admin's
resolved config, so it never reaches their model selector **and** `validateModel`
(`api/server/middleware/validateModel.js`) rejects it if requested directly — a real
gate, not just a hidden menu entry.

**Two traps worth remembering:**

- ❌ **`endpoints.anthropic.models.default` cannot gate the built-in endpoints.**
  `getAnthropicModels` / `getOpenAIModels` read `process.env.ANTHROPIC_MODELS` /
  `OPENAI_MODELS` and return before consulting the resolved config
  (`packages/api/src/endpoints/models.ts`). Those are process-global — every user gets
  the same list regardless of any override. Gated models must therefore live on a
  **custom** endpoint, which *is* resolved per user.
- ❌ **Don't use `modelSpecs` for this.** `endpoints.custom` is in `ARRAY_MERGE_KEYS`
  (merged by `name`), so an override appends cleanly. `modelSpecs.list` is not, so an
  override would replace the whole array — you would have to duplicate every public spec
  into the admin document and keep them in sync forever. There is no `modelSpecs:` block
  in `librechat.yaml` today; the public list comes from `ANTHROPIC_MODELS` /
  `OPENAI_MODELS` / `GOOGLE_MODELS` in `.env` plus the OpenRouter fetch.

**Gate a new model:** add its id to `models.default` in `scripts/admin-models.json`, keep
it **out** of `ANTHROPIC_MODELS` in `.env`, then
`./scripts/set-admin-models.ps1 -Token <jwt> -Action Apply -BaseUrl <prod-url>`.

**Promote it to everyone:** add the id to `ANTHROPIC_MODELS` in `.env`, remove it from
`admin-models.json`, re-apply. Demotion is the reverse.

**Auth — needs the token *and* the cookies.** `ALLOW_EMAIL_LOGIN=false` (Entra ID only), so
the script cannot sign in. Sign in as an admin, then DevTools → **Network** → any `/api/...`
request → Request Headers, and copy **both** from that same request:

- the value after `Authorization: Bearer ` → `-Token`
- the entire `Cookie:` value → `-Cookie`

The header alone returns **401**, and the reason is non-obvious: with
`OPENID_REUSE_TOKENS=true` the access token is **RS256, signed by Entra**. `requireJwtAuth`
(`api/server/middleware/requireJwtAuth.js`) only validates that with the `openidJwt`
passport strategy, and it decides to try that strategy from the `token_provider` /
`openid_user_id` **cookies** — not from the Authorization header. With no cookies it falls
back to the local HS256 `jwt` strategy, which cannot verify an Entra-signed token.

The access token lives in memory (an axios default header), *not* in localStorage — hence
the Network tab. Both values are short-lived; on a 401, reload and re-copy both.

Admins already hold the required `access:admin` + `manage:configs`; `seedSystemGrants`
grants every capability to the ADMIN role on boot.

⚠️ **This override is in Cosmos, not the Azure Files config share.** Neither
`parkhill-deploy.yml` nor `update-librechat-config.ps1` carries it, and it is not part of
any backup those cover. **If the database is rebuilt, re-run the script.** Use
`-Action Show` to confirm what is currently applied.

### 6. Official project per conversation (code, mostly new files)

Before the first message of every new chat, the composer asks which **official project**
it belongs to, or "No project (general)". The choice is stored in Mongo. This is **not**
upstream's Chat Projects feature, which is user-made folders.

**Data.** Each conversation gets one document in the `parkhillconversationprojects`
collection:

```
{ conversationId, user, projectNumber, projectName, noProject, createdAt }
```

- The choice is recorded once, on the first message, and never overwritten.
- `projectName` is a snapshot taken from Fabric at that moment.
- A conversation with **no** document means the picker was off or bypassed. The rule is
  enforced in the UI only.

To report, join on `conversationId` with `$lookup` against `conversations`.

**Project list.** Comes live from the Fabric Lakehouse, the same table and filters as
`D:\GitHub\projects`:

- Table `DT_BRZ.project`, rows with `Status='A'` and parent level only.
- `WBS1` is the number and `Name` is the name, about 4,700 rows.
- The query uses `mssql` with an Entra token: managed identity in Azure, `az login` locally.
- The list is cached in memory for 15 min and loaded at startup.

| Env var | Value |
|---|---|
| `FABRIC_SQL_SERVER` | `<workspace-guid>.datawarehouse.fabric.microsoft.com` (**unset = feature off**) |
| `FABRIC_SQL_DATABASE` | `Vantagepoint_Datalakehouse` |
| `FABRIC_PROJECTS_TABLE` | optional, default `DT_BRZ.project` |
| `FABRIC_PROJECTS_CACHE_TTL_MS` | optional, default `900000` |
| `FABRIC_MANAGED_IDENTITY_CLIENT_ID` | **required in prod**: client ID of the user-assigned `id-librechat` (`89da2e49-6520-4aa4-8bfe-59251c98685f`); the app has no system identity |

The Container App's managed identity needs the **Viewer** role on the Fabric workspace. A
Fabric admin must also turn on "Service principals can use Fabric APIs". An `ESOCKET`
error means a permissions problem, not a network one.

**New files (no conflicts):**
- `packages/api/src/parkhill/` (Fabric source and cache, store, middleware, handler, tests)
- `api/server/routes/parkhill.js`
- `client/src/components/Parkhill/` (picker, Jotai state, query, tests)

**Upstream files touched (check these when merging):**

| File | Edit |
|---|---|
| `packages/api/src/index.ts` | `export * from './parkhill'` |
| `packages/api/package.json` + `package-lock.json` | `mssql`, `@types/mssql`. On a lock conflict, take upstream's lock and re-run `npm install`. |
| `api/server/index.js` | mounts `/api/parkhill` |
| `api/server/routes/agents/chat.js` | `router.use(captureConversationProject)` just before `buildEndpointOption`. It must stay **before** it: the middleware removes the `parkhillProject` field from the body. |
| `client/src/components/Chat/Input/ChatForm.tsx` | `useProjectGate`, the picker below the composer surface, and `projectGate.blocked` on the Send button |
| `client/src/hooks/Chat/useChatFunctions.ts` | `getParkhillProjectField()` in `ask()`: refuses the send while a choice is required, and adds `parkhillProject` to `endpointOption` |
| `client/src/locales/en/translation.json` | `com_parkhill_*` keys |

**How it works:**
1. The client sends `parkhillProject`, either a number or `'none'`, with the first message.
2. The server creates the conversation id inside the agents controller (`req.body.conversationId`).
3. The middleware validates the number against the cached list.
4. It writes the record when the response finishes, and skips responses with status 4xx/5xx.

Things that **never** break chat:
- A failure to write the record is only logged.
- The picker fails open when the endpoint can't be reached.
- When Fabric returns 503, the picker stays up and "No project" is still available.

### 7. Generated-image downloads (code, mostly new files)

The Tech Hub gallery (`parkhill-web-hub`) shows only AI-generated images that someone
**downloaded**, which is our signal for the best results. LibreChat records each
download in its own collection.

**Data.** There is one document per generated file in the `parkhillimagedownloads` collection:

```
{ file_id, user, filepath, downloadCount, firstDownloadedAt, lastDownloadedAt, createdAt, updatedAt }
```

- `file_id` is unique and joins to `files.file_id`. `user` is the owner's id, stored as a string.
- The first download creates the doc. Each later one increments `downloadCount` and bumps
  `lastDownloadedAt`.
- Only `files` with `context: 'image_generation'` that the downloading user **owns** are
  recorded. User uploads and code-output images are ignored.

**What counts as a download:** only the **Download button in the image lightbox**. That
button fetches the blob URL straight from the browser, so the client reports the download
with `POST /api/parkhill/image-downloads { filepath }`. The report is fire-and-forget and never
blocks the download. These are **not** captured:
- the browser's right-click "Save image as";
- viewers of shared links, who are not signed in.

**New files (no conflicts):**
- `packages/api/src/parkhill/downloads.ts` (store, handler, file lookup) and `downloads.spec.ts`
- `client/src/components/Parkhill/downloads.ts`, plus `__tests__/downloads.spec.ts` and
  `__tests__/ImageDownload.spec.tsx`

**Fork files touched:** `packages/api/src/parkhill/index.ts` and `api/server/routes/parkhill.js`.
The route rides on the existing `/api/parkhill` mount, so `api/server/index.js` has no new edit.

**Upstream files touched (check these when merging):**

| File | Edit |
|---|---|
| `client/src/components/Chat/Messages/Content/Image.tsx` | Import `recordImageDownload` and call `recordImageDownload(imagePath)` as the first line of `downloadImage`. If upstream moves or renames the download function, put the call back in it. |

`client/src/components/Parkhill/__tests__/ImageDownload.spec.tsx` renders the real `Image`
and fails if a merge drops this line. **Do not delete it to make a merge go green.**

### 8. Tech Hub MCP server (config only)

The `parkhill-tech-hub` entry in `librechat.yaml` gives chats read-only access to the Tech Hub's
Apps and Ideas data. The server lives in `parkhill-web-hub` (`backend/routes/mcp.js`), so
**no LibreChat source is touched**.

**Auth.** The entry uses `obo:`. LibreChat exchanges the signed-in user's Entra token for one
scoped to the Tech Hub API (`api://1cb8ec0f-.../access_as_user`). The Hub validates it like any
web hub request, and its `roles` claim carries the user's Tech Hub roles, so Hub admins also
see admin-only data (for example, Requested apps) in chat.

**One-time Entra setup:** on LibreChat's app registration, add API permission
*Tech Hub API -> access_as_user* (delegated) and grant admin consent. Without it every tool
call fails the token exchange.

### 9. Pirros MCP server (config + sidecar)

The `pirros` entry in `librechat.yaml` points at `http://localhost:8932/mcp`, the
`pirros-proxy` container in `ca-librechat` (source in `parkhill/pirros-proxy/`). **No LibreChat
source is touched.**

**Why a sidecar.** Pirros returns browser sign-ins only to its five listed AI clients, so
LibreChat's OAuth callback is rejected. A Pirros *API* credential can take a
`client_credentials` token instead, which LibreChat cannot request or renew itself. The proxy
holds that credential (Container App secrets `pirros-api-client-id` and
`pirros-api-client-secret`), keeps the token fresh and forwards MCP traffic with it.

**Shared access.** Every user gets the credential's full reach, and Pirros cannot tell users
apart. The image is built by hand (see the folder's README); the release workflow does not
rebuild it.

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