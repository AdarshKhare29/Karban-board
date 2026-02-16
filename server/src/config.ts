export const port = Number(process.env.PORT ?? 4000);
export const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
export const jwtSecret: string = process.env.JWT_SECRET ?? '';

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}
