import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createInitialKioskState } from './src/utils/kioskEngine';
import { createInitialSelfImprovementState } from './src/utils/selfImprovementEngine';
import {
  buildDeviceSyncPayload,
  buildGrowthSyncPayload,
  generatePinSalt,
  hashPinWithSalt,
} from './src/utils/cloudSyncEngine';

const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8')) as {
  entities: Record<string, { required: string[]; properties: Record<string, unknown> }>;
  firestore: Record<string, unknown>;
};

test('firestore.rules enforces global default-deny and verified email ownership', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesContent, /request\.auth != null/);
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /request\.auth\.uid == userId/);
  assert.match(rulesContent, /allow delete: if false;/);
});

test('firestore.rules validates Dirty Dozen invariants: IDs, immutable fields, request.time, and field allowlists', () => {
  // No plaintext adminPin key is permitted anywhere in device snapshot allowlists
  assert.equal(rulesContent.includes("'adminPin'"), false);
  assert.match(rulesContent, /'adminPinSalt'/);
  assert.match(rulesContent, /'adminPinHash'/);
  assert.match(rulesContent, /data\.adminPinHash\.matches\('\^\[a-f0-9\]\{64\}\$'\)/);

  // Immutable ownership & creation timestamp checks
  assert.match(rulesContent, /incoming\(\)\.ownerId == existing\(\)\.ownerId/);
  assert.match(rulesContent, /incoming\(\)\.deviceId == existing\(\)\.deviceId/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);

  // Strict map/field whitelisting via hasAll + hasOnly
  assert.match(rulesContent, /data\.keys\(\)\.hasAll/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly/);
});

test('device and growth sync payloads satisfy every required key in firebase-blueprint.json', async () => {
  const state = createInitialKioskState();
  const salt = generatePinSalt();
  const hash = await hashPinWithSalt(state.adminPin, salt);
  const devicePayload = buildDeviceSyncPayload({
    state,
    ownerId: 'uid_test_1',
    deviceId: 'sim-device-1',
    adminPinSalt: salt,
    adminPinHash: hash,
    source: 'web_simulator',
  });

  const deviceDocWithTimestamps: Record<string, unknown> = {
    ...devicePayload,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  for (const reqKey of blueprint.entities.DeviceSyncSnapshot.required) {
    assert.ok(
      reqKey in deviceDocWithTimestamps,
      `Missing required DeviceSyncSnapshot field: ${reqKey}`
    );
  }
  assert.equal('adminPin' in deviceDocWithTimestamps, false);

  const growthPayload = buildGrowthSyncPayload({
    growth: createInitialSelfImprovementState(),
    ownerId: 'uid_test_1',
    source: 'pc_web',
  });

  const growthDocWithTimestamps: Record<string, unknown> = {
    ...growthPayload,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  for (const reqKey of blueprint.entities.GrowthProgress.required) {
    assert.ok(
      reqKey in growthDocWithTimestamps,
      `Missing required GrowthProgress field: ${reqKey}`
    );
  }
  assert.equal('affirmations' in growthDocWithTimestamps, false);
  assert.equal(rulesContent.includes('affirmations'), false);
  assert.match(rulesContent, /isValidAdminRestrictions/);
  assert.match(rulesContent, /'adminRestrictions'/);
});
