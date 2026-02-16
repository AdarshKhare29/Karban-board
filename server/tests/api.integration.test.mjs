import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const port = Number(process.env.TEST_API_PORT ?? 4101);
const baseUrl = `http://localhost:${port}`;
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/kanban_db';
const jwtSecret = process.env.TEST_JWT_SECRET ?? 'integration-test-secret';

let serverProcess = null;

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function waitForHealth(timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function api(pathName, init) {
  const response = await fetch(`${baseUrl}${pathName}`, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function initDbSchema() {
  const pool = new Pool({ connectionString: databaseUrl });
  const schemaPath = path.resolve(serverDir, 'db', 'schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf-8');
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

before(async () => {
  execSync('npm run build', {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: 'inherit'
  });

  await initDbSchema();

  serverProcess = spawn('npm', ['run', 'start'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: jwtSecret,
      CLIENT_ORIGIN: 'http://localhost:5173'
    },
    stdio: 'inherit'
  });

  await waitForHealth();
});

after(() => {
  if (!serverProcess) {
    return;
  }

  serverProcess.kill('SIGTERM');
  serverProcess = null;
});

describe('API integration', () => {
  it('register/login/me flow works', async () => {
    const email = uniqueEmail('owner');
    const password = 'password123';

    const register = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Owner User', email, password })
    });

    assert.equal(register.status, 201);
    assert.ok(register.body.token);
    assert.equal(register.body.user.email, email);

    const login = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const me = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${login.body.token}` }
    });

    assert.equal(me.status, 200);
    assert.equal(me.body.email, email);
    assert.equal(me.body.name, 'Owner User');
  });

  it('enforces role permissions, due-date validation, assignee membership, and activity records', async () => {
    const ownerEmail = uniqueEmail('owner2');
    const memberEmail = uniqueEmail('member');
    const viewerEmail = uniqueEmail('viewer');
    const password = 'password123';

    const owner = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Owner Two', email: ownerEmail, password })
    });
    assert.equal(owner.status, 201);

    const member = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Member User', email: memberEmail, password })
    });
    assert.equal(member.status, 201);

    const viewer = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Viewer User', email: viewerEmail, password })
    });
    assert.equal(viewer.status, 201);

    const createdBoard = await api('/api/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ name: `Integration Board ${Date.now()}` })
    });
    assert.equal(createdBoard.status, 201);

    const boardId = createdBoard.body.id;

    const addMember = await api(`/api/boards/${boardId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ email: memberEmail, role: 'member' })
    });
    assert.equal(addMember.status, 201);

    const addViewer = await api(`/api/boards/${boardId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ email: viewerEmail, role: 'viewer' })
    });
    assert.equal(addViewer.status, 201);

    const board = await api(`/api/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(board.status, 200);
    assert.ok(board.body.columns.length >= 1);

    const todoColumnId = board.body.columns[0].id;

    const invalidDueDate = await api(`/api/columns/${todoColumnId}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ title: 'Invalid Due Date', dueDate: '2026-02-30' })
    });
    assert.equal(invalidDueDate.status, 400);

    const invalidAssignee = await api(`/api/columns/${todoColumnId}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ title: 'Invalid Assignee', assignee: 'not-on-board@example.com' })
    });
    assert.equal(invalidAssignee.status, 400);

    const viewerCreateDenied = await api(`/api/columns/${todoColumnId}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewer.body.token}`
      },
      body: JSON.stringify({ title: 'Viewer should not create' })
    });
    assert.equal(viewerCreateDenied.status, 403);

    const createdCard = await api(`/api/columns/${todoColumnId}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({
        title: 'Valid Card',
        assignee: memberEmail,
        dueDate: '2026-03-10'
      })
    });
    assert.equal(createdCard.status, 201);
    assert.equal(createdCard.body.assignee, 'Member User');
    assert.equal(createdCard.body.due_date, '2026-03-10');

    const activities = await api(`/api/boards/${boardId}/activities?limit=50`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(activities.status, 200);
    assert.ok(activities.body.some((item) => item.action === 'created' && item.message.includes('Valid Card')));

    const noOpUpdate = await api(`/api/cards/${createdCard.body.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({
        title: 'Valid Card',
        assignee: 'Member User',
        dueDate: '2026-03-10'
      })
    });
    assert.equal(noOpUpdate.status, 200);

    const activitiesAfterNoOp = await api(`/api/boards/${boardId}/activities?limit=50`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(activitiesAfterNoOp.status, 200);

    const beforeCount = activities.body.filter((item) => item.action === 'updated' && item.message.includes('Valid Card')).length;
    const afterCount = activitiesAfterNoOp.body.filter((item) => item.action === 'updated' && item.message.includes('Valid Card')).length;
    assert.equal(afterCount, beforeCount);
  });

  it('enforces comment permissions and records comment activity', async () => {
    const ownerEmail = uniqueEmail('owner3');
    const memberEmail = uniqueEmail('member2');
    const viewerEmail = uniqueEmail('viewer2');
    const password = 'password123';

    const owner = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Owner Three', email: ownerEmail, password })
    });
    assert.equal(owner.status, 201);

    const member = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Member Two', email: memberEmail, password })
    });
    assert.equal(member.status, 201);

    const viewer = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Viewer Two', email: viewerEmail, password })
    });
    assert.equal(viewer.status, 201);

    const boardCreate = await api('/api/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ name: `Comments Board ${Date.now()}` })
    });
    assert.equal(boardCreate.status, 201);
    const boardId = boardCreate.body.id;

    const inviteMember = await api(`/api/boards/${boardId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ email: memberEmail, role: 'member' })
    });
    assert.equal(inviteMember.status, 201);

    const inviteViewer = await api(`/api/boards/${boardId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ email: viewerEmail, role: 'viewer' })
    });
    assert.equal(inviteViewer.status, 201);

    const board = await api(`/api/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(board.status, 200);
    const todoColumnId = board.body.columns[0].id;

    const createdCard = await api(`/api/columns/${todoColumnId}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.body.token}`
      },
      body: JSON.stringify({ title: 'Comment Target Card' })
    });
    assert.equal(createdCard.status, 201);
    const cardId = createdCard.body.id;

    const viewerCommentDenied = await api(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewer.body.token}`
      },
      body: JSON.stringify({ body: 'Viewer should not comment' })
    });
    assert.equal(viewerCommentDenied.status, 403);

    const memberComment = await api(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member.body.token}`
      },
      body: JSON.stringify({ body: 'Member comment body' })
    });
    assert.equal(memberComment.status, 201);
    const memberCommentId = memberComment.body.id;

    const commentList = await api(`/api/cards/${cardId}/comments`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(commentList.status, 200);
    assert.ok(commentList.body.some((item) => item.id === memberCommentId && item.body === 'Member comment body'));

    const viewerDeleteDenied = await api(`/api/comments/${memberCommentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${viewer.body.token}`
      }
    });
    assert.equal(viewerDeleteDenied.status, 403);

    const ownerDeleteAllowed = await api(`/api/comments/${memberCommentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${owner.body.token}`
      }
    });
    assert.equal(ownerDeleteAllowed.status, 204);

    const commentsAfterDelete = await api(`/api/cards/${cardId}/comments`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(commentsAfterDelete.status, 200);
    assert.equal(commentsAfterDelete.body.some((item) => item.id === memberCommentId), false);

    const activities = await api(`/api/boards/${boardId}/activities?limit=50`, {
      headers: { Authorization: `Bearer ${owner.body.token}` }
    });
    assert.equal(activities.status, 200);
    assert.ok(activities.body.some((item) => item.entity_type === 'comment' && item.action === 'created'));
    assert.ok(activities.body.some((item) => item.entity_type === 'comment' && item.action === 'deleted'));
  });
});
