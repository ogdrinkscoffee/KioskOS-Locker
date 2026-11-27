#!/usr/bin/env node
/**
 * Single source of truth for the APK version and size shown on the website.
 *
 * The numbers on the download page (button tooltip + release-notes line) used to be
 * typed into src/i18n/messages.ts, so the site could advertise a version the file in
 * public/downloads did not have. They now come from src/generated/apkMeta.ts, which
 * this script writes from two real sources:
 *
 *   version / versionCode -> android-kiosk-launcher/app/build.gradle.kts
 *   sizeBytes / sizeMb / sha256 -> public/downloads/IroncladOS.apk
 *
 * It also writes public/downloads/latest.json, the in-app update feed. Installed copies
 * fetch that file, compare versionCode, and install the APK only after the sha256 matches.
 * Keeping this in one script means the site, the feed and the shipped APK cannot disagree.
 *
 * Usage:
 *   node scripts/apk-meta.mjs          regenerate src/generated/apkMeta.ts
 *   node scripts/apk-meta.mjs --check   fail if anything disagrees (used by the site build and CI)
 *   node scripts/apk-meta.mjs --check --apk <path>
 *                                      also validate a freshly built APK's embedded version
 *
 * When aapt2 is available (CI and any machine with the Android SDK) the version and
 * versionCode inside the APK are read back and must match build.gradle.kts, so bumping
 * the Gradle version without rebuilding the shipped APK is an error rather than a stale page.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradleFile = path.join(root, 'android-kiosk-launcher/app/build.gradle.kts');
const publishedApk = path.join(root, 'public/downloads/IroncladOS.apk');
const updateFeed = path.join(root, 'public/downloads/latest.json');
const generatedFile = path.join(root, 'src/generated/apkMeta.ts');

/**
 * Where installed copies fetch updates from. It must be the public origin the site is
 * served on, because the kiosk build has no knowledge of the hosting provider.
 * Override with UPDATE_FEED_BASE_URL when the site moves domain.
 */
const rawFeedBaseUrl = process.env.UPDATE_FEED_BASE_URL?.trim();
const DEFAULT_FEED_BASE_URL =
  rawFeedBaseUrl && rawFeedBaseUrl.startsWith('https://')
    ? rawFeedBaseUrl
    : 'https://ais-pre-u5dgsx5axes4w2tjefjlrb-528486795455.europe-west1.run.app';
const APK_FILE_NAME = 'IroncladOS.apk';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const apkArgIndex = args.indexOf('--apk');
const extraApkArg = apkArgIndex === -1 ? null : args[apkArgIndex + 1];
if (apkArgIndex !== -1 && (!extraApkArg || extraApkArg.startsWith('--'))) {
  fail('missing path after --apk');
}
const extraApk = extraApkArg ? path.resolve(process.cwd(), extraApkArg) : null;

function fail(message) {
  console.error(`apk-meta: ${message}`);
  process.exit(1);
}

function readGradleVersion() {
  if (!existsSync(gradleFile)) fail(`missing ${path.relative(root, gradleFile)}`);
  const source = readFileSync(gradleFile, 'utf8');
  const versionName = source.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
  const versionCode = source.match(/versionCode\s*=\s*(\d+)/)?.[1];
  if (!versionName || !versionCode) {
    fail('could not read versionName/versionCode from android-kiosk-launcher/app/build.gradle.kts');
  }
  return { versionName, versionCode: Number(versionCode) };
}

function findAapt2() {
  const candidates = [];
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdk) {
    const buildTools = path.join(sdk, 'build-tools');
    if (existsSync(buildTools)) {
      // Highest build-tools version first.
      for (const version of readdirSync(buildTools).sort().reverse()) {
        candidates.push(path.join(buildTools, version, 'aapt2'));
      }
    }
  }
  candidates.push('aapt2');
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Version baked into the APK itself; null when aapt2 is unavailable. */
function readApkBadging(apkPath, label) {
  if (!existsSync(apkPath)) fail(`${label} not found at ${path.relative(root, apkPath) || apkPath}`);
  const aapt2 = findAapt2();
  if (!aapt2) {
    console.warn(`apk-meta: aapt2 not found, skipping the embedded version check for ${label}`);
    return null;
  }
  let badging;
  try {
    badging = execFileSync(aapt2, ['dump', 'badging', apkPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    fail(`aapt2 could not read ${label}: ${error.message}`);
  }
  const match = badging.match(/versionCode='(\d+)'.*versionName='([^']*)'/);
  if (!match) fail(`could not read versionCode/versionName from ${label}`);
  return { versionCode: Number(match[1]), versionName: match[2] };
}

function assertVersionsAgree(declared, embedded, label) {
  if (!embedded) return;
  if (embedded.versionName !== declared.versionName || embedded.versionCode !== declared.versionCode) {
    fail(
      `${label} is v${embedded.versionName} (code ${embedded.versionCode}) but ` +
        `build.gradle.kts declares v${declared.versionName} (code ${declared.versionCode}). ` +
        'Rebuild the APK, or fix the version in app/build.gradle.kts.'
    );
  }
}

function readPublishedApk() {
  if (!existsSync(publishedApk)) fail('missing public/downloads/IroncladOS.apk');
  const bytes = readFileSync(publishedApk);
  return {
    sizeBytes: bytes.length,
    sizeMb: (bytes.length / (1024 * 1024)).toFixed(1),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function render(declared, published) {
  return `// Generated by scripts/apk-meta.mjs — do not edit by hand.
// Version: android-kiosk-launcher/app/build.gradle.kts
// Size and checksum: public/downloads/IroncladOS.apk
// Refresh with \`npm run apk:meta\` (build-apk.sh and CI do it for you).

export const APK_META = {
  version: '${declared.versionName}',
  versionCode: ${declared.versionCode},
  sizeMb: '${published.sizeMb}',
  sizeBytes: ${published.sizeBytes},
  sha256: '${published.sha256}',
} as const;

/** Interpolation values for the \`download.apk*\` strings. */
export const APK_META_VARS = { version: APK_META.version, size: APK_META.sizeMb };
`;
}

/** The in-app update feed served at /downloads/latest.json. */
function renderFeed(declared, published) {
  return `${JSON.stringify(
    {
      version: declared.versionName,
      versionCode: declared.versionCode,
      apkUrl: `${DEFAULT_FEED_BASE_URL.replace(/\/$/, '')}/downloads/${APK_FILE_NAME}`,
      sha256: published.sha256,
      sizeBytes: published.sizeBytes,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}

const declared = readGradleVersion();

if (extraApk) {
  assertVersionsAgree(declared, readApkBadging(extraApk, 'the built APK'), 'the built APK');
  if (checkOnly) {
    console.log(
      `apk-meta: ok — built APK matches v${declared.versionName} (code ${declared.versionCode})`
    );
    process.exit(0);
  }
}

const embedded = readApkBadging(publishedApk, 'public/downloads/IroncladOS.apk');
assertVersionsAgree(declared, embedded, 'the published APK');

const published = readPublishedApk();
const next = render(declared, published);
const nextFeed = renderFeed(declared, published);

if (checkOnly) {
  const current = existsSync(generatedFile) ? readFileSync(generatedFile, 'utf8') : null;
  if (current === null) {
    fail('src/generated/apkMeta.ts is missing. Run `npm run apk:meta`.');
  }
  if (current !== next) {
    fail(
      'src/generated/apkMeta.ts does not match the shipped APK. ' +
        'Run `npm run apk:meta` and commit the result.'
    );
  }
  // The feed drives in-app updates: a version mismatch here is worse than on the page.
  if (!existsSync(updateFeed)) {
    fail('public/downloads/latest.json is missing. Run `npm run apk:meta`.');
  }
  const currentFeed = JSON.parse(readFileSync(updateFeed, 'utf8'));
  const expectedFeed = JSON.parse(nextFeed);
  for (const key of ['version', 'versionCode', 'apkUrl', 'sha256', 'sizeBytes']) {
    if (currentFeed[key] !== expectedFeed[key]) {
      fail(
        `public/downloads/latest.json has ${key}=${currentFeed[key]} but the shipped APK is ` +
          `${expectedFeed[key]}. Run \`npm run apk:meta\` and commit the result.`
      );
    }
  }
  console.log(
    `apk-meta: ok — IroncladOS.apk v${declared.versionName} (code ${declared.versionCode}), ` +
      `${published.sizeMb} MB, sha256 ${published.sha256.slice(0, 12)}…, update feed matches`
  );
} else {
  mkdirSync(path.dirname(generatedFile), { recursive: true });
  writeFileSync(generatedFile, next);
  writeFileSync(updateFeed, nextFeed);
  console.log(
    `apk-meta: wrote src/generated/apkMeta.ts + public/downloads/latest.json — ` +
      `v${declared.versionName} (code ${declared.versionCode}), ${published.sizeMb} MB`
  );
}
