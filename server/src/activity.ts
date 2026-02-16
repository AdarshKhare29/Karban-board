import { pool } from './db.js';

export async function logActivity(params: {
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
