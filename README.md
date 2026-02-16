# Collaborative Kanban Board (Phase 2)

Full-stack collaborative kanban app with authenticated users, board membership roles, PostgreSQL persistence, and realtime board updates.

## Tech Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Realtime: Socket.IO (WebSockets)

## Phase 3 Features
- User registration and login (JWT)
- Protected API routes
- Board membership roles: `owner`, `member`, `viewer`
- Owner can invite existing users by email
- Role-based write protection for columns/cards
- Realtime updates scoped to authorized board members
- Card detail modal (title/description/assignee/due date edit)
- Card comments
- Board activity timeline

## Project Structure
- `/Users/adarshkha/Documents/New project/client`
- `/Users/adarshkha/Documents/New project/server`
- `/Users/adarshkha/Documents/New project/server/db/schema.sql`

## Setup
1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL:
```bash
docker compose up -d
```

3. Configure env files:
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

4. Set JWT secret in `/Users/adarshkha/Documents/New project/server/.env`:
```env
JWT_SECRET=replace-with-a-long-random-secret
```

5. Initialize / migrate database schema:
```bash
npm run db:init -w server
```

6. Run backend:
```bash
npm run dev -w server
```

7. Run frontend:
```bash
npm run dev -w client
```

8. Open app:
- [http://localhost:5173](http://localhost:5173)

## API Integration Tests
Run backend integration tests (auth, permissions, due-date validation, assignee membership, activity/no-op checks):

```bash
cd "/Users/adarshkha/Documents/New project"
npm run test:api -w server
```

Optional env overrides for tests:
- `TEST_API_PORT` (default: `4101`)
- `TEST_DATABASE_URL` (default: `DATABASE_URL` or local `kanban_db`)
- `TEST_JWT_SECRET` (default: `integration-test-secret`)

## Key API Endpoints
Public:
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`

Authenticated:
- `GET /api/auth/me`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/boards/:boardId`
- `GET /api/boards/:boardId/members`
- `POST /api/boards/:boardId/members` (owner only)
- `GET /api/boards/:boardId/activities`
- `POST /api/boards/:boardId/columns` (owner/member)
- `PATCH /api/columns/:columnId` (owner/member)
- `POST /api/columns/:columnId/cards` (owner/member)
- `PATCH /api/cards/:cardId` (owner/member)
- `DELETE /api/cards/:cardId` (owner/member)
- `POST /api/cards/:cardId/move` (owner/member)
- `GET /api/cards/:cardId/comments`
- `POST /api/cards/:cardId/comments` (owner/member)
- `DELETE /api/comments/:commentId` (owner or comment author)
