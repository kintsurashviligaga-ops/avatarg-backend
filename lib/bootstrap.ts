import { validateBootEnvOrThrow } from '@/lib/env';

function shouldValidateAtBoot(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const isBuildPhase = String(process.env.NEXT_PHASE || '').trim() === 'phase-production-build';
  return isProduction && !isBuildPhase;
}

if (shouldValidateAtBoot()) {
  validateBootEnvOrThrow();
}

export function ensureBootValidated(): void {
  if (shouldValidateAtBoot()) {
    validateBootEnvOrThrow();
  }
}