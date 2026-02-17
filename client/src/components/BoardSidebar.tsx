import type { BoardSummary, User } from '../types';

type BoardSidebarProps = {
  user: User;
  boards: BoardSummary[];
  loadingBoards: boolean;
  creatingBoard: boolean;
  activeBoardId: number | null;
  boardName: string;
  onBoardNameChange: (value: string) => void;
  onCreateBoard: () => void;
  onSelectBoard: (boardId: number) => void;
  adminView: boolean;
  onOpenAdminView: () => void;
  onCloseAdminView: () => void;
  onLogout: () => void;
};

export function BoardSidebar(props: BoardSidebarProps) {
  const {
    user,
    boards,
    loadingBoards,
    creatingBoard,
    activeBoardId,
    boardName,
    onBoardNameChange,
    onCreateBoard,
    onSelectBoard,
    adminView,
    onOpenAdminView,
    onCloseAdminView,
    onLogout
  } = props;

  return (
    <aside className="sidebar">
      <h1>Kanban Boards</h1>
      <p className="user-info">
        {user.name}
        <br />
        {user.email}
      </p>
      <button className="logout" onClick={onLogout}>
        Logout
      </button>
      {user.is_admin ? (
        <button className="logout admin-toggle" onClick={adminView ? onCloseAdminView : onOpenAdminView}>
          {adminView ? 'Boards View' : 'Users Admin'}
        </button>
      ) : null}

      <div className="create-board">
        <input value={boardName} onChange={(event) => onBoardNameChange(event.target.value)} placeholder="New board name" />
        <button onClick={onCreateBoard} disabled={creatingBoard || !boardName.trim()}>
          {creatingBoard ? 'Creating...' : 'Create'}
        </button>
      </div>

      <div className="board-list">
        {loadingBoards && boards.length === 0 ? <p className="user-info">Loading boards...</p> : null}
        {!adminView
          ? boards.map((board) => (
          <button
            key={board.id}
            className={board.id === activeBoardId ? 'board-item active' : 'board-item'}
            onClick={() => onSelectBoard(board.id)}
          >
            {board.name}
            <span className="role-pill">{board.role}</span>
          </button>
            ))
          : null}
      </div>
    </aside>
  );
}
