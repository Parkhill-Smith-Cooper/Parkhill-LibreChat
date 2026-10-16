# Pirros MCP proxy

Connects LibreChat to the Pirros MCP server (`https://external-api.pirros.com/mcp`).

## Why a proxy

Pirros offers two kinds of credential, and neither works from LibreChat on its own:

- **AI client** credentials use browser sign-in, but Pirros returns users only to the fixed
  addresses of its five listed clients (ChatGPT, Claude, Claude Code, Codex, Cursor). It rejects
  LibreChat's callback with `invalid_request: redirect_uri is not an address the credential's
  client registers`.
- **API** credentials get a token with the `client_credentials` grant, and the MCP endpoint
  accepts that token. The token lasts one hour, and LibreChat's MCP client cannot request or renew
  this kind of token itself.

This proxy holds an API credential, keeps a token fresh, and forwards MCP traffic with it.
LibreChat reaches it at `http://localhost:8932/mcp` with no auth, so the secret never enters
LibreChat's config, database or logs.

## What users get

There is no per-user sign-in. Every LibreChat user gets the credential's full reach: its
workspaces, filters and actions. Pirros's usage view shows the credential, not the person.
Scope the credential to what every LibreChat user may see. Revoking it in Pirros cuts off
everyone at once.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PIRROS_API_CLIENT_ID` | required | API credential (not an AI-client credential) |
| `PIRROS_API_CLIENT_SECRET` | required | Store as a secret |
| `PIRROS_PROXY_PORT` | `8932` | Must match `librechat.yaml` and `mcpSettings.allowedAddresses` |
| `PIRROS_PROXY_HOST` | `127.0.0.1` | Keep on loopback; it must never be reachable through ingress |
| `PIRROS_SCOPE` | `pirros.mcp` | |
| `PIRROS_MCP_URL`, `PIRROS_TOKEN_URL` | Pirros production | |

## Run locally

```sh
PIRROS_API_CLIENT_ID=... PIRROS_API_CLIENT_SECRET=... node parkhill/pirros-proxy/main.mjs
node --test parkhill/pirros-proxy/server.test.mjs
```

## Deploy

Build into ACR and add it as another container in `ca-librechat`, next to `api`. Containers in
one replica share `localhost`, the same way the Microsoft 365 sidecar is reached on
`localhost:8931`. Do not publish port 8932 through ingress.

```sh
az acr build -r parkhilllibrechat -t pirros-proxy:<tag> -f parkhill/pirros-proxy/Dockerfile parkhill/pirros-proxy
```
