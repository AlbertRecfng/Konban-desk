-- Начальная схема: пользователи, сессии, доски, участники, колонки, задачи

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  name          VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Refresh-токены хранятся в виде SHA-256 хеша: утечка БД не даёт доступа к сессиям
CREATE TABLE refresh_tokens (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TYPE board_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE boards (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  description TEXT         NOT NULL DEFAULT '',
  owner_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER boards_updated_at BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE board_members (
  board_id INTEGER     NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     board_role  NOT NULL DEFAULT 'editor',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX board_members_user_idx ON board_members(user_id);

-- Уникальность позиции отложена до COMMIT: при перестановке позиции
-- временно совпадают, но к концу транзакции порядок снова корректен
CREATE TABLE board_columns (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id   INTEGER      NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      VARCHAR(100) NOT NULL,
  position   INTEGER      NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT board_columns_position_uq UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE tasks (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  column_id   INTEGER       NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  title       VARCHAR(200)  NOT NULL,
  description TEXT          NOT NULL DEFAULT '',
  priority    task_priority NOT NULL DEFAULT 'medium',
  due_date    DATE,
  position    INTEGER       NOT NULL CHECK (position >= 0),
  assignee_id INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT tasks_position_uq UNIQUE (column_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
