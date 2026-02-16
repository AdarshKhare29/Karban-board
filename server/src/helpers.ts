import { pool } from './db.js';
import type { BoardRole } from './types.js';

export async function getBoardRole(userId: number, boardId: number): Promise<BoardRole | null> {
  const result = await pool.query('SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].role as BoardRole;
}

export async function getCardWithBoard(cardId: number): Promise<{ id: number; board_id: number; title: string } | null> {
  const result = await pool.query('SELECT id, board_id, title FROM cards WHERE id = $1', [cardId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as { id: number; board_id: number; title: string };
}

export function canWrite(role: BoardRole): boolean {
  return role === 'owner' || role === 'member';
}

export function normalizeDueDate(value: string): string | null {
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

export async function resolveBoardAssigneeName(boardId: number, assigneeValue: string): Promise<string | null> {
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
