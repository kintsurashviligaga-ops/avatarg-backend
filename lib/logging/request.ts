import { randomUUID } from 'node:crypto';

export function getRequestId(req: Request): string {
  const fromHeader = String(req.headers.get('x-request-id') || '').trim();
  return fromHeader || randomUUID();
}

export function jsonHeadersWithRequestId(requestId: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'x-request-id': requestId,
    ...extra,
  };
}
