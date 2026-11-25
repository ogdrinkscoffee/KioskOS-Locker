import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdateFeedPayload, resolveFeedOrigin } from './updateFeed.ts';

test('resolveFeedOrigin uses forwarded host over https', () => {
  const origin = resolveFeedOrigin({
    forwardedProto: 'http',
    forwardedHost: 'ironclad.example.com',
    host: 'internal:3000',
  });
  assert.equal(origin, 'https://ironclad.example.com');
});

test('resolveFeedOrigin falls back to hosted https origin for localhost requests', () => {
  const origin = resolveFeedOrigin({
    protocol: 'http',
    host: 'localhost:3000',
    fallbackOrigin: 'https://ais-pre-u5dgsx5axes4w2tjefjlrb-528486795455.europe-west1.run.app',
  });
  assert.equal(
    origin,
    'https://ais-pre-u5dgsx5axes4w2tjefjlrb-528486795455.europe-west1.run.app',
  );
});

test('resolveFeedOrigin rejects malformed Host headers', () => {
  const origin = resolveFeedOrigin({
    host: 'evil.com/path?foo=bar',
    fallbackOrigin: 'https://safe.example.com',
  });
  assert.equal(origin, 'https://safe.example.com');
});

test('buildUpdateFeedPayload constructs valid HTTPS manifest matching APK metadata', () => {
  const payload = buildUpdateFeedPayload(
    {
      version: '1.3.4',
      versionCode: 11,
      sizeBytes: 5098200,
      sha256: '46acfeec5cd1fd28932f7fc307ab4588786852ba1c65a478a028a0c6eba639d4',
      generatedAt: '2026-11-25T13:40:00.405Z',
    },
    'https://example.org/',
  );

  assert.equal(payload.version, '1.3.4');
  assert.equal(payload.versionCode, 11);
  assert.equal(payload.apkUrl, 'https://example.org/downloads/IroncladOS.apk');
  assert.equal(payload.sha256.length, 64);
  assert.equal(payload.sizeBytes, 5098200);
});
