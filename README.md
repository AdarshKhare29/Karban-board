# Collaborative Kanban Board

A full-stack **collaborative Kanban board** with real-time updates, authentication, board roles, comments, activity timeline, and online presence.

## Features
- Authentication (register/login with JWT)
- Role-based board access (`owner`, `member`, `viewer`)
- Create boards, columns, and cards
- Drag-and-drop card movement
- Card detail modal (title, description, assignee, due date)
- Assignee validation against board members
- Card comments
- Board activity timeline
- Real-time sync via Socket.IO
- Real-time online presence indicators
- API integration test suite + CI workflow

## Tech Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Realtime: Socket.IO (WebSockets)
- Testing: Node test runner (`node --test`)

## Project Structure
- `client/` React app
- `server/` Express API + Socket.IO
- `server/db/schema.sql` PostgreSQL schema
- `.github/workflows/ci.yml` GitHub Actions CI

## Prerequisites
- Node.js 20+
- npm
- PostgreSQL (local or Docker)

## Quick Start
1. Install dependencies
```bash
npm install
```

2. Start PostgreSQL (Docker option)
```bash
docker compose up -d
```

3. Create env files
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

4. Set JWT secret in `server/.env`
```env
JWT_SECRET=replace-with-a-long-random-secret
```

5. Initialize/migrate DB schema
```bash
npm run db:init -w server
```

6. Run backend
```bash
npm run dev -w server
```

7. Run frontend (new terminal)
```bash
npm run dev -w client
```

8. Open app
- http://localhost:5173

## Environment Variables
### `server/.env`
- `PORT` (default `4000`)
- `DATABASE_URL` (example: `postgres://postgres:postgres@localhost:5432/kanban_db`)
- `CLIENT_ORIGIN` (default `http://localhost:5173`)
- `JWT_SECRET` (required)

### `client/.env`
- `VITE_API_URL` (default `http://localhost:4000`)
- `VITE_SOCKET_URL` (default `http://localhost:4000`)

## Running Tests
API integration tests:
```bash
npm run test:api -w server
```

Optional test env overrides:
- `TEST_API_PORT` (default: `4101`)
- `TEST_DATABASE_URL` (default: `DATABASE_URL` or local `kanban_db`)
- `TEST_JWT_SECRET` (default: `integration-test-secret`)

## Build
```bash
npm run build -w server
npm run build -w client
```

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

## CI
GitHub Actions workflow is included in:
- `.github/workflows/ci.yml`

It runs:
- install (`npm ci`)
- server build
- client build
- API integration tests (with PostgreSQL service)

## Troubleshooting
- `Cannot find package 'bcryptjs'`:
  - Run `npm install`

- `relation "activities" does not exist`:
  - Run `npm run db:init -w server`

- Due date appears shifted/timezoned:
  - Already handled by backend date parser in `server/src/db.ts`.

