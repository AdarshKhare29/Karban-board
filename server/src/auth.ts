import type express from 'express';
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { jwtSecret } from './config.js';
import type { AuthRequest, AuthUser } from './types.js';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

export function parseAuthHeader(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [type, token] = headerValue.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload | string;
  if (typeof decoded === 'string' || typeof decoded.sub !== 'number' || typeof decoded.email !== 'string' || typeof decoded.name !== 'string') {
    throw new Error('Invalid token payload');
  }

  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name
  };
}

export function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction): void {
  try {
    const token = parseAuthHeader(req.headers.authorization);
    if (!token) {
      res.status(401).json({ message: 'Missing authorization token' });
      return;
    }

    req.user = verifyToken(token);
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const authToken = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : null;
    const headerValue = Array.isArray(socket.handshake.headers.authorization)
      ? socket.handshake.headers.authorization[0]
      : socket.handshake.headers.authorization;

    const headerToken = parseAuthHeader(headerValue);
    const token = authToken ?? headerToken;

    if (!token) {
      return next(new Error('Unauthorized'));
    }

    const user = verifyToken(token);
    socket.data.userId = user.id;
    return next();
  } catch (_error) {
    return next(new Error('Unauthorized'));
  }
}
