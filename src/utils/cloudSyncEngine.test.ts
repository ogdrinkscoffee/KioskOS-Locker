import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createInitialKioskState } from './kioskEngine';
import { createInitialSelfImprovementState } from './selfImprovementEngine';
import {
  applyRemoteDeviceToKioskState,
  applyRemoteGrowthToLocalState,
  buildDeviceSyncPayload,
  buildGrowthSyncPayload,
  generatePinSalt,
  hashPinWithSalt,
  sanitizeFirestoreId,
  verifyAdminPasscodeHash,
} from './cloudSyncEngine';

test('salted SHA-256 Admin Password hashing matches Android KioskPreferences format', async () => {
  const salt = '0123456789abcdef0123456789abcdef';
  const pin = 'KioskAdmin!2026#SafePassphrase';
  const computed = await hashPinWithSalt(pin, salt);
  const expected = createHash('sha256').update(`${salt}:${pin}`, 'utf8').digest('hex');

  assert.equal(computed, expected);
  assert.equal(computed.length, 64);
  assert.equal(await verifyAdminPasscodeHash(pin, salt, computed), true);
  assert.equal(await verifyAdminPasscodeHash('wrong-pass', salt, computed), false);
  assert.equal(await verifyAdminPasscodeHash('   ', salt, computed), false);
});

test('supports default 1234 and 50-character alphanumeric/symbol Admin Passwords', async () => {
  const saltDefault = generatePinSalt();
  const hashDefault = await hashPinWithSalt('1234', saltDefault);
  assert.equal(await verifyAdminPasscodeHash('1234', saltDefault, hashDefault), true);

  const fiftyCharPin = 'K!o$k#2026_LongPassphrase_Verification_50Chars_01!';
  assert.equal(fiftyCharPin.length, 50);
  const saltLong = generatePinSalt();
  const hashLong = await hashPinWithSalt(fiftyCharPin, saltLong);
  assert.equal(await verifyAdminPasscodeHash(fiftyCharPin, saltLong, hashLong), true);
  assert.equal(await verifyAdminPasscodeHash(`${fiftyCharPin}x`, saltLong, hashLong), false);
});

test('sanitizeFirestoreId strips path traversal and enforces allowed ID charset', () => {
  assert.equal(sanitizeFirestoreId('../users/other'), '___users_other');
  assert.equal(sanitizeFirestoreId('   ', 'fallback-id'), 'fallback-id');
  assert.equal(sanitizeFirestoreId('a'.repeat(200)).length, 128);
});

test('buildDeviceSyncPayload excludes plaintext adminPin and bounds all lists/numbers', async () => {
  const state = createInitialKioskState();
  state.adminPin = 'MySecret50CharPass!@#';
  state.panicLockUntilMs = Date.now() + 15 * 60_000;
  state.panicCount = 2;

  const salt = generatePinSalt();
  const hash = await hashPinWithSalt(state.adminPin, salt);

  const payload = buildDeviceSyncPayload({
    state,
    ownerId: 'uid_user_1',
    deviceId: 'web-simulator-1',
    platform: 'web_simulator',
    adminPinSalt: salt,
    adminPinHash: hash,
    source: 'web_simulator',
  });

  assert.equal('adminPin' in (payload as unknown as Record<string, unknown>), false);
  assert.equal(payload.adminPinSalt, salt);
  assert.equal(payload.adminPinHash, hash);
  assert.equal(payload.ownerId, 'uid_user_1');
  assert.equal(payload.deviceId, 'web-simulator-1');
  assert.equal(payload.panicCount, 2);
});

test('applyRemoteDeviceToKioskState applies PC password-authorized overrides cleanly', async () => {
  const local = createInitialKioskState();
  local.panicLockUntilMs = Date.now() + 600_000;
  local.kioskMode = 'single_app';

  const nextPin = 'RemoteRotated#Pass99';
  const nextSalt = generatePinSalt();
  const nextHash = await hashPinWithSalt(nextPin, nextSalt);

  const remotePayload = buildDeviceSyncPayload({
    state: {
      ...local,
      panicLockUntilMs: 0,
      kioskMode: 'multi_app',
      kioskTitle: 'Recovered Focus Phone',
    },
    ownerId: 'uid_user_1',
    deviceId: 'web-simulator-1',
    adminPinSalt: nextSalt,
    adminPinHash: nextHash,
    source: 'pc_web',
  });

  const merged = applyRemoteDeviceToKioskState(
    local,
    {
      ...remotePayload,
      adminRestrictions: {
        ...local.adminRestrictions,
        DISALLOW_SAFE_BOOT: false,
      },
    },
    nextPin
  );
  assert.equal(merged.panicLockUntilMs, 0);
  assert.equal(merged.kioskMode, 'multi_app');
  assert.equal(merged.kioskTitle, 'Recovered Focus Phone');
  assert.equal(merged.adminRestrictions.DISALLOW_SAFE_BOOT, false);
  assert.equal(merged.adminPin, nextPin);
  assert.match(merged.blockedNotice ?? '', /PC Web Remote/i);

  // Backward-compat fallback when remote snapshot omits adminRestrictions
  const { adminRestrictions: _omitted, ...legacyRemote } = remotePayload;
  const legacyMerged = applyRemoteDeviceToKioskState(local, legacyRemote);
  assert.equal(legacyMerged.adminRestrictions.DISALLOW_SAFE_BOOT, true);
});

test('buildGrowthSyncPayload and applyRemoteGrowthToLocalState preserve self-improvement progress', () => {
  const growth = createInitialSelfImprovementState();
  growth.cleanStreakDays = 14;
  growth.longestCleanStreakDays = 21;
  growth.urgeVictories = 9;

  const payload = buildGrowthSyncPayload({
    growth,
    ownerId: 'uid_user_1',
    source: 'pc_web',
  });

  assert.equal(payload.cleanStreakDays, 14);
  assert.equal(payload.longestCleanStreakDays, 21);
  assert.equal(payload.urgeVictories, 9);
  assert.equal(payload.lastUpdatedSource, 'pc_web');

  const localStale = createInitialSelfImprovementState();
  const synced = applyRemoteGrowthToLocalState(localStale, payload);
  assert.equal(synced.cleanStreakDays, 14);
  assert.equal(synced.longestCleanStreakDays, 21);
  assert.equal(synced.urgeVictories, 9);
  assert.equal(synced.habits.length, growth.habits.length);
});
