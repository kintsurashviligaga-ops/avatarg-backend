import { createHmac, timingSafeEqual } from 'node:crypto';

type ParsedSignature = {
  algorithm: 'sha256' | 'sha1';
  digest: string;
};

function parseHeader(value: string | null, algorithm: 'sha256' | 'sha1'): ParsedSignature | null {
  if (!value) {
    return null;
  }

  const prefix = `${algorithm}=`;
  if (!value.startsWith(prefix)) {
    return null;
  }

  const digest = value.slice(prefix.length).trim();
  if (!digest) {
    return null;
  }

  return { algorithm, digest };
}

export function getMetaSignature(headers: Headers): ParsedSignature | null {
  const preferred = parseHeader(headers.get('x-hub-signature-256'), 'sha256');
  if (preferred) {
    return preferred;
  }

  return parseHeader(headers.get('x-hub-signature'), 'sha1');
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function verifyMetaSignature(rawBody: string | Buffer, headers: Headers, secret: string): boolean {
  const parsed = getMetaSignature(headers);
  if (!parsed) {
    return false;
  }

  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac(parsed.algorithm, secret).update(payload, 'utf8').digest('hex');
  return safeEquals(parsed.digest, expected);
}
