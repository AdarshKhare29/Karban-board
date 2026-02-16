import type { Server } from 'socket.io';

export function createPresenceManager(io: Server) {
  const boardPresence = new Map<number, Map<number, number>>();

  function add(boardId: number, userId: number) {
    const boardMap = boardPresence.get(boardId) ?? new Map<number, number>();
    boardMap.set(userId, (boardMap.get(userId) ?? 0) + 1);
    boardPresence.set(boardId, boardMap);
  }

  function remove(boardId: number, userId: number) {
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

  function onlineUserIds(boardId: number): number[] {
    return Array.from(boardPresence.get(boardId)?.keys() ?? []);
  }

  function notify(boardId: number) {
    io.to(`board:${boardId}`).emit('presence_changed', {
      boardId,
      onlineUserIds: onlineUserIds(boardId),
      at: new Date().toISOString()
    });
  }

  return { add, remove, notify };
}
