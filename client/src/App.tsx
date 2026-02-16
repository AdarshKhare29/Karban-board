import { AuthPage } from './components/AuthPage';
import { BoardMain } from './components/BoardMain';
import { BoardSidebar } from './components/BoardSidebar';
import { CardModal } from './components/CardModal';
import { useKanbanApp } from './hooks/useKanbanApp';

export function App() {
  const app = useKanbanApp();

  if (app.token && app.authInitializing) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Restoring session</h1>
          <p>Loading your boards...</p>
        </div>
      </div>
    );
  }

  if (!app.token || !app.user) {
    return (
      <AuthPage
        authMode={app.authMode}
        authName={app.authName}
        authEmail={app.authEmail}
        authPassword={app.authPassword}
        error={app.error}
        onAuthNameChange={app.setAuthName}
        onAuthEmailChange={app.setAuthEmail}
        onAuthPasswordChange={app.setAuthPassword}
        onSubmit={() => void app.submitAuth()}
        onToggleMode={() => app.setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'))}
      />
    );
  }

  return (
    <>
      <div className="page">
        <BoardSidebar
          user={app.user}
          boards={app.boards}
          loadingBoards={app.loadingBoards}
          creatingBoard={app.creatingBoard}
          activeBoardId={app.activeBoardId}
          boardName={app.boardName}
          onBoardNameChange={app.setBoardName}
          onCreateBoard={() => void app.createBoard()}
          onSelectBoard={(boardId) => {
            void app.loadBoard(boardId, false);
          }}
          onLogout={app.logout}
        />

        <BoardMain
          activeBoard={app.activeBoard}
          loadingBoard={app.loadingBoard}
          error={app.error}
          canWrite={app.canWrite}
          sortedColumns={app.sortedColumns}
          members={app.members}
          onlineUserIds={app.onlineUserIds}
          newColumnTitle={app.newColumnTitle}
          onNewColumnTitleChange={app.setNewColumnTitle}
          onCreateColumn={() => void app.createColumn()}
          onRenameColumn={(columnId, currentTitle) => {
            void app.renameColumn(columnId, currentTitle);
          }}
          newCardTitle={app.newCardTitle}
          onNewCardTitleChange={app.setNewCardTitle}
          newCardColumnId={app.newCardColumnId}
          onNewCardColumnIdChange={app.setNewCardColumnId}
          onCreateCard={() => void app.createCard()}
          memberEmail={app.memberEmail}
          onMemberEmailChange={app.setMemberEmail}
          memberRole={app.memberRole}
          onMemberRoleChange={app.setMemberRole}
          onAddMember={() => void app.addMember()}
          onMoveCard={(cardId, toColumnId, toPosition) => {
            void app.moveCard(cardId, toColumnId, toPosition);
          }}
          onOpenCard={app.setSelectedCardId}
          onDeleteCard={(cardId) => {
            void app.deleteCard(cardId);
          }}
        />
      </div>

      {app.selectedCard ? (
        <CardModal
          selectedCard={app.selectedCard}
          canWrite={app.canWrite}
          user={app.user}
          activeBoard={app.activeBoard}
          members={app.members}
          cardTitle={app.cardTitle}
          cardDescription={app.cardDescription}
          cardAssignee={app.cardAssignee}
          cardDueDate={app.cardDueDate}
          comments={app.comments}
          cardActivities={app.cardActivities}
          newCommentBody={app.newCommentBody}
          savingCard={app.savingCard}
          onClose={() => app.setSelectedCardId(null)}
          onCardTitleChange={app.setCardTitle}
          onCardDescriptionChange={app.setCardDescription}
          onCardAssigneeChange={app.setCardAssignee}
          onCardDueDateChange={app.setCardDueDate}
          onSave={() => void app.saveCardDetails()}
          onDeleteCard={() => {
            if (!app.selectedCard) {
              return;
            }
            void app.deleteCard(app.selectedCard.id);
          }}
          onNewCommentBodyChange={app.setNewCommentBody}
          onAddComment={() => void app.addComment()}
          onDeleteComment={(commentId) => void app.deleteComment(commentId)}
        />
      ) : null}
    </>
  );
}
