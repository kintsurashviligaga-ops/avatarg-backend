import { logStructured } from '@/lib/logging/logger';

type ErrorContext = {
  requestId?: string;
  route?: string;
  method?: string;
};

let sentryLoaded = false;
let sentryInitTried = false;
let sentryModule: { captureException: (...args: any[]) => unknown; init: (...args: any[]) => unknown } | null = null;

async function getSentry(): Promise<typeof sentryModule> {
  if (sentryInitTried) {
    return sentryModule;
  }

  sentryInitTried = true;
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    return null;
  }

  try {
    const mod = await import('@sentry/node');
    sentryModule = {
      captureException: mod.captureException,
      init: mod.init,
    };

    if (!sentryLoaded && sentryModule) {
      sentryModule.init({ dsn });
      sentryLoaded = true;
    }
  } catch (error) {
    logStructured('warn', 'sentry.load_failed', {
      event: 'error_tracking_disabled',
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  return sentryModule;
}

export async function captureException(error: unknown, context: ErrorContext): Promise<void> {
  const sentry = await getSentry();

  if (sentry) {
    sentry.captureException(error, {
      extra: {
        requestId: context.requestId,
        route: context.route,
        method: context.method,
      },
    });
  }

  const err = error instanceof Error ? error : new Error(String(error));
  logStructured('error', 'request.exception', {
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    message: err.message,
    stack: err.stack,
  });
}
