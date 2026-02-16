import { formatDateTime } from '../lib/api';
import type { BoardDetail, BoardMember, Card, CardComment, User } from '../types';

type CardModalProps = {
  selectedCard: Card;
  canWrite: boolean;
  user: User;
  activeBoard: BoardDetail | null;
  members: BoardMember[];
  cardTitle: string;
  cardDescription: string;
  cardAssignee: string;
  cardDueDate: string;
  comments: CardComment[];
  newCommentBody: string;
  savingCard: boolean;
  onClose: () => void;
  onCardTitleChange: (value: string) => void;
  onCardDescriptionChange: (value: string) => void;
  onCardAssigneeChange: (value: string) => void;
  onCardDueDateChange: (value: string) => void;
  onSave: () => void;
  onDeleteCard: () => void;
  onNewCommentBodyChange: (value: string) => void;
  onAddComment: () => void;
  onDeleteComment: (commentId: number) => void;
};

export function CardModal(props: CardModalProps) {
  const {
    selectedCard,
    canWrite,
    user,
    activeBoard,
    members,
    cardTitle,
    cardDescription,
    cardAssignee,
    cardDueDate,
    comments,
    newCommentBody,
    savingCard,
    onClose,
    onCardTitleChange,
    onCardDescriptionChange,
    onCardAssigneeChange,
    onCardDueDateChange,
    onSave,
    onDeleteCard,
    onNewCommentBodyChange,
    onAddComment,
    onDeleteComment
  } = props;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Card Details</h3>
          <button className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-section">
            <label>Title</label>
            <input value={cardTitle} disabled={!canWrite} onChange={(event) => onCardTitleChange(event.target.value)} />

            <label>Description</label>
            <textarea rows={5} value={cardDescription} disabled={!canWrite} onChange={(event) => onCardDescriptionChange(event.target.value)} />

            <label>Assignee</label>
            <select value={cardAssignee} disabled={!canWrite} onChange={(event) => onCardAssigneeChange(event.target.value)}>
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
            <input type="date" value={cardDueDate} disabled={!canWrite} onChange={(event) => onCardDueDateChange(event.target.value)} />

            <p className="muted">Updated: {formatDateTime(selectedCard.updated_at)}</p>

            {canWrite ? (
              <div className="modal-actions">
                <button onClick={onSave} disabled={savingCard || !cardTitle.trim()}>
                  {savingCard ? 'Saving...' : 'Save'}
                </button>
                <button className="delete" onClick={onDeleteCard}>
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
                    <button className="delete" onClick={() => onDeleteComment(comment.id)}>
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
                  onChange={(event) => onNewCommentBodyChange(event.target.value)}
                />
                <button onClick={onAddComment} disabled={!newCommentBody.trim()}>
                  Add Comment
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
