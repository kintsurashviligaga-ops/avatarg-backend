export function isAdminRequest(req: Request): boolean {
  const expected = String(process.env.ADMIN_API_KEY || '').trim();
  if (!expected) {
    return false;
  }

  const provided = String(req.headers.get('x-admin-api-key') || '').trim();
  return Boolean(provided && provided === expected);
}
