export const port = Number(process.env.PORT ?? 4000);
const clientOriginRaw = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const adminEmailsRaw = process.env.ADMIN_EMAILS ?? '';
function normalizeOrigin(origin: string) {
  const trimmed = origin.trim().replace(/^['"]|['"]$/g, '');
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

export const clientOrigins = clientOriginRaw
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter((origin) => origin.length > 0);

export function isClientOriginAllowed(origin: string) {
  if (clientOrigins.length === 0) {
    return true;
  }
  return clientOrigins.includes(normalizeOrigin(origin));
}

const adminEmails = adminEmailsRaw
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter((email) => email.length > 0);

export function isAdminEmail(email: string) {
  return adminEmails.includes(email.trim().toLowerCase());
}
export const jwtSecret: string = process.env.JWT_SECRET ?? '';

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}
