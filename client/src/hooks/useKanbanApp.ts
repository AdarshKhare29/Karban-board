import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { request, toDateInputValue } from '../lib/api';
import type {
  Activity,
  AuthResponse,
  BoardDetail,
  BoardMember,
  BoardSummary,
  CardComment,
  User
} from '../types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'kanban_auth_token';

export function useKanbanApp() {
  const boardRequestIdRef = useRef(0);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [authInitializing, setAuthInitializing] = useState<boolean>(() => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardName, setBoardName] = useState('');
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [activeBoard, setActiveBoard] = useState<BoardDetail | null>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'member' | 'viewer'>('member');
  const [cardActivities, setCardActivities] = useState<Activity[]>([]);
  const [loadingBoards, setLoadingBoards] = useState<boolean>(() => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)));
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardColumnId, setNewCardColumnId] = useState<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [cardTitle, setCardTitle] = useState('');
  const [cardDescription, setCardDescription] = useState('');
  const [cardAssignee, setCardAssignee] = useState('');
  const [cardDueDate, setCardDueDate] = useState('');
  const [comments, setComments] = useState<CardComment[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [savingCard, setSavingCard] = useState(false);

  const sortedColumns = useMemo(() => {
    if (!activeBoard) {
      return [];
    }

    return [...activeBoard.columns].sort((a, b) => a.position - b.position);
  }, [activeBoard]);

  const selectedCard = useMemo(() => {
    if (!activeBoard || selectedCardId === null) {
      return null;
    }

    for (const column of activeBoard.columns) {
      const card = column.cards.find((item) => item.id === selectedCardId);
      if (card) {
        return card;
      }
    }

    return null;
  }, [activeBoard, selectedCardId]);

  const canWrite = activeBoard ? activeBoard.role === 'owner' || activeBoard.role === 'member' : false;

  function setTokenState(nextToken: string | null) {
    setToken(nextToken);
    if (nextToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  function handleUnauthorized() {
    setTokenState(null);
    setUser(null);
    setBoards([]);
    setActiveBoard(null);
    setActiveBoardId(null);
    setMembers([]);
    setOnlineUserIds([]);
    setCardActivities([]);
    setSelectedCardId(null);
    setError('Session expired. Please log in again.');
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    const instance = io(SOCKET_URL, {
      auth: { token }
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAuthInitializing(false);
      setLoadingBoards(false);
      return;
    }

    setAuthInitializing(true);
    void bootstrap();
  }, [token]);

  useEffect(() => {
    if (!socket || !activeBoardId) {
      return;
    }

    socket.emit('join_board', activeBoardId);

    const onBoardChanged = (payload: { boardId: number }) => {
      if (payload.boardId !== activeBoardId) {
        return;
      }

      void loadBoard(activeBoardId, false);

      if (selectedCardId !== null) {
        void loadComments(selectedCardId);
        void loadCardActivities(selectedCardId);
      }
    };

    const onPresenceChanged = (payload: { boardId: number; onlineUserIds: number[] }) => {
      if (payload.boardId !== activeBoardId) {
        return;
      }
      setOnlineUserIds(payload.onlineUserIds);
    };

    socket.on('board_changed', onBoardChanged);
    socket.on('presence_changed', onPresenceChanged);

    return () => {
      socket.emit('leave_board', activeBoardId);
      socket.off('board_changed', onBoardChanged);
      socket.off('presence_changed', onPresenceChanged);
      setOnlineUserIds([]);
    };
  }, [socket, activeBoardId, selectedCardId]);

  useEffect(() => {
    if (!socket || !token) {
      return;
    }

    const onBoardsChanged = () => {
      void loadBoards();
    };

    socket.on('boards_changed', onBoardsChanged);
    return () => {
      socket.off('boards_changed', onBoardsChanged);
    };
  }, [socket, token, activeBoardId]);

  useEffect(() => {
    if (!selectedCard) {
      setComments([]);
      setCardActivities([]);
      return;
    }

    setCardTitle(selectedCard.title);
    setCardDescription(selectedCard.description ?? '');
    setCardAssignee(selectedCard.assignee ?? '');
    setCardDueDate(toDateInputValue(selectedCard.due_date));
    void Promise.all([loadComments(selectedCard.id), loadCardActivities(selectedCard.id)]);
  }, [selectedCard]);

  useEffect(() => {
    if (!activeBoard || activeBoard.columns.length === 0) {
      setNewCardColumnId(null);
      return;
    }

    const hasSelected = newCardColumnId !== null && activeBoard.columns.some((column) => column.id === newCardColumnId);
    if (!hasSelected) {
      const firstColumn = [...activeBoard.columns].sort((a, b) => a.position - b.position)[0];
      setNewCardColumnId(firstColumn.id);
    }
  }, [activeBoard, newCardColumnId]);

  async function bootstrap() {
    try {
      const me = await request<User>('/api/auth/me', token);
      setUser(me);
      await loadBoards();
      setError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        handleUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setAuthInitializing(false);
    }
  }

  async function loadBoards() {
    setLoadingBoards(true);
    try {
      const items = await request<BoardSummary[]>('/api/boards', token);
      setBoards(items);

      if (items.length === 0) {
        setActiveBoardId(null);
        setActiveBoard(null);
        setMembers([]);
        setOnlineUserIds([]);
        setCardActivities([]);
        return;
      }

      const nextId = activeBoardId && items.some((board) => board.id === activeBoardId) ? activeBoardId : items[0].id;
      setActiveBoardId(nextId);
      void loadBoard(nextId, false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        handleUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoadingBoards(false);
    }
  }

  async function loadMembers(boardId: number) {
    try {
      const nextMembers = await request<BoardMember[]>(`/api/boards/${boardId}/members`, token);
      setMembers(nextMembers);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadComments(cardId: number) {
    try {
      const nextComments = await request<CardComment[]>(`/api/cards/${cardId}/comments`, token);
      setComments(nextComments);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadCardActivities(cardId: number) {
    try {
      const nextActivities = await request<Activity[]>(`/api/cards/${cardId}/activities?limit=50`, token);
      setCardActivities(nextActivities);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadBoard(boardId: number, showLoading = true) {
    const requestId = boardRequestIdRef.current + 1;
    boardRequestIdRef.current = requestId;

    if (showLoading) {
      setLoadingBoard(true);
    }

    try {
      const board = await request<BoardDetail>(`/api/boards/${boardId}`, token);
      if (requestId !== boardRequestIdRef.current) {
        return;
      }

      setActiveBoard(board);
      setActiveBoardId(boardId);
      void loadMembers(boardId);
      setError(null);

      if (selectedCardId !== null) {
        const cardStillExists = board.columns.some((column) => column.cards.some((card) => card.id === selectedCardId));
        if (!cardStillExists) {
          setSelectedCardId(null);
        }
      }
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        handleUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      if (showLoading && requestId === boardRequestIdRef.current) {
        setLoadingBoard(false);
      }
    }
  }

  async function submitAuth() {
    if (!authEmail.trim() || !authPassword.trim()) {
      return;
    }

    if (authMode === 'register' && !authName.trim()) {
      return;
    }

    try {
      const payload =
        authMode === 'register'
          ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
          : { email: authEmail.trim(), password: authPassword };

      const path = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const result = await request<AuthResponse>(path, null, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setUser(result.user);
      setTokenState(result.token);
      setAuthPassword('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function logout() {
    setTokenState(null);
    setAuthInitializing(false);
    setUser(null);
    setBoards([]);
    setActiveBoard(null);
    setActiveBoardId(null);
    setMembers([]);
    setOnlineUserIds([]);
    setCardActivities([]);
    setLoadingBoards(false);
    setSelectedCardId(null);
    setError(null);
  }

  async function createBoard() {
    if (!boardName.trim()) {
      return;
    }

    try {
      setCreatingBoard(true);
      const trimmedName = boardName.trim();
      const created = await request<{ id: number; name: string; created_at: string }>('/api/boards', token, {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName })
      });

      setBoardName('');
      setBoards((prev) => [
        { id: created.id, name: created.name, created_at: created.created_at, role: 'owner' },
        ...prev.filter((board) => board.id !== created.id)
      ]);
      setActiveBoardId(created.id);
      void loadBoard(created.id, false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingBoard(false);
    }
  }

  async function addMember() {
    if (!activeBoardId || !memberEmail.trim()) {
      return;
    }

    try {
      await request(`/api/boards/${activeBoardId}/members`, token, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole })
      });

      setMemberEmail('');
      await loadMembers(activeBoardId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createColumn() {
    if (!activeBoardId || !newColumnTitle.trim()) {
      return;
    }

    try {
      await request(`/api/boards/${activeBoardId}/columns`, token, {
        method: 'POST',
        body: JSON.stringify({ title: newColumnTitle.trim() })
      });
      setNewColumnTitle('');
      await loadBoard(activeBoardId, false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function renameColumn(columnId: number, nextTitleRaw: string) {
    if (!activeBoardId) {
      return;
    }

    const nextTitle = nextTitleRaw.trim();
    if (!nextTitle) {
      return;
    }

    try {
      await request(`/api/columns/${columnId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle })
      });
      await loadBoard(activeBoardId, false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createCard() {
    const title = newCardTitle.trim();
    if (!title || !activeBoardId || !newCardColumnId) {
      return;
    }

    try {
      await request(`/api/columns/${newCardColumnId}/cards`, token, {
        method: 'POST',
        body: JSON.stringify({ title })
      });
      setNewCardTitle('');
      await loadBoard(activeBoardId, false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteCard(cardId: number) {
    if (!activeBoardId) {
      return;
    }

    try {
      await request(`/api/cards/${cardId}`, token, { method: 'DELETE' });
      if (selectedCardId === cardId) {
        setSelectedCardId(null);
      }
      await loadBoard(activeBoardId, false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveCard(cardId: number, toColumnId: number, toPosition: number) {
    if (!activeBoardId || !activeBoard) {
      return;
    }

    const previousBoard = activeBoard;
    const sourceColumnIndex = activeBoard.columns.findIndex((column) => column.cards.some((card) => card.id === cardId));
    const targetColumnIndex = activeBoard.columns.findIndex((column) => column.id === toColumnId);

    if (sourceColumnIndex === -1 || targetColumnIndex === -1) {
      return;
    }

    const sourceColumn = activeBoard.columns[sourceColumnIndex];
    const movingCardIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);
    if (movingCardIndex === -1) {
      return;
    }

    const movingCard = sourceColumn.cards[movingCardIndex];
    const sourceCards = sourceColumn.cards.filter((card) => card.id !== cardId);
    const targetColumn = activeBoard.columns[targetColumnIndex];
    const targetCardsBase = targetColumn.id === sourceColumn.id ? sourceCards : [...targetColumn.cards];
    const insertionIndex = Math.max(0, Math.min(toPosition, targetCardsBase.length));

    const nextTargetCards = [...targetCardsBase];
    nextTargetCards.splice(insertionIndex, 0, { ...movingCard, column_id: toColumnId });

    const nextColumns = activeBoard.columns.map((column) => {
      if (column.id === sourceColumn.id && column.id === targetColumn.id) {
        return {
          ...column,
          cards: nextTargetCards.map((card, index) => ({ ...card, position: (index + 1) * 1000 }))
        };
      }

      if (column.id === sourceColumn.id) {
        return {
          ...column,
          cards: sourceCards.map((card, index) => ({ ...card, position: (index + 1) * 1000 }))
        };
      }

      if (column.id === targetColumn.id) {
        return {
          ...column,
          cards: nextTargetCards.map((card, index) => ({ ...card, position: (index + 1) * 1000 }))
        };
      }

      return column;
    });

    setActiveBoard({
      ...activeBoard,
      columns: nextColumns
    });

    try {
      await request(`/api/cards/${cardId}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ toColumnId, toPosition })
      });
      if (selectedCardId === cardId) {
        void loadCardActivities(cardId);
      }
    } catch (err) {
      setActiveBoard(previousBoard);
      setError((err as Error).message);
    }
  }

  async function saveCardDetails() {
    if (!selectedCard || !activeBoardId || !canWrite) {
      return;
    }

    try {
      setSavingCard(true);
      await request(`/api/cards/${selectedCard.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          title: cardTitle.trim(),
          description: cardDescription,
          assignee: cardAssignee.trim() || null,
          dueDate: cardDueDate ? toDateInputValue(cardDueDate) : null
        })
      });

      await loadBoard(activeBoardId, false);
      if (selectedCard) {
        await loadCardActivities(selectedCard.id);
      }
      setSelectedCardId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingCard(false);
    }
  }

  async function addComment() {
    if (!selectedCard || !newCommentBody.trim()) {
      return;
    }

    try {
      await request(`/api/cards/${selectedCard.id}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body: newCommentBody.trim() })
      });

      setNewCommentBody('');
      await Promise.all([loadComments(selectedCard.id), loadCardActivities(selectedCard.id)]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteComment(commentId: number) {
    if (!selectedCard) {
      return;
    }

    try {
      await request(`/api/comments/${commentId}`, token, { method: 'DELETE' });
      await Promise.all([loadComments(selectedCard.id), loadCardActivities(selectedCard.id)]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return {
    token,
    user,
    authMode,
    authName,
    authEmail,
    authPassword,
    authInitializing,
    error,
    setAuthMode,
    setAuthName,
    setAuthEmail,
    setAuthPassword,
    submitAuth,

    boards,
    boardName,
    activeBoardId,
    activeBoard,
    members,
    onlineUserIds,
    memberEmail,
    memberRole,
    cardActivities,
    loadingBoards,
    creatingBoard,
    loadingBoard,
    canWrite,
    sortedColumns,

    newColumnTitle,
    newCardTitle,
    newCardColumnId,
    setBoardName,
    setNewColumnTitle,
    setNewCardTitle,
    setNewCardColumnId,
    setMemberEmail,
    setMemberRole,

    logout,
    createBoard,
    loadBoard,
    addMember,
    createColumn,
    renameColumn,
    createCard,
    moveCard,
    deleteCard,

    selectedCard,
    setSelectedCardId,
    cardTitle,
    cardDescription,
    cardAssignee,
    cardDueDate,
    comments,
    newCommentBody,
    savingCard,
    setCardTitle,
    setCardDescription,
    setCardAssignee,
    setCardDueDate,
    setNewCommentBody,
    saveCardDetails,
    addComment,
    deleteComment
  };
}
