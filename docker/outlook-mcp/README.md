# outlook-mcp sidecar image

The `outlook-mcp` MCP server in `librechat.yaml` is [Softeria's
ms-365-mcp-server](https://github.com/softeria/ms-365-mcp-server) (MIT), built into
`parkhilllibrechat.azurecr.io/ms365-mcp` and run as a container inside `ca-librechat`
alongside `api`, `meilisearch` and `rag-api`. It listens on `localhost:8931` and is
never published through the Container App's ingress, so the only thing that can reach
it is the `api` container beside it.

We build it ourselves rather than pulling a published image, because it needs one patch.

## Why the patch

`no-protected-resource-metadata.patch` makes the server return 404 for
`/.well-known/oauth-protected-resource` (RFC 9728 Protected Resource Metadata).

LibreChat copies PRM's `resource` value onto the Entra `/authorize` request
unconditionally — both on the discovered path and on the pre-configured one, with no
setting to turn it off (`MCPOAuthHandler`, "Added resource parameter to pre-configured
authorization URL"). Entra then evaluates the requested Microsoft Graph scopes against
resource `http://localhost:8931/mcp`, which is not a registered application in the
tenant. It therefore cannot match them to the tenant-wide admin consent grant, and
returns **AADSTS90095** ("Admin consent is required") to every user who cannot
self-consent — which is all of them, since user consent is disabled tenant-wide.

Admins escape it because Entra offers them an interactive consent prompt; everyone else
is dead-ended at "Approval required". That is why this looked like a consent
misconfiguration for a long time when the consent setup was in fact correct.

Suppressing PRM is the only workable fix on our side:

- LibreChat omits `resource` **only** when PRM discovery returns nothing.
- Pointing the PRM `resource` somewhere else does not help — `assertResourceBoundToServer`
  *throws* on a mismatch ("Refusing OAuth flow") rather than skipping it.
- There is no upstream flag. `--no-dynamic-registration` / `MS365_MCP_DISABLE_DCR`
  disables the `/register` endpoint only.

Authentication is unaffected. LibreChat still obtains the Graph token directly from
Entra using the pinned endpoints in `librechat.yaml`, and the sidecar still validates the
bearer against Graph. PRM only advertises *where* to authenticate, which we already
specify explicitly.

## Rebuilding

```powershell
./docker/outlook-mcp/build.ps1 -Version v0.146.2 -Suffix pk.1
```

Then point the container at the new tag (`az containerapp update --yaml`).

**On every upstream bump**, re-run with the new `-Version` and bump `-Suffix`. If the
patch stops applying, re-apply it by hand — it is ~4 lines around the two
`app.get('/.well-known/oauth-protected-resource'...)` route registrations in
`src/server.ts`.

Re-test with a **non-admin** user afterwards. An admin succeeding proves nothing here,
because admins get the interactive consent prompt that everyone else is denied.

## Related config

- `librechat.yaml` → `mcpServers.outlook-mcp` (pinned Entra OAuth endpoints, scopes,
  `startup: false`)
- `librechat.yaml` → `mcpSettings.allowedAddresses` (`localhost:8931` SSRF exemption)
- Entra app registration **Parkhill AI - Outlook MCP** — the `scope:` in `librechat.yaml`
  must stay an exact subset of the admin-consented delegated permissions, or non-admin
  users break again.
