import type express from 'express';

export type BoardRole = 'owner' | 'member' | 'viewer';

export type JwtPayload = {
  sub: number;
  email: string;
  name: string;
};

export type AuthUser = {
  id: number;
  email: string;
  name: string;
};

export type AuthRequest = express.Request & {
  user?: AuthUser;
};
