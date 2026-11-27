import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminPinValueSchema,
  browserUrlSchema,
  customAppFormSchema,
  dailyPromptRequestSchema,
  dailyPromptResponseSchema,
  downtimeHoursSchema,
  escapeHtml,
  goalFormSchema,
  habitFormSchema,
  kioskTitleSchema,
  milestoneFormSchema,
  parseSelfImprovementPayload,
  parseStoredKioskPayload,
  quickDiaryFormSchema,
  sanitizeRichHtml,
  taskFormSchema,
} from './validation';
import {
  MAX_DAILY_APP_LIMIT_MINUTES,
  createInitialKioskState,
  isUrlAllowedInKioskBrowser,
} from './kioskEngine';
import { createInitialSelfImprovementState, createNote, updateNote } from './selfImprovementEngine';
import { buildGrowthSyncPayload, generatePinSalt } from './cloudSyncEngine';

test('sanitizeRichHtml strips script, img, svg, event handlers, styles, and javascript URIs while keeping safe formatting', () => {
  const malicious = [
    '<h2 onclick="alert(1)" style="color:red">Plan</h2>',
    '<script>fetch("https://evil.test")</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(2)><circle /></svg>',
    '<iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(3)" onclick="steal()">Bad Link</a>',
    '<a href="https://wikipedia.org/wiki/Focus" target="_blank">Good Link</a>',
    '<p><input type="checkbox" checked onclick="hack()"> <span>Done</span></p>',
    '<table><thead><tr><th>Goal</th></tr></thead><tbody><tr><td>Ship</td></tr></tbody></table>',
  ].join('');

  const clean = sanitizeRichHtml(malicious);

  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('<img'), false);
  assert.equal(clean.includes('<svg'), false);
  assert.equal(clean.includes('<iframe'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('onerror'), false);
  assert.equal(clean.includes('onload'), false);
  assert.equal(clean.includes('style='), false);
  assert.equal(clean.includes('javascript:'), false);

  assert.ok(clean.includes('<h2>Plan</h2>'));
  assert.ok(clean.includes('<a href="https://wikipedia.org/wiki/Focus" rel="noopener noreferrer">Good Link</a>'));
  assert.ok(clean.includes('<input type="checkbox" checked>'));
  assert.ok(clean.includes('<table><thead><tr><th>Goal</th></tr></thead>'));
});

test('escapeHtml encodes all HTML metacharacters', () => {
  assert.equal(
    escapeHtml(`<script>alert("x" & 'y')</script>`),
    '&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;'
  );
});

test('selfImprovementEngine sanitizes rich note content on create and update', () => {
  const base = createInitialSelfImprovementState();
  const { nextState, createdNoteId } = createNote(
    base,
    'Diary',
    'Test\u0007 Note',
    '<p>Hello</p><img src=x onerror=alert(1)>'
  );
  const created = nextState.notes.find((n) => n.id === createdNoteId);
  assert.ok(created);
  assert.equal(created.title, 'Test Note');
  assert.equal(created.htmlContent, '<p>Hello</p>');

  const updated = updateNote(nextState, createdNoteId, {
    htmlContent: '<script>evil()</script><p>Safe</p>',
  });
  const after = updated.notes.find((n) => n.id === createdNoteId);
  assert.equal(after?.htmlContent, '<p>Safe</p>');
});

test('isUrlAllowedInKioskBrowser and browserUrlSchema reject non-http(s) schemes', () => {
  const state = createInitialKioskState();
  for (const url of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'vbscript:msgbox(1)']) {
    assert.equal(browserUrlSchema.safeParse(url).success, false);
    const res = isUrlAllowedInKioskBrowser(url, state.allowedDomains);
    assert.equal(res.allowed, false);
  }
  assert.equal(browserUrlSchema.safeParse('https://wikipedia.org').success, true);
  assert.equal(browserUrlSchema.safeParse('wikipedia.org').success, true);
});

test('generatePinSalt returns a 32-character hex CSPRNG salt', () => {
  const salt1 = generatePinSalt();
  const salt2 = generatePinSalt();
  assert.match(salt1, /^[a-f0-9]{32}$/);
  assert.match(salt2, /^[a-f0-9]{32}$/);
  assert.notEqual(salt1, salt2);
});

test('Zod API and form schemas reject invalid payloads and normalize valid ones', () => {
  const apiValid = dailyPromptRequestSchema.safeParse({
    cleanStreakDays: 14,
    todayHabitPercent: 75,
    goals: [{ title: 'Ship app\u0000', category: 'Career', progressPercent: 50, targetDate: '2026-12-31' }],
    whyIStarted: 'Stay focused',
    recentNoteTitles: ['Morning'],
  });
  assert.equal(apiValid.success, true);
  if (apiValid.success) {
    assert.equal(apiValid.data.goals[0].title, 'Ship app');
  }

  assert.equal(dailyPromptRequestSchema.safeParse({ cleanStreakDays: -5 }).success, false);
  assert.equal(
    dailyPromptRequestSchema.safeParse({ goals: new Array(10).fill({ title: 'a', category: 'b' }) }).success,
    false
  );
  assert.equal(dailyPromptResponseSchema.safeParse({ question: '' }).success, false);

  assert.equal(habitFormSchema.safeParse({ title: '   ', category: 'Recovery' }).success, false);
  assert.equal(taskFormSchema.safeParse({ title: 'Study', priority: 'High', dueTime: '99:99' }).success, false);
  assert.equal(
    goalFormSchema.safeParse({
      title: 'Goal',
      category: 'Recovery',
      targetDate: 'not-a-date',
      whyItMatters: '',
      milestones: [],
    }).success,
    false
  );
  assert.equal(milestoneFormSchema.safeParse({ title: '' }).success, false);
  assert.equal(customAppFormSchema.safeParse({ label: 'Kindle', packageName: 'invalid pkg' }).success, false);
  assert.equal(customAppFormSchema.safeParse({ label: 'Kindle', packageName: 'com.amazon.kindle' }).success, true);
  assert.equal(kioskTitleSchema.safeParse({ title: '   ' }).success, false);
  assert.equal(downtimeHoursSchema.safeParse({ startHour: 'abc', endHour: 6 }).success, false);
  assert.equal(downtimeHoursSchema.safeParse({ startHour: 24, endHour: 6 }).success, false);
  assert.equal(adminPinValueSchema.safeParse('12').success, false);
  assert.equal(adminPinValueSchema.safeParse('    ').success, false);
  assert.equal(quickDiaryFormSchema.safeParse({ title: 'Note', body: '   ' }).success, false);
});

test('parseStoredKioskPayload, parseSelfImprovementPayload, and buildGrowthSyncPayload sanitize corrupted or malicious data', () => {
  const kioskFallback = createInitialKioskState();
  const parsedKiosk = parseStoredKioskPayload(
    {
      kioskMode: 'root_shell',
      adminPin: 'ab',
      allowedPackages: ['com.android.calculator2', 123, ''],
      allowedApps: {
        'com.android.calculator2': { passwordProtected: true },
        'com.enterprise.pos': { passwordProtected: true },
      },
      appTimeLimits: { 'com.enterprise.pos': 999999, '': 10, bad: -5 },
      activeScreen: 'rebooting',
      tamperEscalationTier: 99,
      browserCurrentUrl: 'javascript:alert(1)',
    },
    kioskFallback
  );
  assert.equal(parsedKiosk.kioskMode, kioskFallback.kioskMode);
  assert.equal(parsedKiosk.adminPin, kioskFallback.adminPin);
  assert.deepEqual(parsedKiosk.allowedPackages, ['com.android.calculator2']);
  assert.deepEqual(parsedKiosk.allowedApps, {
    'com.android.calculator2': { passwordProtected: true },
  });
  assert.equal(parsedKiosk.appTimeLimits['com.enterprise.pos'], MAX_DAILY_APP_LIMIT_MINUTES);
  assert.equal('bad' in parsedKiosk.appTimeLimits, false);
  assert.equal(parsedKiosk.activeScreen, 'home');
  assert.equal(parsedKiosk.tamperEscalationTier, 0);
  assert.equal(parsedKiosk.browserCurrentUrl, kioskFallback.browserCurrentUrl);

  const growthFallback = createInitialSelfImprovementState();
  const parsedGrowth = parseSelfImprovementPayload(
    {
      cleanStreakDays: 10,
      notes: [
        {
          id: 'n1',
          title: 'XSS',
          notebook: 'Diary',
          fontFamily: 'sans',
          fontSize: 'base',
          htmlContent: '<script>alert(1)</script><p>Clean</p>',
          pinned: false,
          updatedAt: '2026-01-01',
        },
      ],
    },
    growthFallback
  );
  assert.equal(parsedGrowth.notes[0].htmlContent, '<p>Clean</p>');

  const cloudGrowth = buildGrowthSyncPayload({
    growth: parsedGrowth,
    ownerId: 'uid/../../evil',
    source: 'pc_web',
  });
  assert.match(cloudGrowth.ownerId, /^[a-zA-Z0-9_\-]+$/);
  assert.equal(cloudGrowth.notes[0].htmlContent, '<p>Clean</p>');
});
