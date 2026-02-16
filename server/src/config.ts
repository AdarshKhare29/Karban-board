export const port = Number(process.env.PORT ?? 4000);
const clientOriginRaw = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
export const clientOrigins = clientOriginRaw
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
export const jwtSecret: string = process.env.JWT_SECRET ?? '';

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}
