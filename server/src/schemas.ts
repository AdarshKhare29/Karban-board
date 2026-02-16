import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const createBoardSchema = z.object({
  name: z.string().min(1)
});

export const createColumnSchema = z.object({
  title: z.string().min(1)
});

export const updateColumnSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().optional()
});

export const createCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  dueDate: z.string().optional()
});

export const updateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional()
});

export const moveCardSchema = z.object({
  toColumnId: z.number().int(),
  toPosition: z.number().int().min(0)
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['member', 'viewer'])
});

export const addCommentSchema = z.object({
  body: z.string().min(1)
});
