import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { pool } from './db.js';

type BoardRole = 'owner' | 'member' | 'viewer';

type JwtPayload = {
  sub: number;
  email: string;
  name: string;
};

type AuthUser = {
  id: number;
  email: string;
  name: string;
};

type AuthRequest = express.Request & {
  user?: AuthUser;
};

const app = express();
const httpServer = createServer(app);

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const jwtSecret: string = process.env.JWT_SECRET ?? '';

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin
  }
});
const boardPresence = new Map<number, Map<number, number>>();

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

function signToken(user: AuthUser): string {
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

function parseAuthHeader(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [type, token] = headerValue.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function verifyToken(token: string): AuthUser {
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

async function getBoardRole(userId: number, boardId: number): Promise<BoardRole | null> {
  const result = await pool.query('SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].role as BoardRole;
}

async function getCardWithBoard(cardId: number): Promise<{ id: number; board_id: number; title: string } | null> {
  const result = await pool.query('SELECT id, board_id, title FROM cards WHERE id = $1', [cardId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as { id: number; board_id: number; title: string };
}

async function logActivity(params: {
  boardId: number;
  actorUserId: number;
  entityType: string;
  entityId: number | null;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO activities(board_id, actor_user_id, entity_type, entity_id, action, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      params.boardId,
      params.actorUserId,
      params.entityType,
      params.entityId,
      params.action,
      params.message,
      JSON.stringify(params.metadata ?? {})
    ]
  );
}

function canWrite(role: BoardRole): boolean {
  return role === 'owner' || role === 'member';
}

function normalizeDueDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearText, monthText, dayText] = trimmed.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

async function resolveBoardAssigneeName(boardId: number, assigneeValue: string): Promise<string | null> {
  const trimmed = assigneeValue.trim();
  if (!trimmed) {
    return null;
  }

  const result = await pool.query(
    `SELECT u.name
     FROM board_members bm
     JOIN users u ON u.id = bm.user_id
     WHERE bm.board_id = $1
       AND (LOWER(u.name) = LOWER($2) OR LOWER(u.email) = LOWER($2))
     LIMIT 1`,
    [boardId, trimmed]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].name as string;
}

function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction): void {
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

io.use((socket, next) => {
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
});

io.on('connection', (socket) => {
  socket.join(`user:${Number(socket.data.userId)}`);
  socket.data.joinedBoards = new Set<number>();

  socket.on('join_board', async (boardId: number) => {
    if (!Number.isInteger(boardId)) {
      socket.emit('socket_error', { message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(Number(socket.data.userId), boardId);
    if (!role) {
      socket.emit('socket_error', { message: 'Not authorized for this board' });
      return;
    }

    const joinedBoards = socket.data.joinedBoards as Set<number>;
    if (joinedBoards.has(boardId)) {
      notifyBoardPresence(boardId);
      return;
    }

    socket.join(`board:${boardId}`);
    joinedBoards.add(boardId);
    addBoardPresence(boardId, Number(socket.data.userId));
    notifyBoardPresence(boardId);
  });

  socket.on('leave_board', (boardId: number) => {
    const joinedBoards = socket.data.joinedBoards as Set<number>;
    if (!joinedBoards.has(boardId)) {
      return;
    }

    socket.leave(`board:${boardId}`);
    joinedBoards.delete(boardId);
    removeBoardPresence(boardId, Number(socket.data.userId));
    notifyBoardPresence(boardId);
  });

  socket.on('disconnect', () => {
    const joinedBoards = socket.data.joinedBoards as Set<number>;
    for (const boardId of joinedBoards) {
      removeBoardPresence(boardId, Number(socket.data.userId));
      notifyBoardPresence(boardId);
    }
    joinedBoards.clear();
  });
});

function notifyBoard(boardId: number, event: string) {
  io.to(`board:${boardId}`).emit('board_changed', {
    boardId,
    event,
    at: new Date().toISOString()
  });
}

function notifyUser(userId: number, event: string) {
  io.to(`user:${userId}`).emit('boards_changed', {
    userId,
    event,
    at: new Date().toISOString()
  });
}

function addBoardPresence(boardId: number, userId: number) {
  const boardMap = boardPresence.get(boardId) ?? new Map<number, number>();
  boardMap.set(userId, (boardMap.get(userId) ?? 0) + 1);
  boardPresence.set(boardId, boardMap);
}

function removeBoardPresence(boardId: number, userId: number) {
  const boardMap = boardPresence.get(boardId);
  if (!boardMap) {
    return;
  }

  const count = boardMap.get(userId) ?? 0;
  if (count <= 1) {
    boardMap.delete(userId);
  } else {
    boardMap.set(userId, count - 1);
  }

  if (boardMap.size === 0) {
    boardPresence.delete(boardId);
  }
}

function notifyBoardPresence(boardId: number) {
  io.to(`board:${boardId}`).emit('presence_changed', {
    boardId,
    onlineUserIds: Array.from(boardPresence.get(boardId)?.keys() ?? []),
    at: new Date().toISOString()
  });
}

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const createBoardSchema = z.object({
  name: z.string().min(1)
});

const createColumnSchema = z.object({
  title: z.string().min(1)
});

const updateColumnSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().optional()
});

const createCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  dueDate: z.string().optional()
});

const updateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional()
});

const moveCardSchema = z.object({
  toColumnId: z.number().int(),
  toPosition: z.number().int().min(0)
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['member', 'viewer'])
});

const addCommentSchema = z.object({
  body: z.string().min(1)
});

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json({ message: 'Email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const result = await pool.query(
      'INSERT INTO users(name, email, password_hash) VALUES($1, $2, $3) RETURNING id, name, email',
      [data.name.trim(), email, passwordHash]
    );

    const user = result.rows[0] as AuthUser;
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const matches = await bcrypt.compare(data.password, user.password_hash as string);
    if (!matches) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const safeUser: AuthUser = {
      id: user.id as number,
      name: user.name as string,
      email: user.email as string
    };

    const token = signToken(safeUser);
    res.json({ token, user: safeUser });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use('/api', requireAuth);

app.get('/api/boards', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT b.id, b.name, b.created_at, bm.role
       FROM boards b
       JOIN board_members bm ON bm.board_id = b.id
       WHERE bm.user_id = $1
       ORDER BY b.id DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/boards', async (req: AuthRequest, res, next) => {
  try {
    const data = createBoardSchema.parse(req.body);
    const userId = req.user!.id;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const boardResult = await client.query(
        'INSERT INTO boards(name, created_by) VALUES($1, $2) RETURNING id, name, created_at',
        [data.name, userId]
      );
      const board = boardResult.rows[0] as { id: number; name: string; created_at: string };

      await client.query('INSERT INTO board_members(board_id, user_id, role) VALUES($1, $2, $3)', [board.id, userId, 'owner']);

      const defaults = ['To Do', 'In Progress', 'Done'];
      for (let i = 0; i < defaults.length; i += 1) {
        await client.query('INSERT INTO columns(board_id, title, position) VALUES ($1, $2, $3)', [board.id, defaults[i], (i + 1) * 1000]);
      }

      await client.query('COMMIT');
      await logActivity({
        boardId: board.id,
        actorUserId: userId,
        entityType: 'board',
        entityId: board.id,
        action: 'created',
        message: `Created board \"${board.name}\"`
      });
      notifyBoard(board.id, 'board_created');
      notifyUser(userId, 'board_created');
      res.status(201).json(board);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/boards/:boardId', async (req: AuthRequest, res, next) => {
  try {
    const boardId = Number(req.params.boardId);
    const userId = req.user!.id;

    if (Number.isNaN(boardId)) {
      res.status(400).json({ message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(userId, boardId);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    const boardResult = await pool.query('SELECT id, name, created_at FROM boards WHERE id = $1', [boardId]);
    if (boardResult.rowCount === 0) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const columnsResult = await pool.query(
      'SELECT id, board_id, title, position, created_at FROM columns WHERE board_id = $1 ORDER BY position ASC',
      [boardId]
    );

    const cardsResult = await pool.query(
      `SELECT id, board_id, column_id, title, description, assignee, due_date, position, created_at, updated_at
       FROM cards
       WHERE board_id = $1
       ORDER BY position ASC`,
      [boardId]
    );

    const columns = columnsResult.rows as Array<{ id: number; board_id: number; title: string; position: number; created_at: string }>;
    const cards = cardsResult.rows as Array<{
      id: number;
      board_id: number;
      column_id: number;
      title: string;
      description: string;
      assignee: string | null;
      due_date: string | null;
      position: number;
      created_at: string;
      updated_at: string;
    }>;

    res.json({
      ...boardResult.rows[0],
      role,
      columns: columns.map((column) => ({
        ...column,
        cards: cards.filter((card) => card.column_id === column.id)
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/boards/:boardId/members', async (req: AuthRequest, res, next) => {
  try {
    const boardId = Number(req.params.boardId);
    const userId = req.user!.id;

    if (Number.isNaN(boardId)) {
      res.status(400).json({ message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(userId, boardId);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, bm.role
       FROM board_members bm
       JOIN users u ON u.id = bm.user_id
       WHERE bm.board_id = $1
       ORDER BY bm.created_at ASC`,
      [boardId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/boards/:boardId/activities', async (req: AuthRequest, res, next) => {
  try {
    const boardId = Number(req.params.boardId);
    const userId = req.user!.id;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);

    if (Number.isNaN(boardId)) {
      res.status(400).json({ message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(userId, boardId);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    const result = await pool.query(
      `SELECT a.id, a.board_id, a.actor_user_id, a.entity_type, a.entity_id, a.action, a.message, a.metadata, a.created_at,
              u.name AS actor_name, u.email AS actor_email
       FROM activities a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.board_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [boardId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/boards/:boardId/members', async (req: AuthRequest, res, next) => {
  try {
    const boardId = Number(req.params.boardId);
    const userId = req.user!.id;
    const data = addMemberSchema.parse(req.body);

    if (Number.isNaN(boardId)) {
      res.status(400).json({ message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(userId, boardId);
    if (role !== 'owner') {
      res.status(403).json({ message: 'Only board owners can add members' });
      return;
    }

    const userResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [data.email.toLowerCase()]);
    if (userResult.rowCount === 0) {
      res.status(404).json({ message: 'User with this email does not exist' });
      return;
    }

    const targetUser = userResult.rows[0] as { id: number; name: string; email: string };
    await pool.query(
      `INSERT INTO board_members(board_id, user_id, role)
       VALUES($1, $2, $3)
       ON CONFLICT (board_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [boardId, targetUser.id, data.role]
    );

    await logActivity({
      boardId,
      actorUserId: userId,
      entityType: 'member',
      entityId: targetUser.id,
      action: 'added',
      message: `Added ${targetUser.email} as ${data.role}`,
      metadata: { role: data.role, email: targetUser.email }
    });

    notifyBoard(boardId, 'member_added');
    notifyUser(targetUser.id, 'board_added_to_user');
    res.status(201).json({ message: 'Member added' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/boards/:boardId/columns', async (req: AuthRequest, res, next) => {
  try {
    const boardId = Number(req.params.boardId);
    const userId = req.user!.id;
    const data = createColumnSchema.parse(req.body);

    if (Number.isNaN(boardId)) {
      res.status(400).json({ message: 'Invalid board id' });
      return;
    }

    const role = await getBoardRole(userId, boardId);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    if (!canWrite(role)) {
      res.status(403).json({ message: 'Board role cannot modify columns' });
      return;
    }

    const maxPositionResult = await pool.query('SELECT COALESCE(MAX(position), 0) AS max_position FROM columns WHERE board_id = $1', [boardId]);
    const position = Number(maxPositionResult.rows[0].max_position) + 1000;

    const result = await pool.query(
      'INSERT INTO columns(board_id, title, position) VALUES($1, $2, $3) RETURNING id, board_id, title, position, created_at',
      [boardId, data.title, position]
    );

    const column = result.rows[0] as { id: number; title: string };
    await logActivity({
      boardId,
      actorUserId: userId,
      entityType: 'column',
      entityId: column.id,
      action: 'created',
      message: `Created column \"${column.title}\"`
    });

    notifyBoard(boardId, 'column_created');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/columns/:columnId', async (req: AuthRequest, res, next) => {
  try {
    const columnId = Number(req.params.columnId);
    const userId = req.user!.id;
    const data = updateColumnSchema.parse(req.body);

    if (Number.isNaN(columnId)) {
      res.status(400).json({ message: 'Invalid column id' });
      return;
    }

    const existingResult = await pool.query('SELECT id, board_id, title, position FROM columns WHERE id = $1', [columnId]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    const existing = existingResult.rows[0] as { id: number; board_id: number; title: string; position: number };
    const role = await getBoardRole(userId, existing.board_id);
    if (!role || !canWrite(role)) {
      res.status(403).json({ message: 'Not authorized to modify this column' });
      return;
    }

    const title = data.title ?? existing.title;
    const position = data.position ?? existing.position;
    const hasColumnChanges = title !== existing.title || position !== existing.position;

    if (!hasColumnChanges) {
      const unchangedResult = await pool.query(
        'SELECT id, board_id, title, position, created_at FROM columns WHERE id = $1',
        [columnId]
      );
      res.json(unchangedResult.rows[0]);
      return;
    }

    const result = await pool.query(
      'UPDATE columns SET title = $1, position = $2 WHERE id = $3 RETURNING id, board_id, title, position, created_at',
      [title, position, columnId]
    );

    await logActivity({
      boardId: existing.board_id,
      actorUserId: userId,
      entityType: 'column',
      entityId: columnId,
      action: 'updated',
      message: `Updated column \"${title}\"`
    });

    notifyBoard(existing.board_id, 'column_updated');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/columns/:columnId/cards', async (req: AuthRequest, res, next) => {
  try {
    const columnId = Number(req.params.columnId);
    const userId = req.user!.id;
    const data = createCardSchema.parse(req.body);

    if (Number.isNaN(columnId)) {
      res.status(400).json({ message: 'Invalid column id' });
      return;
    }

    const columnResult = await pool.query('SELECT id, board_id FROM columns WHERE id = $1', [columnId]);
    if (columnResult.rowCount === 0) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    const boardId = columnResult.rows[0].board_id as number;
    const role = await getBoardRole(userId, boardId);
    if (!role || !canWrite(role)) {
      res.status(403).json({ message: 'Not authorized to add cards' });
      return;
    }

    let dueDate: string | null = null;
    if (typeof data.dueDate === 'string') {
      dueDate = normalizeDueDate(data.dueDate);
      if (!dueDate) {
        res.status(400).json({ message: 'Invalid dueDate. Use YYYY-MM-DD format.' });
        return;
      }
    }

    let assignee: string | null = null;
    if (typeof data.assignee === 'string') {
      assignee = await resolveBoardAssigneeName(boardId, data.assignee);
      if (!assignee) {
        res.status(400).json({ message: 'Assignee must be an existing board member.' });
        return;
      }
    }

    const maxPositionResult = await pool.query('SELECT COALESCE(MAX(position), 0) AS max_position FROM cards WHERE column_id = $1', [columnId]);
    const position = Number(maxPositionResult.rows[0].max_position) + 1000;

    const result = await pool.query(
      `INSERT INTO cards(board_id, column_id, title, description, assignee, due_date, position)
       VALUES($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, board_id, column_id, title, description, assignee, due_date, position, created_at, updated_at`,
      [boardId, columnId, data.title, data.description ?? '', assignee, dueDate, position]
    );

    const card = result.rows[0] as { id: number; title: string };
    await logActivity({
      boardId,
      actorUserId: userId,
      entityType: 'card',
      entityId: card.id,
      action: 'created',
      message: `Created card \"${card.title}\"`
    });

    notifyBoard(boardId, 'card_created');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/cards/:cardId', async (req: AuthRequest, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    const userId = req.user!.id;
    const data = updateCardSchema.parse(req.body);

    if (Number.isNaN(cardId)) {
      res.status(400).json({ message: 'Invalid card id' });
      return;
    }

    const existingResult = await pool.query(
      'SELECT id, board_id, column_id, title, description, assignee, due_date FROM cards WHERE id = $1',
      [cardId]
    );

    if (existingResult.rowCount === 0) {
      res.status(404).json({ message: 'Card not found' });
      return;
    }

    const existing = existingResult.rows[0] as {
      id: number;
      board_id: number;
      column_id: number;
      title: string;
      description: string;
      assignee: string | null;
      due_date: string | null;
    };

    const role = await getBoardRole(userId, existing.board_id);
    if (!role || !canWrite(role)) {
      res.status(403).json({ message: 'Not authorized to update cards' });
      return;
    }

    const nextTitle = data.title ?? existing.title;
    const nextDescription = data.description ?? existing.description;
    let nextAssignee = existing.assignee;
    if (data.assignee !== undefined) {
      if (data.assignee === null || data.assignee.trim() === '') {
        nextAssignee = null;
      } else {
        const resolvedAssignee = await resolveBoardAssigneeName(existing.board_id, data.assignee);
        if (!resolvedAssignee) {
          res.status(400).json({ message: 'Assignee must be an existing board member.' });
          return;
        }
        nextAssignee = resolvedAssignee;
      }
    }

    let nextDueDate = existing.due_date;
    if (data.dueDate !== undefined) {
      if (data.dueDate === null || data.dueDate.trim() === '') {
        nextDueDate = null;
      } else {
        const normalizedDueDate = normalizeDueDate(data.dueDate);
        if (!normalizedDueDate) {
          res.status(400).json({ message: 'Invalid dueDate. Use YYYY-MM-DD format.' });
          return;
        }
        nextDueDate = normalizedDueDate;
      }
    }

    const hasCardChanges =
      nextTitle !== existing.title ||
      nextDescription !== existing.description ||
      nextAssignee !== existing.assignee ||
      nextDueDate !== existing.due_date;

    if (!hasCardChanges) {
      const unchangedResult = await pool.query(
        `SELECT id, board_id, column_id, title, description, assignee, due_date, position, created_at, updated_at
         FROM cards
         WHERE id = $1`,
        [cardId]
      );
      res.json(unchangedResult.rows[0]);
      return;
    }

    const result = await pool.query(
      `UPDATE cards
       SET title = $1, description = $2, assignee = $3, due_date = $4
       WHERE id = $5
       RETURNING id, board_id, column_id, title, description, assignee, due_date, position, created_at, updated_at`,
      [nextTitle, nextDescription, nextAssignee, nextDueDate, cardId]
    );

    await logActivity({
      boardId: existing.board_id,
      actorUserId: userId,
      entityType: 'card',
      entityId: cardId,
      action: 'updated',
      message: `Updated card \"${nextTitle}\"`
    });

    notifyBoard(existing.board_id, 'card_updated');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cards/:cardId', async (req: AuthRequest, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    const userId = req.user!.id;

    if (Number.isNaN(cardId)) {
      res.status(400).json({ message: 'Invalid card id' });
      return;
    }

    const existingResult = await pool.query('SELECT id, board_id, title FROM cards WHERE id = $1', [cardId]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ message: 'Card not found' });
      return;
    }

    const existing = existingResult.rows[0] as { id: number; board_id: number; title: string };
    const role = await getBoardRole(userId, existing.board_id);
    if (!role || !canWrite(role)) {
      res.status(403).json({ message: 'Not authorized to delete cards' });
      return;
    }

    await pool.query('DELETE FROM cards WHERE id = $1', [cardId]);

    await logActivity({
      boardId: existing.board_id,
      actorUserId: userId,
      entityType: 'card',
      entityId: cardId,
      action: 'deleted',
      message: `Deleted card \"${existing.title}\"`
    });

    notifyBoard(existing.board_id, 'card_deleted');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post('/api/cards/:cardId/move', async (req: AuthRequest, res, next) => {
  const client = await pool.connect();

  try {
    const cardId = Number(req.params.cardId);
    const userId = req.user!.id;
    const data = moveCardSchema.parse(req.body);

    if (Number.isNaN(cardId)) {
      res.status(400).json({ message: 'Invalid card id' });
      return;
    }

    await client.query('BEGIN');

    const cardResult = await client.query('SELECT id, board_id, column_id, title FROM cards WHERE id = $1 FOR UPDATE', [cardId]);
    if (cardResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Card not found' });
      return;
    }

    const card = cardResult.rows[0] as { id: number; board_id: number; column_id: number; title: string };

    const role = await getBoardRole(userId, card.board_id);
    if (!role || !canWrite(role)) {
      await client.query('ROLLBACK');
      res.status(403).json({ message: 'Not authorized to move cards' });
      return;
    }

    const targetColumnResult = await client.query('SELECT id, board_id FROM columns WHERE id = $1', [data.toColumnId]);
    if (targetColumnResult.rowCount === 0 || targetColumnResult.rows[0].board_id !== card.board_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Target column is invalid for this board' });
      return;
    }

    await client.query('UPDATE cards SET column_id = $1 WHERE id = $2', [data.toColumnId, cardId]);

    const cardsInTargetResult = await client.query(
      `SELECT id FROM cards
       WHERE column_id = $1
       ORDER BY position ASC, id ASC`,
      [data.toColumnId]
    );

    const ids = (cardsInTargetResult.rows as Array<{ id: number }>).map((row) => row.id).filter((id) => id !== cardId);
    const insertionIndex = Math.min(data.toPosition, ids.length);
    ids.splice(insertionIndex, 0, cardId);

    for (let i = 0; i < ids.length; i += 1) {
      await client.query('UPDATE cards SET position = $1 WHERE id = $2', [(i + 1) * 1000, ids[i]]);
    }

    const cardsInSourceResult = await client.query(
      `SELECT id FROM cards
       WHERE column_id = $1
       ORDER BY position ASC, id ASC`,
      [card.column_id]
    );

    for (let i = 0; i < cardsInSourceResult.rows.length; i += 1) {
      const id = cardsInSourceResult.rows[i].id as number;
      await client.query('UPDATE cards SET position = $1 WHERE id = $2', [(i + 1) * 1000, id]);
    }

    const movedCardResult = await client.query(
      `SELECT id, board_id, column_id, title, description, assignee, due_date, position, created_at, updated_at
       FROM cards
       WHERE id = $1`,
      [cardId]
    );

    await client.query('COMMIT');

    await logActivity({
      boardId: card.board_id,
      actorUserId: userId,
      entityType: 'card',
      entityId: cardId,
      action: 'moved',
      message: `Moved card \"${card.title}\"`
    });

    notifyBoard(card.board_id, 'card_moved');
    res.json(movedCardResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.get('/api/cards/:cardId/comments', async (req: AuthRequest, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    const userId = req.user!.id;

    if (Number.isNaN(cardId)) {
      res.status(400).json({ message: 'Invalid card id' });
      return;
    }

    const card = await getCardWithBoard(cardId);
    if (!card) {
      res.status(404).json({ message: 'Card not found' });
      return;
    }

    const role = await getBoardRole(userId, card.board_id);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    const result = await pool.query(
      `SELECT c.id, c.card_id, c.board_id, c.user_id, c.body, c.created_at,
              u.name AS author_name, u.email AS author_email
       FROM card_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.card_id = $1
       ORDER BY c.created_at ASC`,
      [cardId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/cards/:cardId/comments', async (req: AuthRequest, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    const userId = req.user!.id;
    const data = addCommentSchema.parse(req.body);

    if (Number.isNaN(cardId)) {
      res.status(400).json({ message: 'Invalid card id' });
      return;
    }

    const card = await getCardWithBoard(cardId);
    if (!card) {
      res.status(404).json({ message: 'Card not found' });
      return;
    }

    const role = await getBoardRole(userId, card.board_id);
    if (!role || !canWrite(role)) {
      res.status(403).json({ message: 'Not authorized to comment on this board' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO card_comments(board_id, card_id, user_id, body)
       VALUES($1, $2, $3, $4)
       RETURNING id, board_id, card_id, user_id, body, created_at`,
      [card.board_id, cardId, userId, data.body.trim()]
    );

    await logActivity({
      boardId: card.board_id,
      actorUserId: userId,
      entityType: 'comment',
      entityId: result.rows[0].id as number,
      action: 'created',
      message: `Commented on card \"${card.title}\"`
    });

    notifyBoard(card.board_id, 'comment_created');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/comments/:commentId', async (req: AuthRequest, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const userId = req.user!.id;

    if (Number.isNaN(commentId)) {
      res.status(400).json({ message: 'Invalid comment id' });
      return;
    }

    const commentResult = await pool.query(
      `SELECT id, board_id, card_id, user_id
       FROM card_comments
       WHERE id = $1`,
      [commentId]
    );

    if (commentResult.rowCount === 0) {
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    const comment = commentResult.rows[0] as { id: number; board_id: number; card_id: number; user_id: number | null };
    const role = await getBoardRole(userId, comment.board_id);
    if (!role) {
      res.status(403).json({ message: 'Not authorized for this board' });
      return;
    }

    const isOwner = role === 'owner';
    const isCommentAuthor = comment.user_id === userId;
    if (!isOwner && !isCommentAuthor) {
      res.status(403).json({ message: 'Not authorized to delete this comment' });
      return;
    }

    await pool.query('DELETE FROM card_comments WHERE id = $1', [commentId]);

    const card = await getCardWithBoard(comment.card_id);
    if (card) {
      await logActivity({
        boardId: comment.board_id,
        actorUserId: userId,
        entityType: 'comment',
        entityId: commentId,
        action: 'deleted',
        message: `Deleted a comment on card \"${card.title}\"`
      });
    }

    notifyBoard(comment.board_id, 'comment_deleted');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: 'Validation failed', issues: error.issues });
    return;
  }

  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
