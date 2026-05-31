-- ================================================================
-- Daily Check-in v2.0.0 — Supabase Database Schema
-- Run this in Supabase SQL Editor: https://app.supabase.com
-- ================================================================

-- 1. Check-in Tasks
CREATE TABLE IF NOT EXISTS checkin_tasks (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_count  INT DEFAULT 1 CHECK (target_count >= 1 AND target_count <= 99),
  color         TEXT DEFAULT '#6366f1',
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_checkin_tasks_user ON checkin_tasks(user_id);

-- 2. Check-in History
CREATE TABLE IF NOT EXISTS checkin_history (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id       BIGINT NOT NULL REFERENCES checkin_tasks(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  count         INT DEFAULT 1 CHECK (count >= 1),
  completed_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, task_id, date)
);
CREATE INDEX idx_checkin_history_user_date ON checkin_history(user_id, date);
CREATE INDEX idx_checkin_history_task ON checkin_history(task_id);

-- 3. Todo Categories
CREATE TABLE IF NOT EXISTS todo_categories (
  id            TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT DEFAULT '#6366f1',
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_todo_categories_user ON todo_categories(user_id);

-- 4. Todo Items
CREATE TABLE IF NOT EXISTS todo_items (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id   TEXT REFERENCES todo_categories(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  deadline      TIMESTAMPTZ,
  priority      TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','postponed','cancelled')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX idx_todo_items_user ON todo_items(user_id);
CREATE INDEX idx_todo_items_category ON todo_items(category_id);
CREATE INDEX idx_todo_items_status ON todo_items(user_id, status);

-- 5. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    TEXT NOT NULL,
  avatar      TEXT DEFAULT '👤',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. Bookkeeping Records
CREATE TABLE IF NOT EXISTS bookkeeping_records (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount        DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL,
  note          TEXT DEFAULT '',
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_bk_records_user_date ON bookkeeping_records(user_id, date);
CREATE INDEX idx_bk_records_user_cat ON bookkeeping_records(user_id, category);

-- 7. Enable Row Level Security
ALTER TABLE checkin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookkeeping_records ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies: each user can only access their own data
CREATE POLICY "user_own_tasks" ON checkin_tasks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_history" ON checkin_history
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_todo_categories" ON todo_categories
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_todo_items" ON todo_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_bk_records" ON bookkeeping_records
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Body Measurements
CREATE TABLE IF NOT EXISTS body_measurements (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('weight','waist','arm','chest','hip')),
  value         DECIMAL(5,1) NOT NULL CHECK (value > 0),
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_body_measurements_user ON body_measurements(user_id, type);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_measurements" ON body_measurements
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Diet — Food Items
CREATE TABLE IF NOT EXISTS food_items (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  name          TEXT NOT NULL,
  weight        DECIMAL(6,1),
  calories      DECIMAL(8,1) NOT NULL CHECK (calories > 0),
  carbs         DECIMAL(6,1) DEFAULT 0,
  protein       DECIMAL(6,1) DEFAULT 0,
  fat           DECIMAL(6,1) DEFAULT 0,
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_food_items_user_date ON food_items(user_id, date);
CREATE INDEX idx_food_items_user_meal ON food_items(user_id, date, meal_type);

ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_food_items" ON food_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. Drink Records
CREATE TABLE IF NOT EXISTS drink_records (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        INT NOT NULL CHECK (amount > 0),
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_drink_records_user_date ON drink_records(user_id, date);

ALTER TABLE drink_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_drink_records" ON drink_records
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 10. Bathroom Records
CREATE TABLE IF NOT EXISTS bathroom_records (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shape         TEXT,
  color         TEXT,
  amount        TEXT,
  feeling       TEXT,
  smell         TEXT,
  duration      TEXT,
  date          DATE NOT NULL,
  time          TIME,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_bathroom_records_user_date ON bathroom_records(user_id, date);

ALTER TABLE bathroom_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_bathroom_records" ON bathroom_records
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 11. Sleep Records
CREATE TABLE IF NOT EXISTS sleep_records (
  id            BIGINT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('main', 'nap')),
  sleep_time    TIME NOT NULL,
  wake_time     TIME NOT NULL,
  duration_min  INT NOT NULL,
  date          DATE NOT NULL,
  rating        TEXT,
  quality       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sleep_records_user_date ON sleep_records(user_id, date);

ALTER TABLE sleep_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_sleep_records" ON sleep_records
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 12. Diet Settings
CREATE TABLE IF NOT EXISTS diet_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_calorie_target   DECIMAL(8,1) DEFAULT 8000,
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE diet_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_diet_settings" ON diet_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
