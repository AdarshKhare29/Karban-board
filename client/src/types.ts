export type User = {
  id: number;
  name: string;
  email: string;
  is_admin?: boolean;
};

export type BoardSummary = {
  id: number;
  name: string;
  created_at: string;
  role: 'owner' | 'member' | 'viewer';
};

export type BoardMember = {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'member' | 'viewer';
};

export type Card = {
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

export type Column = {
  id: number;
  board_id: number;
  title: string;
  position: number;
  cards: Card[];
};

export type BoardDetail = {
  id: number;
  name: string;
  created_at: string;
  role: 'owner' | 'member' | 'viewer';
  columns: Column[];
};

export type CardComment = {
  id: number;
  board_id: number;
  card_id: number;
  user_id: number | null;
  body: string;
  created_at: string;
  author_name: string | null;
  author_email: string | null;
};

export type Activity = {
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

export type AuthResponse = {
  token: string;
  user: User;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  is_admin: boolean;
};
