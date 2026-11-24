import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRUST_TIER1_THRESHOLD,
  DISTRUST_TIER2_THRESHOLD,
  KIOSK_BROWSER_PACKAGE,
  SELF_IMPROVEMENT_PACKAGE,
  activateStrictShieldLock,
  addCustomApp,
  adjustAdminUnlockTime,
  advanceAppUsage,
  applySimulatedApkUpdate,
  attemptUninstallApp,
  clearPanicLockdown,
  compareAppVersion,
  createInitialKioskState,
  DEFAULT_KIOSK_PIN,
  dismissKeyguard,
  getAdminUnlockRemainingSeconds,
  getAllInstalledApps,
  getAppRemainingSeconds,
  getAppScheduleOrLimitBlockReason,
  getEnforcedRestrictions,
  getExtendedPolicies,
  getFocusBlockRemainingMinutes,
  getLocalDateIso,
  getLockTaskFeatures,
  getLockTaskWhitelist,
  getPanicLockRemainingMinutes,
  getPinLockoutRemainingSeconds,
  getStrictShieldRemainingMinutes,
  getTamperWarningEvents,
  getVisibleHomeApps,
  isValidPinFormat,
  isWithinScheduleHours,
  launchApp,
  navigateKioskBrowser,
  openPinGate,
  pressSystemNavButton,
  reconcileAdminUnlockExpiry,
  resetAppUsage,
  resetTamperDiagnostics,
  returnToKioskHome,
  setAdminSystemUnlock,
  setAppTimeLimit,
  setFamilyDnsMode,
  setFocusBlockSession,
  setKioskOperationMode,
  simulateDeviceReboot,
  submitPin,
  testInAppBrowserAccess,
  toggleAllowedApp,
  toggleBlockerShield,
  toggleDeviceOwnerMode,
  toggleHardwarePolicy,
  triggerPanicLockdown,
  triggerScreenLock,
  updateAdminPin,
  updateAllowedDomains,
  updateBlockedKeywords,
  updateDowntimeSchedule,
  updateInAppBrowserWhitelist,
} from './kioskEngine';

test('Device Owner automatically enforces all 4 UserManager restrictions', () => {
  const state = createInitialKioskState();
  const restrictions = getEnforcedRestrictions(state);
  assert.deepEqual(restrictions, {
    DISALLOW_SAFE_BOOT: true,
    DISALLOW_FACTORY_RESET: true,
    DISALLOW_ADD_USER: true,
    DISALLOW_APPS_CONTROL: true,
  });

  const nonOwner = toggleDeviceOwnerMode(state, false);
  assert.deepEqual(getEnforcedRestrictions(nonOwner), {
    DISALLOW_SAFE_BOOT: false,
    DISALLOW_FACTORY_RESET: false,
    DISALLOW_ADD_USER: false,
    DISALLOW_APPS_CONTROL: false,
  });
});

test('Settings and uninstallation are blocked unless unlocked with Admin PIN', () => {
  const state = createInitialKioskState();

  const blockedSettings = launchApp(state, 'com.android.settings');
  assert.equal(blockedSettings.activeScreen, 'home');
  assert.ok(blockedSettings.blockedNotice?.includes('blocked'));

  const blockedUninstall = attemptUninstallApp(state, 'com.enterprise.pos');
  assert.ok(blockedUninstall.blockedNotice?.includes('blocked'));

  const gated = openPinGate(state, 'admin_settings');
  const { verified, nextState: inAdmin } = submitPin(gated, DEFAULT_KIOSK_PIN);
  assert.equal(verified, true);
  assert.equal(inAdmin.activeScreen, 'admin_settings');

  const unlocked = setAdminSystemUnlock(inAdmin, true);
  assert.equal(getEnforcedRestrictions(unlocked).DISALLOW_APPS_CONTROL, false);

  const openedSettings = launchApp(unlocked, 'com.android.settings');
  assert.equal(openedSettings.activeScreen, 'android_settings');
  assert.equal(openedSettings.blockedNotice, null);

  const relocked = returnToKioskHome(openedSettings);
  assert.equal(relocked.adminUnlocked, false);
  assert.equal(getEnforcedRestrictions(relocked).DISALLOW_APPS_CONTROL, true);
});

test('Admin can add any custom app, change PIN from 1234, launch via startLockTask, and survive reboot', () => {
  let state = createInitialKioskState();

  const gated = openPinGate(state, 'admin_settings');
  const badAttempt = submitPin(gated, '0000');
  assert.equal(badAttempt.verified, false);

  const goodAttempt = submitPin(gated, '1234');
  assert.equal(goodAttempt.verified, true);
  state = goodAttempt.nextState;

  // Reject restricted system package and invalid format
  assert.equal(addCustomApp(state, 'Settings', 'com.android.settings').ok, false);
  assert.equal(addCustomApp(state, 'Bad', 'invalid').ok, false);

  // Add custom app
  const added = addCustomApp(state, 'Kindle Reader', 'com.amazon.kindle');
  assert.equal(added.ok, true);
  state = added.nextState;
  assert.ok(getLockTaskWhitelist(state).includes('com.amazon.kindle'));

  // Allow Calculator too
  state = toggleAllowedApp(state, 'com.android.calculator2');
  assert.ok(getLockTaskWhitelist(state).includes('com.android.calculator2'));

  // Change PIN
  const updatedPin = updateAdminPin(state, '1234', '5678', '5678');
  assert.equal(updatedPin.ok, true);
  state = updatedPin.nextState;

  // Launch custom app via startLockTask in kiosk mode, then unlock for admin and reboot
  state = launchApp(state, 'com.amazon.kindle');
  assert.equal(state.activeScreen, 'app_lock_task');
  assert.equal(state.lockTaskActive, true);

  state = setAdminSystemUnlock(state, true);
  assert.equal(state.adminUnlocked, true);

  const afterReboot = simulateDeviceReboot(state);
  assert.equal(afterReboot.activeScreen, 'home');
  assert.equal(afterReboot.adminUnlocked, false);
  assert.equal(afterReboot.adminPin, '5678');
  assert.equal(afterReboot.rebootCount, 1);
  assert.ok(
    getVisibleHomeApps(afterReboot).some((app) => app.packageName === 'com.amazon.kindle')
  );
  assert.ok(
    getVisibleHomeApps(afterReboot).some((app) => app.packageName === 'com.android.calculator2')
  );
});

test('Integrated Self-Improvement app launches inside LockTask mode', () => {
  const state = createInitialKioskState();
  const launched = launchApp(state, SELF_IMPROVEMENT_PACKAGE);
  assert.equal(launched.activeScreen, 'self_improvement');
  assert.equal(launched.lockTaskActive, true);
});

test('Admin Passcode allows letters, digits, symbols up to 50 chars and rejects >50 or <4', () => {
  assert.equal(isValidPinFormat('abc'), false);
  assert.equal(isValidPinFormat('    '), false);
  assert.equal(isValidPinFormat('A!b2'), true);

  const fiftyCharPassphrase = 'Kiosk!Admin#2026_Recovery_Strict_Mode_50Chars_Max!';
  assert.equal(fiftyCharPassphrase.length, 50);
  assert.equal(isValidPinFormat(fiftyCharPassphrase), true);
  assert.equal(isValidPinFormat(`${fiftyCharPassphrase}X`), false);

  let state = createInitialKioskState();
  const updated = updateAdminPin(state, '1234', fiftyCharPassphrase, fiftyCharPassphrase);
  assert.equal(updated.ok, true);
  state = simulateDeviceReboot(updated.nextState);
  assert.equal(state.adminPin, fiftyCharPassphrase);

  const gated = openPinGate(state, 'admin_settings');
  const verified = submitPin(gated, fiftyCharPassphrase);
  assert.equal(verified.verified, true);
  assert.equal(verified.nextState.activeScreen, 'admin_settings');
});

test('Five consecutive failed Admin passcodes trigger 30-second security cooldown', () => {
  let state = openPinGate(createInitialKioskState(), 'admin_settings');
  const baseTime = 1_000_000;

  for (let i = 0; i < 4; i += 1) {
    const res = submitPin(state, 'wrong', '08:31:00', baseTime + i * 1000);
    assert.equal(res.verified, false);
    assert.equal(res.lockedOutSeconds, undefined);
    state = res.nextState;
  }

  const fifth = submitPin(state, 'wrong', '08:31:05', baseTime + 4000);
  assert.equal(fifth.verified, false);
  assert.equal(fifth.lockedOutSeconds, 30);
  state = fifth.nextState;

  // Even correct PIN is rejected during cooldown window
  const blockedDuringCooldown = submitPin(state, '1234', '08:31:10', baseTime + 10_000);
  assert.equal(blockedDuringCooldown.verified, false);
  assert.ok((blockedDuringCooldown.lockedOutSeconds ?? 0) > 0);

  // After 31 seconds, valid PIN succeeds
  const afterCooldown = submitPin(state, '1234', '08:31:40', baseTime + 35_000);
  assert.equal(afterCooldown.verified, true);
});

test('Hardware policies & Locked Kiosk Browser enforce Camera disable and domain filtering', () => {
  let state = createInitialKioskState();
  state = toggleAllowedApp(state, 'com.android.camera2');
  state = toggleHardwarePolicy(state, 'cameraDisabled', true);
  assert.equal(getExtendedPolicies(state).SET_CAMERA_DISABLED, true);

  const camAttempt = launchApp(state, 'com.android.camera2');
  assert.ok(camAttempt.blockedNotice?.includes('Camera is disabled'));

  state = launchApp(state, KIOSK_BROWSER_PACKAGE);
  assert.equal(state.activeScreen, 'kiosk_browser');

  const okNav = navigateKioskBrowser(state, 'https://en.wikipedia.org/wiki/Focus');
  assert.equal(okNav.ok, true);
  assert.equal(okNav.host, 'en.wikipedia.org');

  const socialBlocked = navigateKioskBrowser(okNav.nextState, 'https://instagram.com');
  assert.equal(socialBlocked.ok, false);
  assert.ok(socialBlocked.reason?.includes('Blocked distraction'));

  const adultBlocked = navigateKioskBrowser(okNav.nextState, 'pornhub.com');
  assert.equal(adultBlocked.ok, false);

  const unlistedBlocked = navigateKioskBrowser(okNav.nextState, 'https://example.org');
  assert.equal(unlistedBlocked.ok, false);

  state = updateAllowedDomains(okNav.nextState, ['wikipedia.org', 'instagram.com', 'khanacademy.org']);
  // Explicitly verify blocked distraction domains are stripped even if typed into allowlist
  assert.equal(state.allowedDomains.includes('instagram.com'), false);
  assert.equal(state.allowedDomains.includes('khanacademy.org'), true);
});

test('Single-App and Browser-Only boot modes auto-launch pinned target on reboot', () => {
  let state = createInitialKioskState();
  state = setKioskOperationMode(state, 'single_app', SELF_IMPROVEMENT_PACKAGE);
  const afterSingleReboot = simulateDeviceReboot(state);
  assert.equal(afterSingleReboot.activeScreen, 'self_improvement');
  assert.equal(afterSingleReboot.lockTaskActive, true);

  state = setKioskOperationMode(state, 'kiosk_browser');
  const afterBrowserReboot = simulateDeviceReboot(state);
  assert.equal(afterBrowserReboot.activeScreen, 'kiosk_browser');
  assert.equal(afterBrowserReboot.lockTaskActive, true);
});

test('BlockP & BlockerX shields block porn keywords, /shorts feeds, unsupported browsers, and non-whitelisted in-app browsers', () => {
  let state = createInitialKioskState();

  // In-app browser check: blocks non-whitelisted packages (Instagram/Reddit), permits Slack & KioskOS
  const igCheck = testInAppBrowserAccess(state, 'com.instagram.android');
  assert.equal(igCheck.allowed, false);
  assert.ok(igCheck.reason.includes('Blocked embedded In-App Browser'));

  const slackCheck = testInAppBrowserAccess(state, 'com.Slack');
  assert.equal(slackCheck.allowed, true);
  assert.ok(slackCheck.reason.includes('Admin In-App Whitelist'));

  // Adding package to In-App Whitelist allows it
  state = updateInAppBrowserWhitelist(state, ['com.Slack', 'com.reddit.frontpage']);
  const redditAllowed = testInAppBrowserAccess(state, 'com.reddit.frontpage');
  assert.equal(redditAllowed.allowed, true);

  // Turning off in-app browser shield permits unwhitelisted apps
  const disabledInApp = toggleBlockerShield(state, 'blockInAppBrowsers', false);
  assert.equal(disabledInApp.ok, true);
  assert.equal(testInAppBrowserAccess(disabledInApp.nextState, 'com.instagram.android').allowed, true);

  // Unsupported third-party browsers (Firefox, DuckDuckGo) are suspended/blocked
  state = toggleAllowedApp(state, 'org.mozilla.firefox');
  const firefoxBlocked = launchApp(state, 'org.mozilla.firefox');
  assert.equal(firefoxBlocked.activeScreen, 'home');
  assert.ok(firefoxBlocked.blockedNotice?.includes('Unsupported Browser Shield'));

  // Keyword & Short-Form Feed blocking on allowlisted host in Kiosk Browser
  state = updateBlockedKeywords(state, ['porn', 'nsfw', 'gambling']);
  const keywordNav = navigateKioskBrowser(state, 'https://wikipedia.org/wiki?q=nsfw');
  assert.equal(keywordNav.ok, false);
  assert.ok(keywordNav.reason?.includes('Blocked keyword'));

  const shortsNav = navigateKioskBrowser(state, 'https://wikipedia.org/shorts');
  assert.equal(shortsNav.ok, false);
  assert.ok(shortsNav.reason?.includes('Short-form video feed'));
});

test('Strict Anti-Relapse Lock prevents weakening shields or disabling Family DNS until cooldown expires', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  // Activate 60-minute strict shield lock
  state = activateStrictShieldLock(state, 60, '09:00:00', baseTime);
  assert.equal(getStrictShieldRemainingMinutes(state, baseTime), 60);

  // Turning off disablePornOnBrowsers or Family DNS is blocked during cooldown
  const disableRes = toggleBlockerShield(state, 'disablePornOnBrowsers', false, '09:05:00', baseTime + 5 * 60_000);
  assert.equal(disableRes.ok, false);
  assert.ok(disableRes.error?.includes('Strict Anti-Relapse Lock active'));

  const dnsOffRes = setFamilyDnsMode(state, 'off', '09:05:00', baseTime + 5 * 60_000);
  assert.equal(dnsOffRes.ok, false);
  assert.ok(dnsOffRes.error?.includes('Strict Anti-Relapse Lock active'));

  // Switching to another strict DNS provider is still permitted
  const switchDnsRes = setFamilyDnsMode(state, 'cleanbrowsing', '09:05:00', baseTime + 5 * 60_000);
  assert.equal(switchDnsRes.ok, true);
  assert.equal(switchDnsRes.nextState.blockerShields.familyDnsMode, 'cleanbrowsing');

  // After 61 minutes, turning off DNS succeeds
  const afterExpiry = setFamilyDnsMode(switchDnsRes.nextState, 'off', '10:01:00', baseTime + 61 * 60_000);
  assert.equal(afterExpiry.ok, true);
  assert.equal(afterExpiry.nextState.blockerShields.familyDnsMode, 'off');
});

test('Per-app daily time limits evict active apps on exhaustion and auto-reset next calendar day', () => {
  const dayOneMs = new Date(2026, 4, 10, 10, 0, 0).getTime();
  const dayTwoMs = new Date(2026, 4, 11, 8, 0, 0).getTime();

  let state = createInitialKioskState();
  state = { ...state, usageDateIso: getLocalDateIso(dayOneMs) };

  const setRes = setAppTimeLimit(state, KIOSK_BROWSER_PACKAGE, 5, '10:00:00', dayOneMs);
  assert.equal(setRes.ok, true);
  state = setRes.nextState;
  assert.equal(getAppRemainingSeconds(state, KIOSK_BROWSER_PACKAGE, getLocalDateIso(dayOneMs)), 300);

  // Launch Kiosk Browser cleanly
  state = launchApp(state, KIOSK_BROWSER_PACKAGE, '10:01:00', dayOneMs);
  assert.equal(state.activeScreen, 'kiosk_browser');

  // Consume 4 minutes -> 60s remaining
  state = advanceAppUsage(state, KIOSK_BROWSER_PACKAGE, 240, '10:05:00', dayOneMs);
  assert.equal(state.activeScreen, 'kiosk_browser');
  assert.equal(getAppRemainingSeconds(state, KIOSK_BROWSER_PACKAGE, getLocalDateIso(dayOneMs)), 60);

  // Consume final 60s -> evicted to Home and package excluded from LockTask whitelist
  state = advanceAppUsage(state, KIOSK_BROWSER_PACKAGE, 60, '10:06:00', dayOneMs);
  assert.equal(state.activeScreen, 'home');
  assert.ok(state.blockedNotice?.includes('5m/day limit'));
  assert.equal(state.blockedAttemptsToday, 1);
  assert.equal(getLockTaskWhitelist(state, dayOneMs).includes(KIOSK_BROWSER_PACKAGE), false);

  // Re-launching on same day is blocked
  const blockedLaunch = launchApp(state, KIOSK_BROWSER_PACKAGE, '10:07:00', dayOneMs);
  assert.equal(blockedLaunch.activeScreen, 'home');
  assert.equal(blockedLaunch.blockedAttemptsToday, 2);

  // Next calendar day automatically resets usage & unblocks launch
  const nextDayLaunch = launchApp(blockedLaunch, KIOSK_BROWSER_PACKAGE, '08:00:00', dayTwoMs);
  assert.equal(nextDayLaunch.activeScreen, 'kiosk_browser');
  assert.equal(nextDayLaunch.blockedAttemptsToday, 0);
  assert.equal(
    getAppRemainingSeconds(nextDayLaunch, KIOSK_BROWSER_PACKAGE, getLocalDateIso(dayTwoMs)),
    300
  );
});

test('Quiet Hours overnight schedule and Freedom Focus Lock block non-essential apps while keeping Focus & Growth exempt', () => {
  assert.equal(isWithinScheduleHours(23, 22, 6), true);
  assert.equal(isWithinScheduleHours(5, 22, 6), true);
  assert.equal(isWithinScheduleHours(14, 22, 6), false);

  const nowMs = 1_700_000_000_000;
  let state = createInitialKioskState();
  state = launchApp(state, 'com.enterprise.pos', '09:00:00', nowMs);
  assert.equal(state.activeScreen, 'app_lock_task');

  // Starting 25m Freedom Focus Lock immediately evicts non-essential Retail POS
  const focusRes = setFocusBlockSession(state, 25, '09:01:00', nowMs);
  assert.equal(focusRes.ok, true);
  state = focusRes.nextState;
  assert.equal(state.activeScreen, 'home');
  assert.equal(getFocusBlockRemainingMinutes(state, nowMs), 25);
  assert.ok(getAppScheduleOrLimitBlockReason(state, 'com.enterprise.pos', { nowMs })?.includes('Freedom Focus Lock'));

  // Focus & Growth remains launchable even during Focus Lock
  const focusApp = launchApp(state, SELF_IMPROVEMENT_PACKAGE, '09:02:00', nowMs);
  assert.equal(focusApp.activeScreen, 'self_improvement');

  // Simulate Quiet Hours active -> also keeps non-essential apps paused when Focus ends
  const endFocus = setFocusBlockSession(state, 0, '09:26:00', nowMs + 25 * 60_000);
  assert.equal(endFocus.ok, true);
  const quietRes = updateDowntimeSchedule(
    endFocus.nextState,
    { enabled: true, startHour: 22, endHour: 6, simulateActiveNow: true },
    '09:27:00',
    nowMs
  );
  assert.equal(quietRes.ok, true);
  const blockedByQuiet = launchApp(quietRes.nextState, KIOSK_BROWSER_PACKAGE, '09:28:00', nowMs);
  assert.equal(blockedByQuiet.activeScreen, 'home');
  assert.ok(blockedByQuiet.blockedNotice?.includes('Scheduled Quiet Hours'));
});

test('Strict Anti-Relapse Lock prevents removing app time limits, resetting usage, or cancelling active Focus Lock', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  state = setAppTimeLimit(state, KIOSK_BROWSER_PACKAGE, 15, '09:00:00', baseTime).nextState;
  state = advanceAppUsage(state, KIOSK_BROWSER_PACKAGE, 120, '09:02:00', baseTime);
  state = setFocusBlockSession(state, 25, '09:03:00', baseTime).nextState;
  state = updateDowntimeSchedule(state, { enabled: true }, '09:04:00', baseTime).nextState;
  state = activateStrictShieldLock(state, 60, '09:05:00', baseTime);

  // Tightening limit (15 -> 5) is allowed during Strict Lock
  assert.equal(setAppTimeLimit(state, KIOSK_BROWSER_PACKAGE, 5, '09:06:00', baseTime + 60_000).ok, true);

  // Loosening (15 -> 60 or 0), resetting usage, disabling Downtime, and stopping Focus Lock are rejected
  assert.equal(setAppTimeLimit(state, KIOSK_BROWSER_PACKAGE, 60, '09:06:00', baseTime + 60_000).ok, false);
  assert.equal(setAppTimeLimit(state, KIOSK_BROWSER_PACKAGE, 0, '09:06:00', baseTime + 60_000).ok, false);
  assert.equal(resetAppUsage(state, KIOSK_BROWSER_PACKAGE, '09:06:00', baseTime + 60_000).ok, false);
  assert.equal(updateDowntimeSchedule(state, { enabled: false }, '09:06:00', baseTime + 60_000).ok, false);
  assert.equal(setFocusBlockSession(state, 0, '09:06:00', baseTime + 60_000).ok, false);
});

test('Bypass & Tamper Diagnostics detects rapid admin setting toggling, logs Tamper Warning, and triggers escalating extra lockouts', () => {
  const baseTime = 1_700_000_000_000;
  let state = openPinGate(createInitialKioskState(), 'admin_settings');
  state = submitPin(state, DEFAULT_KIOSK_PIN, '09:00:00', baseTime).nextState;
  state = setAdminSystemUnlock(state, true, '09:00:01', baseTime + 1000);
  // 2nd and 3rd mutations within <15s -> below threshold of 4, no warning yet
  state = toggleHardwarePolicy(state, 'statusBarDisabled', false, '09:00:02', baseTime + 2000);
  state = toggleHardwarePolicy(state, 'screenCaptureDisabled', false, '09:00:02', baseTime + 2500);
  assert.equal(getTamperWarningEvents(state).length, 0);

  // 4th mutation within 15s -> triggers Tamper Warning + +20 hidden Distrust Score
  state = toggleHardwarePolicy(state, 'statusBarDisabled', true, '09:00:03', baseTime + 3000);
  assert.equal(getTamperWarningEvents(state).length, 1);
  assert.ok(state.distrustScore >= 20 && state.distrustScore < DISTRUST_TIER1_THRESHOLD);
  assert.equal(state.tamperEscalationTier, 0);
  assert.equal(state.activeScreen, 'admin_settings');

  // Second burst of 4 rapid toggles reaches Tier 1 (>= 40 pts) -> +90s lockout, revokes unlock, evicts to PIN gate
  for (let i = 0; i < 4; i += 1) {
    state = toggleHardwarePolicy(state, 'screenCaptureDisabled', undefined, '09:00:05', baseTime + 4000 + i * 200);
  }
  assert.ok(state.distrustScore >= DISTRUST_TIER1_THRESHOLD);
  assert.equal(state.tamperEscalationTier, 1);
  assert.equal(state.adminUnlocked, false);
  assert.equal(state.activeScreen, 'pin_gate');
  assert.ok(getPinLockoutRemainingSeconds(state, baseTime + 5000) >= 85);
  assert.ok(getTamperWarningEvents(state).some((e) => e.detail.includes('Tamper Warning')));

  // Additional bypass surges reach Tier 2 (>= 70 pts) -> +300s lockout & auto 30m Strict Shield Lock
  for (let i = 0; i < 3; i += 1) {
    state = launchApp(state, 'com.android.settings', '09:00:08', baseTime + 6000 + i * 100);
  }
  assert.ok(state.distrustScore >= DISTRUST_TIER2_THRESHOLD);
  assert.equal(state.tamperEscalationTier, 2);
  assert.ok(getPinLockoutRemainingSeconds(state, baseTime + 6500) >= 295);
  assert.ok(getStrictShieldRemainingMinutes(state, baseTime + 6500) >= 29);

  // Admin diagnostics reset restores normal unlocked state
  const cleared = resetTamperDiagnostics(state, '09:01:00');
  assert.equal(cleared.distrustScore, 0);
  assert.equal(cleared.tamperEscalationTier, 0);
  assert.equal(cleared.tamperWarningsCount, 0);
  assert.equal(getPinLockoutRemainingSeconds(cleared, baseTime + 7000), 0);
});

test('Rapid blocked browser and in-app WebView probing emits bypass surge Tamper Warning', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();
  state = launchApp(state, KIOSK_BROWSER_PACKAGE, '09:00:00', baseTime);

  state = navigateKioskBrowser(state, 'https://pornhub.com', '09:00:01', baseTime + 1000).nextState;
  state = navigateKioskBrowser(state, 'https://instagram.com', '09:00:02', baseTime + 2000).nextState;
  const third = testInAppBrowserAccess(state, 'com.instagram.android', '09:00:03', baseTime + 3000);
  assert.equal(third.allowed, false);
  state = third.nextState;

  assert.ok(getTamperWarningEvents(state).length >= 1);
  assert.ok(state.distrustScore >= 31);
});

test('Emergency Panic Button kills active apps, scrubs browser & clipboard, locks to Kiosk Dashboard, and survives reboot', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();
  state = setKioskOperationMode(state, 'kiosk_browser');
  state = launchApp(state, KIOSK_BROWSER_PACKAGE, '09:10:00', baseTime);
  state = navigateKioskBrowser(state, 'https://wikipedia.org/wiki/Focus', '09:10:05', baseTime).nextState;
  assert.equal(state.activeScreen, 'kiosk_browser');

  const panicked = triggerPanicLockdown(state, 15, '09:11:00', baseTime);
  assert.equal(panicked.activeScreen, 'home');
  assert.equal(panicked.activeAppPackage, null);
  assert.equal(panicked.browserCurrentUrl, 'about:blank');
  assert.equal(panicked.lastClipboardWipedAt, '09:11:00');
  assert.equal(panicked.panicCount, 1);
  assert.equal(panicked.lockTaskActive, true);
  assert.equal(getPanicLockRemainingMinutes(panicked, baseTime), 15);
  assert.ok(getStrictShieldRemainingMinutes(panicked, baseTime) >= 15);
  assert.ok(
    panicked.events.some((e) => e.apiCall.includes('ClipboardManager.clearPrimaryClip'))
  );

  // Kiosk Browser & third-party apps remain locked to Dashboard during Panic Recovery
  const browserRetry = launchApp(panicked, KIOSK_BROWSER_PACKAGE, '09:12:00', baseTime + 60_000);
  assert.equal(browserRetry.activeScreen, 'home');
  assert.ok(browserRetry.blockedNotice?.includes('Emergency Panic Mode'));

  const posRetry = launchApp(panicked, 'com.enterprise.pos', '09:12:10', baseTime + 65_000);
  assert.equal(posRetry.activeScreen, 'home');

  // Focus & Growth remains accessible as recovery tool during Panic Lock
  const focusLaunch = launchApp(panicked, SELF_IMPROVEMENT_PACKAGE, '09:12:20', baseTime + 70_000);
  assert.equal(focusLaunch.activeScreen, 'self_improvement');

  // Rebooting during Panic Lock keeps device pinned on Dashboard rather than auto-reopening Browser
  const afterReboot = simulateDeviceReboot(panicked, '09:13:00', baseTime + 120_000);
  assert.equal(afterReboot.activeScreen, 'home');
  assert.ok(afterReboot.blockedNotice?.includes('Emergency Panic Mode'));

  // Clearing Panic Lock restores normal access
  const cleared = clearPanicLockdown(panicked, '09:14:00');
  assert.equal(getPanicLockRemainingMinutes(cleared, baseTime + 180_000), 0);
  const browserAfterClear = launchApp(cleared, KIOSK_BROWSER_PACKAGE, '09:14:05', baseTime + 185_000);
  assert.equal(browserAfterClear.activeScreen, 'kiosk_browser');
});

test('Home button cleanly exits foreground apps in Multi-App mode while Single-App locks Home unless unlocked', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  assert.equal(getLockTaskFeatures(state).home, true);

  // Multi-App: Home exits Retail POS, Kiosk Browser, and Focus & Growth cleanly
  for (const pkg of ['com.enterprise.pos', KIOSK_BROWSER_PACKAGE, SELF_IMPROVEMENT_PACKAGE]) {
    state = launchApp(state, pkg, '09:00:00', baseTime);
    assert.notEqual(state.activeScreen, 'home');
    state = pressSystemNavButton(state, 'Home', '09:00:05', baseTime + 5000);
    assert.equal(state.activeScreen, 'home');
    assert.equal(state.activeAppPackage, null);
    assert.equal(state.blockedNotice, null);
  }

  // Recents remains blocked during normal kiosk LockTask mode
  state = launchApp(state, 'com.enterprise.pos', '09:01:00', baseTime + 60_000);
  const blockedRecents = pressSystemNavButton(state, 'Recents', '09:01:05', baseTime + 65_000);
  assert.equal(blockedRecents.activeScreen, 'app_lock_task');
  assert.ok(blockedRecents.blockedNotice?.includes('Recents'));

  // Single-App mode omits LOCK_TASK_FEATURE_HOME and blocks Home button
  let single = setKioskOperationMode(createInitialKioskState(), 'single_app', 'com.enterprise.pos');
  assert.equal(getLockTaskFeatures(single).home, false);
  single = launchApp(single, 'com.enterprise.pos', '09:02:00', baseTime);
  const singleHomeBlocked = pressSystemNavButton(single, 'Home', '09:02:05', baseTime + 5000);
  assert.equal(singleHomeBlocked.activeScreen, 'app_lock_task');
  assert.ok(singleHomeBlocked.blockedNotice?.includes('Home button is locked'));
});

test('Keyguard lock screen and Status Bar notification shade respect hardware toggles & LockTask features', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  // Default state has statusBarDisabled=true and keyguardDisabled=false
  assert.equal(getExtendedPolicies(state).SET_STATUS_BAR_DISABLED, true);
  assert.equal(getExtendedPolicies(state).SET_KEYGUARD_DISABLED, false);
  assert.deepEqual(getLockTaskFeatures(state), {
    home: true,
    notifications: false,
    systemInfo: false,
    keyguard: true,
    globalActions: false,
  });

  // Turning off statusBarDisabled enables NOTIFICATIONS + SYSTEM_INFO in LockTaskFeatures
  state = toggleHardwarePolicy(state, 'statusBarDisabled', false, '09:00:00', baseTime);
  assert.equal(getExtendedPolicies(state).SET_STATUS_BAR_DISABLED, false);
  assert.equal(getLockTaskFeatures(state).notifications, true);
  assert.equal(getLockTaskFeatures(state).systemInfo, true);

  // Locking screen activates Android Keyguard and blocks system nav until unlocked
  state = triggerScreenLock(state, '09:00:10', baseTime + 10_000);
  assert.equal(state.keyguardLocked, true);
  const navWhileLocked = pressSystemNavButton(state, 'Home', '09:00:12', baseTime + 12_000);
  assert.ok(navWhileLocked.blockedNotice?.includes('Unlock the Android lock screen'));

  state = dismissKeyguard(state, '09:00:15');
  assert.equal(state.keyguardLocked, false);

  // When keyguardDisabled=true while locked down, Keyguard is skipped unless adminUnlocked=true
  state = toggleHardwarePolicy(state, 'keyguardDisabled', true, '09:00:20', baseTime + 20_000);
  assert.equal(getLockTaskFeatures(state).keyguard, false);
  const skipped = triggerScreenLock(state, '09:00:25', baseTime + 25_000);
  assert.equal(skipped.keyguardLocked, false);
  assert.ok(skipped.blockedNotice?.includes('Skip Lockscreen Keyguard'));
});

test('Timed Admin Unlock supports +/- adjustment, survives Home when active, and auto-expires', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  // Adjust default unlock duration before activating (5m -> 10m -> 9m, clamped at 1m min)
  state = adjustAdminUnlockTime(state, 5, '09:00:00', baseTime);
  assert.equal(state.adminUnlockDurationMinutes, 10);
  state = adjustAdminUnlockTime(state, -1, '09:00:01', baseTime + 1000);
  assert.equal(state.adminUnlockDurationMinutes, 9);
  const minClamped = adjustAdminUnlockTime(state, -50, '09:00:02', baseTime + 2000);
  assert.equal(minClamped.adminUnlockDurationMinutes, 1);

  // Activate unlock -> 9m timer starts
  state = setAdminSystemUnlock(state, true, '09:00:05', baseTime + 5000);
  assert.equal(state.adminUnlocked, true);
  assert.equal(getAdminUnlockRemainingSeconds(state, baseTime + 5000), 9 * 60);

  // Subtract 5m from active timer at +5s elapsed -> 235s remaining; add 1m at +10s elapsed -> 290s remaining
  state = adjustAdminUnlockTime(state, -5, '09:00:10', baseTime + 10_000);
  assert.equal(getAdminUnlockRemainingSeconds(state, baseTime + 10_000), 235);
  state = adjustAdminUnlockTime(state, 1, '09:00:15', baseTime + 15_000);
  assert.equal(getAdminUnlockRemainingSeconds(state, baseTime + 15_000), 290);

  // Pressing Home / keeping unlock preserves timer while still unexpired
  state = launchApp(state, 'com.android.settings', '09:00:20', baseTime + 20_000);
  assert.equal(state.activeScreen, 'android_settings');
  const homeKeep = returnToKioskHome(state, '09:00:30', true, baseTime + 30_000);
  assert.equal(homeKeep.activeScreen, 'home');
  assert.equal(homeKeep.adminUnlocked, true);

  // Default returnToKioskHome(..., keepUnlock=false) immediately revokes unlock
  const homeRevoke = returnToKioskHome(state, '09:00:35', false, baseTime + 35_000);
  assert.equal(homeRevoke.adminUnlocked, false);
  assert.equal(homeRevoke.adminUnlockUntilMs, 0);

  // Reconciling after timer expires revokes unlock and evicts out of Android Settings
  const expired = reconcileAdminUnlockExpiry(state, '09:06:00', baseTime + 10 * 60_000);
  assert.equal(expired.adminUnlocked, false);
  assert.equal(expired.adminUnlockUntilMs, 0);
  assert.equal(expired.activeScreen, 'home');
  assert.equal(expired.lockTaskActive, true);
  assert.ok(expired.blockedNotice?.includes('expired'));
});

test('Uninstalling third-party/custom apps succeeds when Admin-unlocked while Device Owner launcher stays protected', () => {
  const baseTime = 1_700_000_000_000;
  let state = createInitialKioskState();

  // Launcher uninstall always blocked
  const launcherBlocked = attemptUninstallApp(state, 'com.kiosk.launcher', '09:00:00', baseTime);
  assert.ok(launcherBlocked.blockedNotice?.includes('cannot be uninstalled'));

  // Unlock Admin and uninstall Retail POS
  state = setAdminSystemUnlock(state, true, '09:00:05', baseTime + 5000);
  assert.ok(getAllInstalledApps(state).some((a) => a.packageName === 'com.enterprise.pos'));

  const afterUninstall = attemptUninstallApp(state, 'com.enterprise.pos', '09:00:10', baseTime + 10_000);
  assert.equal(afterUninstall.blockedNotice, null);
  assert.equal(
    getAllInstalledApps(afterUninstall).some((a) => a.packageName === 'com.enterprise.pos'),
    false
  );
  assert.equal(
    getVisibleHomeApps(afterUninstall).some((a) => a.packageName === 'com.enterprise.pos'),
    false
  );
});

test('APK version comparison and in-app self-update preserve Device Owner state', () => {
  assert.equal(compareAppVersion(3, 2, '1.2.0', '1.1.0'), true);
  assert.equal(compareAppVersion(2, 2, '1.1.1', '1.1.0'), true);
  assert.equal(compareAppVersion(2, 2, '1.1.0', '1.1.0'), false);
  assert.equal(compareAppVersion(1, 2, '1.0.0', '1.1.0'), false);

  const initial = createInitialKioskState();
  const updated = applySimulatedApkUpdate(
    initial,
    {
      versionCode: 3,
      versionName: '1.2.0',
      downloadUrl: 'https://kiosk.example.com/kiosk-1.2.0.apk',
      source: 'uploaded-apk',
    },
    '09:05:00'
  );
  assert.equal(updated.installedApkVersionCode, 3);
  assert.equal(updated.installedApkVersionName, '1.2.0');
  assert.equal(updated.isDeviceOwner, true);
  assert.ok(updated.events[0]?.apiCall.includes('PackageInstaller.Session.commit'));
});


