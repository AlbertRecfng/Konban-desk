-- WIP-лимит (Work In Progress): максимальное число задач в колонке. NULL - без ограничения.
-- Сервер не даёт добавить или перенести задачу в заполненную колонку.
ALTER TABLE board_columns
  ADD COLUMN wip_limit INTEGER CHECK (wip_limit > 0);
