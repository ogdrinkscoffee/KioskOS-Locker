import assert from 'node:assert/strict';
import test from 'node:test';
import { TURNSTILE_SITEVERIFY_URL, verifyTurnstileChallenge } from './turnstile';

test('verifyTurnstileChallenge rejects non-empty honeypot before checking token or network', async () => {
  let calledFetch = false;
  const result = await verifyTurnstileChallenge({
    captchaToken: 'valid-token',
    honeypot: 'https://spam.example',
    secretKey: 'secret-key',
    fetchImpl: (async () => {
      calledFetch = true;
      return new Response('{}');
    }) as typeof fetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(calledFetch, false);
});

test('verifyTurnstileChallenge fails closed with 503 when TURNSTILE_SECRET_KEY is missing', async () => {
  const result = await verifyTurnstileChallenge({
    captchaToken: 'valid-token',
    honeypot: '',
    secretKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});

test('verifyTurnstileChallenge rejects missing or blank captchaToken', async () => {
  const result = await verifyTurnstileChallenge({
    captchaToken: '   ',
    honeypot: '',
    secretKey: 'secret-key',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('verifyTurnstileChallenge verifies valid token via Cloudflare siteverify endpoint', async () => {
  let seenUrl = '';
  let seenBody = '';
  const result = await verifyTurnstileChallenge({
    captchaToken: 'tok_12345',
    honeypot: '',
    secretKey: 'sec_999',
    remoteIp: '203.0.113.5',
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(input);
      seenBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(seenUrl, TURNSTILE_SITEVERIFY_URL);
  assert.ok(seenBody.includes('secret=sec_999'));
  assert.ok(seenBody.includes('response=tok_12345'));
  assert.ok(seenBody.includes('remoteip=203.0.113.5'));
});

test('verifyTurnstileChallenge rejects invalid Cloudflare verification with 403', async () => {
  const result = await verifyTurnstileChallenge({
    captchaToken: 'bad_token',
    honeypot: '',
    secretKey: 'sec_999',
    fetchImpl: (async () => {
      return new Response(
        JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
        { status: 200 }
      );
    }) as typeof fetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.deepEqual(result.errorCodes, ['invalid-input-response']);
});
