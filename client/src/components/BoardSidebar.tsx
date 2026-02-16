import type { BoardSummary, User } from '../types';

type BoardSidebarProps = {
  user: User;
  boards: BoardSummary[];
  activeBoardId: number | null;
  boardName: string;
  onBoardNameChange: (value: string) => void;
  onCreateBoard: () => void;
  onSelectBoard: (boardId: number) => void;
  onLogout: () => void;
};

export function BoardSidebar(props: BoardSidebarProps) {
  const { user, boards, activeBoardId, boardName, onBoardNameChange, onCreateBoard, onSelectBoard, onLogout } = props;

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

      <div className="create-board">
        <input value={boardName} onChange={(event) => onBoardNameChange(event.target.value)} placeholder="New board name" />
        <button onClick={onCreateBoard}>Create</button>
      </div>

      <div className="board-list">
        {boards.map((board) => (
          <button
            key={board.id}
            className={board.id === activeBoardId ? 'board-item active' : 'board-item'}
            onClick={() => onSelectBoard(board.id)}
          >
            {board.name}
            <span className="role-pill">{board.role}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
