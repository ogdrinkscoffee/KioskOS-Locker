import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APK_RELEASES_DIR = path.resolve(__dirname, '.apk-releases');
const APK_BINARY_FILENAME = 'kiosk-latest.apk';
const APK_METADATA_FILENAME = 'release.json';
const PUBLISHER_AUTH_FILENAME = '.publisher-auth.json';
const EPHEMERAL_SIGNING_SECRET =
  process.env.APK_SIGNING_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const PUBLISHER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface ApkReleaseMetadata {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  releaseNotes: string;
  sha256: string;
  fileName: string;
  sizeBytes: number;
  publishedAt: string | null;
  source: 'builtin' | 'upload' | 'external';
}

interface PublisherAuthRecord {
  saltHex: string;
  hashHex: string;
  createdAt: string;
}

const DEFAULT_APK_RELEASE: ApkReleaseMetadata = {
  versionCode: 2,
  versionName: '1.1.0',
  downloadUrl: '',
  releaseNotes:
    'No APK binary uploaded yet — upload a compiled .apk or link an HTTPS GitHub Release APK below.',
  sha256: '',
  fileName: '',
  sizeBytes: 0,
  publishedAt: null,
  source: 'builtin',
};

function resolveApkStoragePath(fileName: string): string {
  const resolved = path.resolve(APK_RELEASES_DIR, fileName);
  if (!resolved.startsWith(APK_RELEASES_DIR + path.sep)) {
    throw new Error('Invalid storage path');
  }
  return resolved;
}

function ensureApkReleasesDir(): void {
  fs.mkdirSync(APK_RELEASES_DIR, { recursive: true });
}

function getEnvPasscode(): string {
  return (process.env.APK_PUBLISH_PASSCODE ?? '').trim();
}

function readPublisherAuthRecord(): PublisherAuthRecord | null {
  try {
    const authPath = resolveApkStoragePath(PUBLISHER_AUTH_FILENAME);
    if (!fs.existsSync(authPath)) return null;
    const raw = fs.readFileSync(authPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PublisherAuthRecord>;
    if (typeof parsed.saltHex === 'string' && typeof parsed.hashHex === 'string') {
      return {
        saltHex: parsed.saltHex,
        hashHex: parsed.hashHex,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyPublisherPasscode(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const envPass = getEnvPasscode();
  if (envPass) {
    return constantTimeStringEqual(trimmed, envPass);
  }
  const stored = readPublisherAuthRecord();
  if (!stored) return false;
  const derived = crypto.scryptSync(trimmed, Buffer.from(stored.saltHex, 'hex'), 64);
  const expected = Buffer.from(stored.hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function signPublisherToken(): string {
  const payload = {
    sub: 'apk-publisher',
    exp: Date.now() + PUBLISHER_TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', EPHEMERAL_SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

function verifyPublisherToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;
  const expectedSig = crypto
    .createHmac('sha256', EPHEMERAL_SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const bufActual = Buffer.from(sigB64, 'utf8');
  const bufExpected = Buffer.from(expectedSig, 'utf8');
  if (bufActual.length !== bufExpected.length) return false;
  if (!crypto.timingSafeEqual(bufActual, bufExpected)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    return (
      decoded.sub === 'apk-publisher' &&
      typeof decoded.exp === 'number' &&
      decoded.exp > Date.now()
    );
  } catch {
    return false;
  }
}

function requirePublisherAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match || !verifyPublisherToken(match[1].trim())) {
    res.status(401).json({ error: 'Publisher passcode verification is required.' });
    return;
  }
  next();
}

function isPrivateOrDisallowedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(normalized);
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('::ffff:')) {
      return isPrivateOrDisallowedIp(normalized.slice('::ffff:'.length));
    }
    return false;
  }
  return false;
}

async function validateExternalHttpsReleaseUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Enter a valid HTTPS download URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('External APK download URLs must use https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs must not include embedded credentials.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Local or internal hostnames are not permitted.');
  }

  if (net.isIP(host) && isPrivateOrDisallowedIp(host)) {
    throw new Error('Private or loopback IP addresses are not permitted.');
  }

  try {
    const records = await dns.promises.lookup(host, { all: true });
    if (records.some((r) => isPrivateOrDisallowedIp(r.address))) {
      throw new Error('Destination host resolved to a disallowed private network address.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('disallowed')) {
      throw err;
    }
  }

  return parsed.toString();
}

function readReleaseMetadata(): ApkReleaseMetadata {
  try {
    const metaPath = resolveApkStoragePath(APK_METADATA_FILENAME);
    if (!fs.existsSync(metaPath)) {
      return { ...DEFAULT_APK_RELEASE };
    }
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ApkReleaseMetadata>;
    const versionCode = Number(parsed.versionCode ?? 2);
    const versionName =
      typeof parsed.versionName === 'string' && parsed.versionName.trim()
        ? parsed.versionName.trim()
        : '1.1.0';
    return {
      versionCode: Number.isFinite(versionCode) && versionCode >= 1 ? Math.floor(versionCode) : 2,
      versionName,
      downloadUrl: typeof parsed.downloadUrl === 'string' ? parsed.downloadUrl : '',
      releaseNotes: typeof parsed.releaseNotes === 'string' ? parsed.releaseNotes : '',
      sha256: typeof parsed.sha256 === 'string' ? parsed.sha256 : '',
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
      sizeBytes: typeof parsed.sizeBytes === 'number' ? parsed.sizeBytes : 0,
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      source:
        parsed.source === 'upload' || parsed.source === 'external' ? parsed.source : 'builtin',
    };
  } catch {
    return { ...DEFAULT_APK_RELEASE };
  }
}

function writeReleaseMetadata(meta: ApkReleaseMetadata): void {
  ensureApkReleasesDir();
  const metaPath = resolveApkStoragePath(APK_METADATA_FILENAME);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function sanitizeApkFilename(rawName: string | undefined, versionName: string): string {
  const cleanVer = versionName.replace(/[^a-zA-Z0-9._-]/g, '') || 'latest';
  if (!rawName) return `KioskOS-v${cleanVer}.apk`;
  const base = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!base || base === '.' || base === '..') return `KioskOS-v${cleanVer}.apk`;
  return base.toLowerCase().endsWith('.apk') ? base : `${base}.apk`;
}

function decodeHeaderText(value: string | string[] | undefined, maxLen: number): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().slice(0, maxLen);
  } catch {
    return raw.trim().slice(0, maxLen);
  }
}

interface GoalContext {
  title: string;
  category: string;
  progressPercent: number;
  targetDate: string;
  whyItMatters?: string;
}

interface DailyPromptRequestBody {
  cleanStreakDays?: number;
  longestCleanStreakDays?: number;
  urgeVictories?: number;
  todayHabitPercent?: number;
  habitsCompletedToday?: number;
  habitsTotal?: number;
  focusSessionsToday?: number;
  focusMinutesToday?: number;
  goals?: GoalContext[];
  whyIStarted?: string;
  recentNoteTitles?: string[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/apk/auth/status', (_req: Request, res: Response) => {
    const envManaged = getEnvPasscode().length > 0;
    const initialized = envManaged || readPublisherAuthRecord() !== null;
    res.json({ initialized, envManaged });
  });

  app.post('/api/apk/auth/setup', (req: Request, res: Response) => {
    if (getEnvPasscode()) {
      res.status(409).json({
        error: 'Publisher passcode is configured via server environment; enter it to sign in.',
      });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be between 6 and 128 characters.' });
      return;
    }

    try {
      ensureApkReleasesDir();
      const authPath = resolveApkStoragePath(PUBLISHER_AUTH_FILENAME);
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(passcode, salt, 64);
      const record: PublisherAuthRecord = {
        saltHex: salt.toString('hex'),
        hashHex: hash.toString('hex'),
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(authPath, JSON.stringify(record, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      res.json({ token: signPublisherToken(), expiresInSeconds: PUBLISHER_TOKEN_TTL_MS / 1000 });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
        res.status(409).json({ error: 'Publisher passcode is already configured. Please sign in.' });
        return;
      }
      res.status(500).json({ error: 'Failed to save publisher passcode.' });
    }
  });

  app.post('/api/apk/auth/verify', (req: Request, res: Response) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!verifyPublisherPasscode(passcode)) {
      res.status(401).json({ error: 'Invalid publisher passcode.' });
      return;
    }
    res.json({ token: signPublisherToken(), expiresInSeconds: PUBLISHER_TOKEN_TTL_MS / 1000 });
  });

  app.get('/api/apk/latest', (req: Request, res: Response) => {
    const meta = readReleaseMetadata();
    const binaryExists = fs.existsSync(resolveApkStoragePath(APK_BINARY_FILENAME));
    let resolvedDownloadUrl = meta.downloadUrl;

    if (meta.source === 'upload' && binaryExists) {
      const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)
        ?.split(',')[0]
        ?.trim();
      const proto = forwardedProto || req.protocol || 'http';
      const host =
        (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
        req.get('host');
      resolvedDownloadUrl = host ? `${proto}://${host}/api/apk/download` : '/api/apk/download';
    }

    res.json({
      ...meta,
      downloadUrl: resolvedDownloadUrl,
      hasLocalBinary: binaryExists,
    });
  });

  app.get('/api/apk/download', async (_req: Request, res: Response) => {
    const meta = readReleaseMetadata();
    const binaryPath = resolveApkStoragePath(APK_BINARY_FILENAME);
    if (meta.source === 'upload' && fs.existsSync(binaryPath)) {
      const safeName = sanitizeApkFilename(meta.fileName, meta.versionName);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(binaryPath);
      return;
    }

    if (meta.source === 'external' && meta.downloadUrl) {
      try {
        const safeUrl = await validateExternalHttpsReleaseUrl(meta.downloadUrl);
        res.redirect(302, safeUrl);
        return;
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Configured external release URL is invalid.',
        });
        return;
      }
    }

    res.status(404).json({
      error: 'No APK binary or external HTTPS release URL has been published yet.',
    });
  });

  app.post(
    '/api/apk/upload',
    requirePublisherAuth,
    express.raw({
      type: ['application/vnd.android.package-archive', 'application/octet-stream'],
      limit: '85mb',
    }),
    (req: Request, res: Response) => {
      const bodyBuffer = req.body;
      if (!Buffer.isBuffer(bodyBuffer) || bodyBuffer.length < 64) {
        res.status(400).json({ error: 'Upload body must be a valid compiled .apk binary.' });
        return;
      }

      if (
        bodyBuffer[0] !== 0x50 ||
        bodyBuffer[1] !== 0x4b ||
        bodyBuffer[2] !== 0x03 ||
        bodyBuffer[3] !== 0x04
      ) {
        res.status(400).json({
          error: 'Invalid APK file signature (expected Android ZIP/APK archive header PK\\x03\\x04).',
        });
        return;
      }

      const rawVersionCode = Number(decodeHeaderText(req.headers['x-apk-version-code'], 16));
      if (!Number.isInteger(rawVersionCode) || rawVersionCode < 1 || rawVersionCode > 999999999) {
        res.status(400).json({ error: 'Invalid x-apk-version-code header.' });
        return;
      }

      const versionName = decodeHeaderText(req.headers['x-apk-version-name'], 40) || '1.1.0';
      const releaseNotes = decodeHeaderText(req.headers['x-apk-release-notes'], 2000);
      const rawFileName = decodeHeaderText(req.headers['x-apk-file-name'], 120);
      const safeFileName = sanitizeApkFilename(rawFileName, versionName);
      const sha256 = crypto.createHash('sha256').update(bodyBuffer).digest('hex');

      try {
        ensureApkReleasesDir();
        const binaryPath = resolveApkStoragePath(APK_BINARY_FILENAME);
        fs.writeFileSync(binaryPath, bodyBuffer);

        const nextMeta: ApkReleaseMetadata = {
          versionCode: rawVersionCode,
          versionName,
          downloadUrl: '/api/apk/download',
          releaseNotes,
          sha256,
          fileName: safeFileName,
          sizeBytes: bodyBuffer.length,
          publishedAt: new Date().toISOString(),
          source: 'upload',
        };
        writeReleaseMetadata(nextMeta);
        res.json({ ok: true, release: nextMeta });
      } catch {
        res.status(500).json({ error: 'Failed to store uploaded APK release.' });
      }
    }
  );

  app.post('/api/apk/release', requirePublisherAuth, async (req: Request, res: Response) => {
    const versionCode = Number(req.body?.versionCode);
    const versionName =
      typeof req.body?.versionName === 'string' ? req.body.versionName.trim().slice(0, 40) : '';
    const rawDownloadUrl =
      typeof req.body?.downloadUrl === 'string' ? req.body.downloadUrl.trim() : '';
    const releaseNotes =
      typeof req.body?.releaseNotes === 'string' ? req.body.releaseNotes.trim().slice(0, 2000) : '';
    const sha256Raw =
      typeof req.body?.sha256 === 'string' ? req.body.sha256.trim().toLowerCase() : '';

    if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 999999999) {
      res.status(400).json({ error: 'versionCode must be a positive integer.' });
      return;
    }
    if (!versionName) {
      res.status(400).json({ error: 'versionName is required.' });
      return;
    }
    if (sha256Raw && !/^[a-f0-9]{64}$/.test(sha256Raw)) {
      res.status(400).json({ error: 'Optional sha256 must be a valid 64-character hex digest.' });
      return;
    }

    let safeUrl: string;
    try {
      safeUrl = await validateExternalHttpsReleaseUrl(rawDownloadUrl);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid release download URL.',
      });
      return;
    }

    const nextMeta: ApkReleaseMetadata = {
      versionCode,
      versionName,
      downloadUrl: safeUrl,
      releaseNotes,
      sha256: sha256Raw,
      fileName: sanitizeApkFilename(undefined, versionName),
      sizeBytes: 0,
      publishedAt: new Date().toISOString(),
      source: 'external',
    };
    writeReleaseMetadata(nextMeta);
    res.json({ ok: true, release: nextMeta });
  });

  app.post('/api/notes/daily-prompt', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured. Configure it in Settings > Secrets to generate AI Daily Prompts.',
      });
      return;
    }

    const body = (req.body ?? {}) as DailyPromptRequestBody;
    const cleanStreakDays = Number(body.cleanStreakDays ?? 0);
    const longestCleanStreakDays = Number(body.longestCleanStreakDays ?? 0);
    const urgeVictories = Number(body.urgeVictories ?? 0);
    const todayHabitPercent = Number(body.todayHabitPercent ?? 0);
    const habitsCompletedToday = Number(body.habitsCompletedToday ?? 0);
    const habitsTotal = Number(body.habitsTotal ?? 0);
    const focusSessionsToday = Number(body.focusSessionsToday ?? 0);
    const focusMinutesToday = Number(body.focusMinutesToday ?? 0);
    const goals = Array.isArray(body.goals) ? body.goals.slice(0, 6) : [];
    const recentNoteTitles = Array.isArray(body.recentNoteTitles)
      ? body.recentNoteTitles.slice(0, 5)
      : [];
    const whyIStarted = typeof body.whyIStarted === 'string' ? body.whyIStarted.trim() : '';

    const goalsSummary =
      goals.length > 0
        ? goals
            .map(
              (g) =>
                `- "${g.title}" (${g.category}, ${g.progressPercent}% milestones done, target ${g.targetDate})`
            )
            .join('\n')
        : '- No explicit goals saved yet.';

    const promptContext = [
      `User Self-Improvement Context (Quitting porn & social media using a locked Android Kiosk):`,
      `- Current Clean Streak: ${cleanStreakDays} days (Best: ${longestCleanStreakDays} days)`,
      `- Urge Victories Logged: ${urgeVictories}`,
      `- Today's Habits: ${habitsCompletedToday}/${habitsTotal} (${todayHabitPercent}%)`,
      `- Deep Focus Timer Today: ${focusSessionsToday} sessions (${focusMinutesToday} minutes)`,
      whyIStarted ? `- Personal Why: ${whyIStarted}` : '',
      `Active Goals:\n${goalsSummary}`,
      recentNoteTitles.length > 0
        ? `Recent Diary/Note Titles: ${recentNoteTitles.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          `${promptContext}\n\nGenerate ONE deeply thoughtful, practical reflective journaling prompt tailored specifically to their current clean streak, habit consistency, and active goals.`,
        config: {
          systemInstruction:
            'You are a grounded, practical journaling coach inside a distraction-free self-improvement kiosk app helping someone quit porn and social media. Keep the tone calm, direct, and non-preachy. Output strictly valid JSON matching the schema: a specific reflective question referencing their real progress or goals, a short 2-4 word theme, the goal or streak milestone referenced, and a 1-sentence writing starter they can insert into their diary note.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: {
                type: Type.STRING,
                description: 'A single reflective journaling question (1-2 concise sentences).',
              },
              focusTheme: {
                type: Type.STRING,
                description: 'Short 2-4 word topic label for this reflection.',
              },
              goalReferenced: {
                type: Type.STRING,
                description: 'The goal or progress metric this prompt connects to.',
              },
              writingStarter: {
                type: Type.STRING,
                description: 'A short opening sentence prompt for the user diary entry.',
              },
            },
            required: ['question', 'focusTheme', 'goalReferenced', 'writingStarter'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        question?: string;
        focusTheme?: string;
        goalReferenced?: string;
        writingStarter?: string;
      };

      if (!parsed.question) {
        res.status(502).json({ error: 'Unexpected prompt format returned from Gemini.' });
        return;
      }

      res.json({
        question: parsed.question,
        focusTheme: parsed.focusTheme ?? 'Daily Reflection',
        goalReferenced: parsed.goalReferenced ?? `${cleanStreakDays}-day streak`,
        writingStarter: parsed.writingStarter ?? 'Today I noticed that...',
      });
    } catch (err: unknown) {
      let message =
        err instanceof Error ? err.message : 'Failed to generate AI Daily Prompt from Gemini.';
      const rawMessage = message;
      if (message.trim().startsWith('{')) {
        try {
          const parsedErr = JSON.parse(message) as { error?: { message?: string } };
          if (parsedErr.error?.message) {
            message = parsedErr.error.message;
          }
        } catch {
          // Keep original message if not valid JSON
        }
      }
      const status =
        rawMessage.includes('API_KEY_INVALID') ||
        rawMessage.includes('PERMISSION_DENIED') ||
        rawMessage.includes('free tier is not available')
          ? 403
          : rawMessage.includes('RESOURCE_EXHAUSTED')
            ? 429
            : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

const PORT = Number(process.env.PORT ?? 3000);
createApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KioskOS server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start KioskOS server:', err);
    process.exit(1);
  });
