import { useState } from 'react';
import { formatDateTime, toDateInputValue } from '../lib/api';
import type { Activity, BoardDetail, BoardMember, Column } from '../types';

type BoardMainProps = {
  activeBoard: BoardDetail | null;
  loadingBoard: boolean;
  error: string | null;
  canWrite: boolean;
  sortedColumns: Column[];
  members: BoardMember[];
  onlineUserIds: number[];
  activities: Activity[];
  newColumnTitle: string;
  onNewColumnTitleChange: (value: string) => void;
  onCreateColumn: () => void;
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
    activities,
    newColumnTitle,
    onNewColumnTitleChange,
    onCreateColumn,
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

  return (
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
                  onMoveCard(dragCard.cardId, column.id, column.cards.length);
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
                        <p>{card.title}</p>
                        {card.assignee ? <small>Assignee: {card.assignee}</small> : null}
                        {card.due_date ? <small>Due: {toDateInputValue(card.due_date)}</small> : null}
                        {canWrite ? (
                          <button
                            className="delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteCard(card.id);
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
  );
}
