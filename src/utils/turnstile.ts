import { z } from 'zod';

export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileChallengeSchema = z.object({
  captchaToken: z.string().trim().min(1).max(4096),
  website: z.string().max(512).optional().default(''),
});

export interface VerifyTurnstileOptions {
  captchaToken?: unknown;
  honeypot?: unknown;
  secretKey?: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface VerifyTurnstileResult {
  ok: boolean;
  status: 200 | 400 | 403 | 502 | 503 | 504;
  error?: string;
  errorCodes?: string[];
}

interface CloudflareSiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileChallenge({
  captchaToken,
  honeypot,
  secretKey,
  remoteIp,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: VerifyTurnstileOptions): Promise<VerifyTurnstileResult> {
  if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'Automated submission rejected.',
      errorCodes: ['honeypot-triggered'],
    };
  }

  const trimmedSecret = secretKey?.trim() ?? '';
  if (!trimmedSecret) {
    return {
      ok: false,
      status: 503,
      error:
        'Bot protection (TURNSTILE_SECRET_KEY) is not configured on the server.',
      errorCodes: ['missing-input-secret'],
    };
  }

  const parsedToken = z.string().trim().min(1).max(4096).safeParse(captchaToken);
  if (!parsedToken.success) {
    return {
      ok: false,
      status: 400,
      error: 'Please complete the Turnstile verification challenge before submitting.',
      errorCodes: ['missing-input-response'],
    };
  }

  const body = new URLSearchParams({
    secret: trimmedSecret,
    response: parsedToken.data,
  });
  if (remoteIp && remoteIp !== 'unknown') {
    body.set('remoteip', remoteIp);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error: 'Unable to verify Turnstile challenge with Cloudflare. Please try again.',
      };
    }

    const data = (await response.json()) as CloudflareSiteverifyResponse;
    if (data.success !== true) {
      return {
        ok: false,
        status: 403,
        error: 'Verification challenge failed or expired. Please try again.',
        errorCodes: Array.isArray(data['error-codes']) ? data['error-codes'] : undefined,
      };
    }

    return { ok: true, status: 200 };
  } catch (err: unknown) {
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return {
        ok: false,
        status: 504,
        error: 'Turnstile verification timed out. Please try again.',
      };
    }
    return {
      ok: false,
      status: 502,
      error: 'Unable to reach Turnstile verification service. Please try again.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
