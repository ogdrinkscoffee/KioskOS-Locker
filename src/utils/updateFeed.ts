export interface UpdateFeedMeta {
  version: string;
  versionCode: number;
  sizeBytes: number;
  sha256: string;
  generatedAt?: string;
}

export interface UpdateFeedPayload {
  version: string;
  versionCode: number;
  apkUrl: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
}

const DEFAULT_FALLBACK_ORIGIN =
  'https://ais-pre-u5dgsx5axes4w2tjefjlrb-528486795455.europe-west1.run.app';

const SAFE_HOST_RE = /^[a-z0-9.-]+(?::\d+)?$/i;
const LOCAL_HOST_RE = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/i;

export function resolveFeedOrigin(options: {
  forwardedProto?: string;
  protocol?: string;
  forwardedHost?: string;
  host?: string;
  envBaseUrl?: string;
  fallbackOrigin?: string;
}): string {
  const envOrigin = options.envBaseUrl?.trim().replace(/\/+$/, '');
  const fallback = (
    envOrigin && envOrigin.startsWith('https://') ? envOrigin : options.fallbackOrigin || DEFAULT_FALLBACK_ORIGIN
  ).replace(/\/+$/, '');

  const rawHost = (options.forwardedHost || options.host || '').split(',')[0].trim();
  if (!rawHost || !SAFE_HOST_RE.test(rawHost) || LOCAL_HOST_RE.test(rawHost)) {
    return fallback;
  }

  const rawProto = (options.forwardedProto || options.protocol || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();

  // Android UpdateManifest strictly requires an https:// apkUrl.
  const scheme = rawProto === 'https' ? 'https' : 'https';
  return `${scheme}://${rawHost}`;
}

export function buildUpdateFeedPayload(
  meta: UpdateFeedMeta,
  origin: string,
  apkFileName = 'IroncladOS.apk',
): UpdateFeedPayload {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return {
    version: meta.version,
    versionCode: meta.versionCode,
    apkUrl: `${cleanOrigin}/downloads/${apkFileName}`,
    sha256: meta.sha256,
    sizeBytes: meta.sizeBytes,
    generatedAt: meta.generatedAt || new Date().toISOString(),
  };
}
