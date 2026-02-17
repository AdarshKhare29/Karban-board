import { useState } from 'react';
import { toDateInputValue } from '../lib/api';
import type { BoardDetail, BoardMember, Column } from '../types';

type BoardMainProps = {
  activeBoard: BoardDetail | null;
  loadingBoard: boolean;
  error: string | null;
  canWrite: boolean;
  sortedColumns: Column[];
  members: BoardMember[];
  onlineUserIds: number[];
  newColumnTitle: string;
  onNewColumnTitleChange: (value: string) => void;
  onCreateColumn: () => void;
  onRenameColumn: (columnId: number, currentTitle: string) => void;
  newCardTitle: string;
  onNewCardTitleChange: (value: string) => void;
  newCardColumnId: number | null;
  onNewCardColumnIdChange: (value: number) => void;
  onCreateCard: () => void;
  memberEmail: string;
  onMemberEmailChange: (value: string) => void;
  memberRole: 'member' | 'viewer';
  onMemberRoleChange: (value: 'member' | 'viewer') => void;
  onAddMember: () => void;
  onMoveCard: (cardId: number, toColumnId: number, toPosition: number) => void;
  onOpenCard: (cardId: number) => void;
  onDeleteCard: (cardId: number) => void;
};

export function BoardMain(props: BoardMainProps) {
  const {
    activeBoard,
    loadingBoard,
    error,
    canWrite,
    sortedColumns,
    members,
    onlineUserIds,
    newColumnTitle,
    onNewColumnTitleChange,
    onCreateColumn,
    onRenameColumn,
    newCardTitle,
    onNewCardTitleChange,
    newCardColumnId,
    onNewCardColumnIdChange,
    onCreateCard,
    memberEmail,
    onMemberEmailChange,
    memberRole,
    onMemberRoleChange,
    onAddMember,
    onMoveCard,
    onOpenCard,
    onDeleteCard
  } = props;

  const [dragCard, setDragCard] = useState<{ cardId: number; fromColumnId: number } | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState('');

  function startRename(columnId: number, currentTitle: string) {
    setEditingColumnId(columnId);
    setEditingColumnTitle(currentTitle);
  }

  function cancelRename() {
    setEditingColumnId(null);
    setEditingColumnTitle('');
  }

  function saveRename(columnId: number, currentTitle: string) {
    const nextTitle = editingColumnTitle.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      cancelRename();
      return;
    }

    onRenameColumn(columnId, nextTitle);
    cancelRename();
  }

  function moveCardToAdjacentColumn(cardId: number, columnIndex: number, direction: 'left' | 'right') {
    if (!canWrite) {
      return;
    }

    const targetIndex = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedColumns.length) {
      return;
    }

    const targetColumn = sortedColumns[targetIndex];
    onMoveCard(cardId, targetColumn.id, targetColumn.cards.length);
  }

  function getInitials(name: string) {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'U'
    );
  }

  function getDueBadge(dueDate: string | null) {
    if (!dueDate) {
      return null;
    }
    const current = new Date();
    const due = new Date(toDateInputValue(dueDate));
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.floor((due.getTime() - current.setHours(0, 0, 0, 0)) / msPerDay);
    if (days < 0) {
      return { label: 'Overdue', tone: 'danger' as const };
    }
    if (days <= 2) {
      return { label: 'Due Soon', tone: 'warn' as const };
    }
    return { label: 'Planned', tone: 'ok' as const };
  }

  return (
    <main className={`main board-theme-${((activeBoard?.id ?? 1) % 5) + 1}`}>
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
                <input value={newColumnTitle} onChange={(event) => onNewColumnTitleChange(event.target.value)} placeholder="New column" />
                <button onClick={onCreateColumn}>Add Column</button>
              </div>
            ) : null}
          </div>

          {canWrite ? (
            <section className="card-create-panel">
              <h3>Create Card</h3>
              <div className="card-create-form">
                <input value={newCardTitle} onChange={(event) => onNewCardTitleChange(event.target.value)} placeholder="Card title" />
                <select value={newCardColumnId ?? ''} onChange={(event) => onNewCardColumnIdChange(Number(event.target.value))}>
                  {sortedColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
                <button onClick={onCreateCard} disabled={!newCardTitle.trim() || !newCardColumnId}>
                  Add Card
                </button>
              </div>
            </section>
          ) : null}

          <section className="members">
            <h3>Members</h3>
            <div className="members-list">
              {members.map((member) => (
                <span key={member.id} className={onlineUserIds.includes(member.id) ? 'member-pill online' : 'member-pill'}>
                  <span className="member-avatar">{getInitials(member.name)}</span>
                  {member.name} ({member.role})
                  <span className={onlineUserIds.includes(member.id) ? 'presence-dot online' : 'presence-dot'} />
                </span>
              ))}
            </div>

            {activeBoard.role === 'owner' ? (
              <div className="invite-form">
                <input value={memberEmail} onChange={(event) => onMemberEmailChange(event.target.value)} placeholder="Invite by email" type="email" />
                <select value={memberRole} onChange={(event) => onMemberRoleChange(event.target.value as 'member' | 'viewer')}>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button onClick={onAddMember}>Add Member</button>
              </div>
            ) : null}
          </section>

          <section className="columns">
            {sortedColumns.map((column, columnIndex) => (
              <div
                key={column.id}
                className={`column column-tone-${(columnIndex % 4) + 1}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragCard || !canWrite) {
                    return;
                  }
                  onMoveCard(dragCard.cardId, column.id, column.cards.length);
                  setDragCard(null);
                }}
              >
                <div className="column-header">
                  {editingColumnId === column.id ? (
                    <>
                      <input
                        className="column-rename-input"
                        value={editingColumnTitle}
                        onChange={(event) => setEditingColumnTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            saveRename(column.id, column.title);
                          }
                          if (event.key === 'Escape') {
                            cancelRename();
                          }
                        }}
                        autoFocus
                      />
                      <div className="column-actions">
                        <button className="column-rename icon-button" title="Save column name" aria-label="Save column name" onClick={() => saveRename(column.id, column.title)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </button>
                        <button className="column-rename cancel icon-button" title="Cancel rename" aria-label="Cancel rename" onClick={cancelRename}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>{column.title}</h3>
                      {canWrite ? (
                        <button
                          className="column-rename icon-button"
                          title="Rename column"
                          aria-label="Rename column"
                          onClick={() => startRename(column.id, column.title)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 20h4l10-10-4-4L4 16v4z" />
                            <path d="M14 6l4 4" />
                          </svg>
                        </button>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="cards">
                  {column.cards
                    .sort((a, b) => a.position - b.position)
                    .map((card, index) => {
                      const dueBadge = getDueBadge(card.due_date);
                      return (
                      <article
                        key={card.id}
                        className="card"
                        draggable={canWrite}
                        onClick={() => onOpenCard(card.id)}
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
                          onMoveCard(dragCard.cardId, column.id, index);
                          setDragCard(null);
                        }}
                      >
                        <div className="card-headline">
                          <p>{card.title}</p>
                          <button
                            className="card-open"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenCard(card.id);
                            }}
                          >
                            Open
                          </button>
                        </div>
                        {card.assignee ? <small>Assignee: {card.assignee}</small> : null}
                        {card.due_date ? <small>Due: {toDateInputValue(card.due_date)}</small> : null}
                        {dueBadge ? (
                          <span className={`card-badge ${dueBadge.tone}`}>{dueBadge.label}</span>
                        ) : null}
                        {canWrite ? (
                          <div className="touch-move-controls">
                            <button
                              className="touch-move"
                              disabled={columnIndex === 0}
                              onClick={(event) => {
                                event.stopPropagation();
                                moveCardToAdjacentColumn(card.id, columnIndex, 'left');
                              }}
                            >
                              Prev
                            </button>
                            <button
                              className="touch-move"
                              disabled={columnIndex === sortedColumns.length - 1}
                              onClick={(event) => {
                                event.stopPropagation();
                                moveCardToAdjacentColumn(card.id, columnIndex, 'right');
                              }}
                            >
                              Next
                            </button>
                          </div>
                        ) : null}
                        {canWrite ? (
                          <button
                            className="delete icon-button"
                            title="Delete card"
                            aria-label="Delete card"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteCard(card.id);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M7 6l1 14h8l1-14" />
                            </svg>
                          </button>
                        ) : null}
                      </article>
                      );
                    })}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <p>Create your first board to start collaborating.</p>
      )}
    </main>
  );
}
