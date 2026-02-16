import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type User = {
  id: number;
  name: string;
  email: string;
};

type BoardSummary = {
  id: number;
  name: string;
  created_at: string;
  role: 'owner' | 'member' | 'viewer';
};

type BoardMember = {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'member' | 'viewer';
};

type Card = {
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
};

type Column = {
  id: number;
  board_id: number;
  title: string;
  position: number;
  cards: Card[];
};

type BoardDetail = {
  id: number;
  name: string;
  created_at: string;
  role: 'owner' | 'member' | 'viewer';
  columns: Column[];
};

type CardComment = {
  id: number;
  board_id: number;
  card_id: number;
  user_id: number | null;
  body: string;
  created_at: string;
  author_name: string | null;
  author_email: string | null;
};

type Activity = {
  id: number;
  board_id: number;
  actor_user_id: number | null;
  entity_type: string;
  entity_id: number | null;
  action: string;
  message: string;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

type AuthResponse = {
  token: string;
  user: User;
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'kanban_auth_token';

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message ?? `Request failed: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function toDateInputValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  // Handles plain YYYY-MM-DD strings safely.
  return value.slice(0, 10);
}

export function App() {
  const boardRequestIdRef = useRef(0);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
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
  const [activities, setActivities] = useState<Activity[]>([]);

  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardColumnId, setNewCardColumnId] = useState<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [dragCard, setDragCard] = useState<{ cardId: number; fromColumnId: number } | null>(null);

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
    setActivities([]);
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
      return;
    }

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
      void loadActivities(activeBoardId);

      if (selectedCardId !== null) {
        void loadComments(selectedCardId);
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
      return;
    }

    setCardTitle(selectedCard.title);
    setCardDescription(selectedCard.description ?? '');
    setCardAssignee(selectedCard.assignee ?? '');
    setCardDueDate(toDateInputValue(selectedCard.due_date));
    void loadComments(selectedCard.id);
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
    }
  }

  async function loadBoards() {
    try {
      const items = await request<BoardSummary[]>('/api/boards', token);
      setBoards(items);

      if (items.length === 0) {
        setActiveBoardId(null);
        setActiveBoard(null);
        setMembers([]);
        setOnlineUserIds([]);
        setActivities([]);
        return;
      }

      const nextId = activeBoardId && items.some((board) => board.id === activeBoardId) ? activeBoardId : items[0].id;
      setActiveBoardId(nextId);
      await loadBoard(nextId, false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        handleUnauthorized();
        return;
      }
      setError((err as Error).message);
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

  async function loadActivities(boardId: number) {
    try {
      const nextActivities = await request<Activity[]>(`/api/boards/${boardId}/activities?limit=30`, token);
      setActivities(nextActivities);
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
      await Promise.all([loadMembers(boardId), loadActivities(boardId)]);
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
    setUser(null);
    setBoards([]);
    setActiveBoard(null);
    setActiveBoardId(null);
    setMembers([]);
    setOnlineUserIds([]);
    setActivities([]);
    setSelectedCardId(null);
    setError(null);
  }

  async function createBoard() {
    if (!boardName.trim()) {
      return;
    }

    try {
      const created = await request<BoardSummary>('/api/boards', token, {
        method: 'POST',
        body: JSON.stringify({ name: boardName.trim() })
      });

      setBoardName('');
      await loadBoards();
      await loadBoard(created.id, false);
    } catch (err) {
      setError((err as Error).message);
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
      await Promise.all([loadMembers(activeBoardId), loadActivities(activeBoardId)]);
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
    if (!activeBoardId) {
      return;
    }

    try {
      await request(`/api/cards/${cardId}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ toColumnId, toPosition })
      });
      await loadBoard(activeBoardId, false);
    } catch (err) {
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
      await loadActivities(activeBoardId);
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
      await loadComments(selectedCard.id);
      if (activeBoardId) {
        await loadActivities(activeBoardId);
      }
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
      await loadComments(selectedCard.id);
      if (activeBoardId) {
        await loadActivities(activeBoardId);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Collaborative Kanban</h1>
          <p>{authMode === 'login' ? 'Sign in to continue' : 'Create your account'}</p>

          {authMode === 'register' ? (
            <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Name" />
          ) : null}

          <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" type="email" />

          <input
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            placeholder="Password"
            type="password"
          />

          <button onClick={() => void submitAuth()}>{authMode === 'login' ? 'Login' : 'Register'}</button>

          <button className="link-button" onClick={() => setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'))}>
            {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="page">
        <aside className="sidebar">
          <h1>Kanban Boards</h1>
          <p className="user-info">
            {user.name}
            <br />
            {user.email}
          </p>
          <button className="logout" onClick={logout}>
            Logout
          </button>

          <div className="create-board">
            <input value={boardName} onChange={(event) => setBoardName(event.target.value)} placeholder="New board name" />
            <button onClick={createBoard}>Create</button>
          </div>

          <div className="board-list">
            {boards.map((board) => (
              <button
                key={board.id}
                className={board.id === activeBoardId ? 'board-item active' : 'board-item'}
                onClick={() => {
                  void loadBoard(board.id, false);
                }}
              >
                {board.name}
                <span className="role-pill">{board.role}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {error ? <p className="error">{error}</p> : null}
          {loadingBoard ? <p>Loading board...</p> : null}

          {activeBoard ? (
            <>
              <div className="board-header">
                <div>
                  <h2>{activeBoard.name}</h2>
                  <p className="board-role">Your role: {activeBoard.role}</p>
                </div>

                {canWrite ? (
                  <div className="create-column">
                    <input
                      value={newColumnTitle}
                      onChange={(event) => setNewColumnTitle(event.target.value)}
                      placeholder="New column"
                    />
                    <button onClick={createColumn}>Add Column</button>
                  </div>
                ) : null}
              </div>

              {canWrite ? (
                <section className="card-create-panel">
                  <h3>Create Card</h3>
                  <div className="card-create-form">
                    <input
                      value={newCardTitle}
                      onChange={(event) => setNewCardTitle(event.target.value)}
                      placeholder="Card title"
                    />
                    <select
                      value={newCardColumnId ?? ''}
                      onChange={(event) => setNewCardColumnId(Number(event.target.value))}
                    >
                      {sortedColumns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.title}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => void createCard()} disabled={!newCardTitle.trim() || !newCardColumnId}>
                      Add Card
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="members">
                <h3>Members</h3>
                <div className="members-list">
                  {members.map((member) => (
                    <span
                      key={member.id}
                      className={onlineUserIds.includes(member.id) ? 'member-pill online' : 'member-pill'}
                    >
                      {member.name} ({member.role})
                      <span className={onlineUserIds.includes(member.id) ? 'presence-dot online' : 'presence-dot'} />
                    </span>
                  ))}
                </div>

                {activeBoard.role === 'owner' ? (
                  <div className="invite-form">
                    <input
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="Invite by email"
                      type="email"
                    />
                    <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'member' | 'viewer')}>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button onClick={() => void addMember()}>Add Member</button>
                  </div>
                ) : null}
              </section>

              <section className="activity-panel">
                <h3>Activity</h3>
                <div className="activity-list">
                  {activities.length === 0 ? <p>No activity yet.</p> : null}
                  {activities.map((activity) => (
                    <article key={activity.id} className="activity-item">
                      <p>{activity.message}</p>
                      <small>
                        {activity.actor_name ?? activity.actor_email ?? 'System'} - {formatDateTime(activity.created_at)}
                      </small>
                    </article>
                  ))}
                </div>
              </section>

              <section className="columns">
                {sortedColumns.map((column) => (
                  <div
                    key={column.id}
                    className="column"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!dragCard || !canWrite) {
                        return;
                      }
                      void moveCard(dragCard.cardId, column.id, column.cards.length);
                      setDragCard(null);
                    }}
                  >
                    <h3>{column.title}</h3>

                    <div className="cards">
                      {column.cards
                        .sort((a, b) => a.position - b.position)
                        .map((card, index) => (
                          <article
                            key={card.id}
                            className="card"
                            draggable={canWrite}
                            onClick={() => setSelectedCardId(card.id)}
                            onDragStart={() => {
                              if (!canWrite) {
                                return;
                              }
                              setDragCard({ cardId: card.id, fromColumnId: card.column_id });
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.stopPropagation();
                              if (!dragCard || !canWrite) {
                                return;
                              }
                              void moveCard(dragCard.cardId, column.id, index);
                              setDragCard(null);
                            }}
                          >
                            <p>{card.title}</p>
                            {card.assignee ? <small>Assignee: {card.assignee}</small> : null}
                            {card.due_date ? <small>Due: {toDateInputValue(card.due_date)}</small> : null}
                            {canWrite ? (
                              <button
                                className="delete"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteCard(card.id);
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </article>
                        ))}
                    </div>

                  </div>
                ))}
              </section>
            </>
          ) : (
            <p>Create your first board to start collaborating.</p>
          )}
        </main>
      </div>

      {selectedCard ? (
        <div className="modal-overlay" onClick={() => setSelectedCardId(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Card Details</h3>
              <button className="modal-close" onClick={() => setSelectedCardId(null)}>
                Close
              </button>
            </div>

            <div className="modal-grid">
              <div className="modal-section">
                <label>Title</label>
                <input value={cardTitle} disabled={!canWrite} onChange={(event) => setCardTitle(event.target.value)} />

                <label>Description</label>
                <textarea
                  rows={5}
                  value={cardDescription}
                  disabled={!canWrite}
                  onChange={(event) => setCardDescription(event.target.value)}
                />

                <label>Assignee</label>
                <select value={cardAssignee} disabled={!canWrite} onChange={(event) => setCardAssignee(event.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                  {cardAssignee && !members.some((member) => member.name === cardAssignee) ? (
                    <option value={cardAssignee}>Current: {cardAssignee}</option>
                  ) : null}
                </select>

                <label>Due date</label>
                <input type="date" value={cardDueDate} disabled={!canWrite} onChange={(event) => setCardDueDate(event.target.value)} />

                <p className="muted">Updated: {formatDateTime(selectedCard.updated_at)}</p>

                {canWrite ? (
                  <div className="modal-actions">
                    <button onClick={() => void saveCardDetails()} disabled={savingCard || !cardTitle.trim()}>
                      {savingCard ? 'Saving...' : 'Save'}
                    </button>
                    <button className="delete" onClick={() => void deleteCard(selectedCard.id)}>
                      Delete Card
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="modal-section">
                <h4>Comments</h4>
                <div className="comment-list">
                  {comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
                  {comments.map((comment) => (
                    <article key={comment.id} className="comment-item">
                      <p>{comment.body}</p>
                      <small>
                        {comment.author_name ?? comment.author_email ?? 'Unknown'} - {formatDateTime(comment.created_at)}
                      </small>
                      {(comment.user_id === user.id || activeBoard?.role === 'owner') && canWrite ? (
                        <button className="delete" onClick={() => void deleteComment(comment.id)}>
                          Delete
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>

                {canWrite ? (
                  <div className="comment-form">
                    <textarea
                      rows={3}
                      placeholder="Write a comment"
                      value={newCommentBody}
                      onChange={(event) => setNewCommentBody(event.target.value)}
                    />
                    <button onClick={() => void addComment()} disabled={!newCommentBody.trim()}>
                      Add Comment
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
