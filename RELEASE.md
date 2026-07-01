# Releasing Parkhill LibreChat to Production

This fork deploys to **Azure Container Apps** via GitHub Actions
(`.github/workflows/parkhill-deploy.yml`). A deploy is triggered by **pushing a
version tag** (`vX.Y.Z`). Authentication uses **GitHub OIDC → an Azure managed
identity** — there are no stored Azure passwords/secrets in the repo.

---

## TL;DR — cut a release

```bash
# 1. Make sure main has what you want to ship (merged + pushed), then:
git checkout main && git pull

# 2. Tag and push (this triggers the deploy):
git tag v1.2.3
git push origin v1.2.3
```

Watch it under the repo's **Actions** tab → **"Parkhill - Deploy to Azure"**.
When green, the new version is live at
`https://ca-librechat.braverock-0f840281.centralus.azurecontainerapps.io/`.

Use [semver](https://semver.org): bump patch for fixes, minor for features,
major for breaking changes. Tags must start with `v`.

---

## What the pipeline does

On a `v*` tag push, one job (`deploy`, GitHub environment `production`):

1. **Builds the image in ACR** (`az acr build`, cloud build) and tags it
   `librechat:<tag>` **and** `librechat:latest` in `parkhilllibrechat.azurecr.io`.
2. **Uploads `librechat.yaml`** to the Azure Files share (`config`) so the app
   picks up any config changes (MCP servers, endpoints, interface, etc.).
3. **Points the Container App at the new image** (`az containerapp update
   --image …`), which rolls a new revision. The new revision re-reads
   `librechat.yaml` from the share on startup.

The job also supports **manual runs** (Actions → Run workflow) with an optional
tag input, for re-deploys without cutting a new tag.

### What it does NOT do (and why)
- **Secrets / env vars** are not synced by the pipeline. They live as Container
  App secrets/env and aren't in the repo (by design — the repo is public-ish to
  the org and must stay secret-free). See *Updating secrets / env vars* below.
- **Infrastructure** (ACR, Container App, Postgres, storage, identities) is not
  created by this pipeline — it already exists (see *Azure resources*).

---

## One-time setup (already done — for reference / disaster recovery)

### 1. Azure OIDC identity
A user-assigned managed identity **`id-librechat-cicd`** (in `rg-librechat`) with:
- A **federated credential** trusting GitHub:
  - issuer `https://token.actions.githubusercontent.com`
  - subject `repo:Parkhill-Smith-Cooper/Parkhill-LibreChat:environment:production`
  - audience `api://AzureADTokenExchange`
- Role **Contributor** on resource group `rg-librechat` (scoped to just that RG).

Recreate with:
```bash
az identity create -n id-librechat-cicd -g rg-librechat -l centralus
az identity federated-credential create --name github-prod \
  --identity-name id-librechat-cicd -g rg-librechat \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:Parkhill-Smith-Cooper/Parkhill-LibreChat:environment:production \
  --audiences api://AzureADTokenExchange
# Grant Contributor on the RG (needs Owner/User Access Administrator):
az role assignment create --assignee-object-id <identity principalId> \
  --assignee-principal-type ServicePrincipal --role Contributor \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-librechat
```

### 2. GitHub repository configuration
- **Environment**: create an environment named **`production`**
  (Settings → Environments). Optionally add protection rules (required
  reviewers) to gate prod deploys. The name must match the federated-credential
  subject above.
- **Repository secrets** (Settings → Secrets and variables → Actions → *Secrets*):
  | Secret | Value |
  |---|---|
  | `AZURE_CLIENT_ID` | `id-librechat-cicd` clientId |
  | `AZURE_TENANT_ID` | tenant id |
  | `AZURE_SUBSCRIPTION_ID` | subscription id (Subscription 2) |

  These are IDs, not passwords — OIDC exchanges a short-lived token at run time.

---

## Updating secrets / env vars (manual, rare)

App secrets (provider API keys, `MONGO_URI`, `CREDS_KEY`, etc.) are **Container
App secrets**, updated out-of-band from a machine with Azure CLI + the company
VPN. Pattern (example: rotating a Google key):

```bash
# add/update the secret value
az containerapp secret set -n ca-librechat -g rg-librechat \
  --secrets "google-key=<new-value>"

# ensure the env var references it (only needed the first time a key is added)
az containerapp update -n ca-librechat -g rg-librechat --container-name api \
  --set-env-vars "GOOGLE_KEY=secretref:google-key"

# restart so the change takes effect
az containerapp revision restart -n ca-librechat -g rg-librechat \
  --revision "$(az containerapp show -n ca-librechat -g rg-librechat --query properties.latestRevisionName -o tsv)"
```

Also add the same key to your local `.env` so a future full redeploy includes
it. **Never commit real secret values** (`.env` is git-ignored).

> Convention: secret name = env var name lowercased with `_`→`-`
> (e.g. `GOOGLE_KEY` → secret `google-key`), referenced as `secretref:google-key`.

---

## Config-only changes (no new image)

To change just `librechat.yaml` (MCP servers, endpoints, interface) without a
code release, you can either cut a tag (rebuilds the image too) or push config
directly with the helper:

```powershell
./scripts/update-librechat-config.ps1   # uploads librechat.yaml + restarts
```

---

## Rollback

Re-deploy a previous image tag (no rebuild needed — it's already in ACR):

```bash
az containerapp update -n ca-librechat -g rg-librechat \
  --image parkhilllibrechat.azurecr.io/librechat:v1.2.2
```
Or re-run the workflow (Actions → Run workflow) with the older tag as input.

---

## Azure resources (Subscription 2 / `rg-librechat`, region centralus)

| Resource | Name |
|---|---|
| Container App | `ca-librechat` (env `cae-librechat`) |
| Container registry | `parkhilllibrechat.azurecr.io` (repo `librechat`) |
| Config file share | storage `stlibrechatmx31a9`, share `config` (mounted at `/mnt/config`) |
| RAG vector DB | Postgres `pg-librechat-pk` (pgvector, db `librechat`) |
| App pull identity | `id-librechat` (AcrPull) |
| CI/CD identity | `id-librechat-cicd` (Contributor on `rg-librechat`) |
| Database | Azure Cosmos DB (Mongo vCore) `docdb-cluster-librechat` |
| File/avatar storage | Azure Blob container `parkhill-librechat` |

### Notes / gotchas
- The Container App runs the API with an explicit command override
  (`node api/server/index.js`) because the upstream image's `npm run backend`
  relies on `cross-env` (a devDependency pruned from the production image). This
  override persists across image updates. If the app is ever recreated from
  scratch, re-apply it: `--command node --args api/server/index.js`.
- Keeping the fork updated with upstream: see `CUSTOMIZATIONS.md` and
  `scripts/update-from-upstream.ps1`.
