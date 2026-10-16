import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProxy, createTokenSource } from './server.mjs';

const cfg = {
  clientId: 'id',
  clientSecret: 'secret',
  mcpUrl: 'https://pirros.test/mcp',
  tokenUrl: 'https://auth.pirros.test/oauth/token',
  scope: 'pirros.mcp',
};

/** Fake Pirros: issues numbered tokens and accepts only the ones listed in `valid`. */
function fakePirros({ valid = () => true, tokenStatus = 200 } = {}) {
  const calls = { token: 0, mcp: [] };
  const fetchImpl = async (url, init) => {
    if (String(url) === cfg.tokenUrl) {
      calls.token += 1;
      if (tokenStatus !== 200) {
        return Response.json({ error: 'invalid_client' }, { status: tokenStatus });
      }
      return Response.json({ access_token: `tok-${calls.token}`, expires_in: 3600 });
    }
    calls.mcp.push(init);
    if (!valid(init.headers.authorization)) {
      return new Response('{}', { status: 401 });
    }
    return new Response('{"jsonrpc":"2.0","id":1,"result":{}}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'mcp-session-id': 's1', 'set-cookie': 'x=1' },
    });
  };
  return { calls, fetchImpl };
}

async function withProxy(fetchImpl, run) {
  const server = createProxy(cfg, fetchImpl).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.close();
  }
}

const post = (base, headers = {}) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}',
  });

test('token source shares one in-flight request and caches the result', async () => {
  const { calls, fetchImpl } = fakePirros();
  const tokens = createTokenSource(cfg, fetchImpl);
  const [a, b] = await Promise.all([tokens.get(), tokens.get()]);
  assert.equal(a, 'tok-1');
  assert.equal(b, 'tok-1');
  assert.equal(await tokens.get(), 'tok-1');
  assert.equal(calls.token, 1);
});

test('a failed token request pauses further requests, then retries', async () => {
  const { calls, fetchImpl } = fakePirros({ tokenStatus: 429 });
  let clock = 1_000_000;
  const tokens = createTokenSource(cfg, fetchImpl, () => clock);
  await assert.rejects(tokens.get(), { code: 'invalid_client' });
  await assert.rejects(tokens.get(), { code: 'invalid_client' });
  assert.equal(calls.token, 1);
  clock += 31_000;
  await assert.rejects(tokens.get());
  assert.equal(calls.token, 2);
  clock += 31_000;
  await assert.rejects(tokens.get());
  assert.equal(calls.token, 2, 'second failure doubles the pause to 60s');
});

test('forwards with the Pirros token and drops caller credentials', async () => {
  const { calls, fetchImpl } = fakePirros();
  await withProxy(fetchImpl, async (base) => {
    const res = await post(base, { authorization: 'Bearer from-librechat', cookie: 'c=1' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('mcp-session-id'), 's1');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal((await res.json()).jsonrpc, '2.0');
  });
  assert.equal(calls.mcp[0].headers.authorization, 'Bearer tok-1');
  assert.equal(calls.mcp[0].headers.cookie, undefined);
});

test('renews the token once when Pirros rejects it', async () => {
  const { calls, fetchImpl } = fakePirros({ valid: (auth) => auth !== 'Bearer tok-1' });
  await withProxy(fetchImpl, async (base) => {
    assert.equal((await post(base)).status, 200);
  });
  assert.equal(calls.token, 2);
  assert.equal(calls.mcp.length, 2);
});

test('a token failure becomes a 502 JSON-RPC error, never a 401', async () => {
  const { fetchImpl } = fakePirros({ tokenStatus: 401 });
  await withProxy(fetchImpl, async (base) => {
    const res = await post(base);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.code, -32603);
    assert.doesNotMatch(JSON.stringify(body), /secret|invalid_client/);
  });
});

test('only /mcp and /healthz are served', async () => {
  const { calls, fetchImpl } = fakePirros();
  await withProxy(fetchImpl, async (base) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/other`)).status, 404);
  });
  assert.equal(calls.mcp.length, 0);
});
