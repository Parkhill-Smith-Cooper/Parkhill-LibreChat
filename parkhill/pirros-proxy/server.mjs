// Pirros MCP proxy (Parkhill fork).
//
// Pirros only lets its five listed AI clients sign in through the browser, so
// LibreChat cannot use per-user OAuth there. A Pirros *API* credential can,
// however, take a client_credentials token that the MCP endpoint accepts. This
// proxy holds that credential, keeps a token fresh, and forwards MCP traffic to
// Pirros with it. LibreChat connects to it on localhost with no auth at all, so
// the client secret never enters LibreChat's config, database or logs.
//
// It binds 127.0.0.1 by default: in the Container App it is reachable only from
// the containers in the same replica, never through ingress.

import http from 'node:http';
import { Readable } from 'node:stream';

const env = process.env;
const config = {
  clientId: env.PIRROS_API_CLIENT_ID,
  clientSecret: env.PIRROS_API_CLIENT_SECRET,
  mcpUrl: env.PIRROS_MCP_URL ?? 'https://external-api.pirros.com/mcp',
  tokenUrl: env.PIRROS_TOKEN_URL ?? 'https://auth.pirros.com/oauth/token',
  scope: env.PIRROS_SCOPE ?? 'pirros.mcp',
  // Prefixed, not HOST/PORT: those belong to LibreChat in a shared .env.
  host: env.PIRROS_PROXY_HOST ?? '127.0.0.1',
  port: Number(env.PIRROS_PROXY_PORT ?? 8932),
};

/** Request headers worth forwarding; everything else (cookies, auth, LibreChat's own) is dropped. */
const FORWARD_REQUEST = [
  'accept',
  'content-type',
  'last-event-id',
  'mcp-session-id',
  'mcp-protocol-version',
];
const FORWARD_RESPONSE = ['content-type', 'cache-control', 'mcp-session-id', 'mcp-protocol-version'];
/** Renew this long before expiry so a token never lapses mid-request. */
const EXPIRY_MARGIN_MS = 60_000;
/**
 * After a failed token request, fail fast for this long instead of asking again.
 * LibreChat retries a broken server constantly, and Pirros rate-limits
 * authentication attempts per credential. Doubles on each consecutive failure.
 */
const FAILURE_COOLDOWN_MS = 30_000;
const MAX_FAILURE_COOLDOWN_MS = 300_000;

const log = (level, message, extra = {}) =>
  console.log(JSON.stringify({ level, message, ...extra, time: new Date().toISOString() }));

/**
 * One cached token, renewed on demand. Concurrent callers share the in-flight
 * request rather than each asking Pirros for a token.
 */
export function createTokenSource(
  { clientId, clientSecret, tokenUrl, scope },
  fetchImpl = fetch,
  now = Date.now,
) {
  let cached = null;
  let pending = null;
  let failure = null;

  async function request() {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });
    const res = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || typeof json.access_token !== 'string') {
      // error/error_description are Pirros's own codes; never log the request body.
      throw Object.assign(new Error('Pirros token request failed'), {
        status: res.status,
        code: json.error ?? 'unknown',
        description: json.error_description,
        // Pirros puts retry_after (seconds) in the body; honor the header too.
        retryAfterMs: (Number(json.retry_after) || Number(res.headers.get('retry-after')) || 0) * 1000,
        tokenFailure: true,
      });
    }
    const ttlMs = (Number(json.expires_in) || 3600) * 1000;
    return { token: json.access_token, expiresAt: now() + ttlMs - EXPIRY_MARGIN_MS };
  }

  async function renew() {
    try {
      const result = await request();
      failure = null;
      return result;
    } catch (error) {
      const backoff = Math.min(
        MAX_FAILURE_COOLDOWN_MS,
        failure ? failure.backoffMs * 2 : FAILURE_COOLDOWN_MS,
      );
      failure = {
        error,
        backoffMs: backoff,
        until: now() + Math.max(backoff, error.retryAfterMs ?? 0),
      };
      log('error', 'Pirros token request failed; pausing token requests', {
        status: error.status,
        code: error.code,
        description: error.description,
        retryInSeconds: Math.round((failure.until - now()) / 1000),
      });
      throw error;
    }
  }

  return {
    async get() {
      if (cached && cached.expiresAt > now()) {
        return cached.token;
      }
      if (failure && failure.until > now()) {
        throw failure.error;
      }
      pending ??= renew().finally(() => {
        pending = null;
      });
      cached = await pending;
      return cached.token;
    },
    invalidate() {
      cached = null;
    },
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export function createProxy(cfg, fetchImpl = fetch) {
  const tokens = createTokenSource(cfg, fetchImpl);
  const target = new URL(cfg.mcpUrl);

  async function forward(req, body, signal) {
    const headers = {};
    for (const name of FORWARD_REQUEST) {
      const value = req.headers[name];
      if (value != null) {
        headers[name] = value;
      }
    }
    headers.authorization = `Bearer ${await tokens.get()}`;
    return fetchImpl(target, { method: req.method, headers, body, signal });
  }

  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://proxy').pathname;
    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
      // MCP requests are small JSON-RPC messages; buffering lets a 401 be retried.
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      let upstream = await forward(req, body, abort.signal);
      if (upstream.status === 401) {
        await upstream.body?.cancel();
        log('info', 'Pirros rejected the token; renewing and retrying once');
        tokens.invalidate();
        upstream = await forward(req, body, abort.signal);
      }

      const headers = {};
      for (const name of FORWARD_RESPONSE) {
        const value = upstream.headers.get(name);
        if (value != null) {
          headers[name] = value;
        }
      }
      res.writeHead(upstream.status, headers);
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      // Token failures were already logged once, when the cooldown started.
      if (!error?.tokenFailure) {
        log('error', 'Pirros proxy request failed', { name: error?.name, message: error?.message });
      }
      if (!res.headersSent) {
        // A JSON-RPC error rather than a 401: LibreChat treats any 401 as an OAuth challenge.
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Pirros is unavailable through the Parkhill proxy.' },
          }),
        );
      } else {
        res.destroy();
      }
    }
  });
}

export function main() {
  if (!config.clientId || !config.clientSecret) {
    log('error', 'PIRROS_API_CLIENT_ID and PIRROS_API_CLIENT_SECRET are required');
    process.exit(1);
  }
  createProxy(config).listen(config.port, config.host, () => {
    log('info', `Pirros MCP proxy listening on http://${config.host}:${config.port}/mcp`);
  });
}
