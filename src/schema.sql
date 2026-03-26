-- Echo QR Menu — Digital Menu Platform
-- D1 Schema

CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  currency TEXT DEFAULT 'USD',
  brand_color TEXT DEFAULT '#0d7377',
  brand_font TEXT DEFAULT 'Inter',
  theme TEXT DEFAULT 'light',
  languages JSON DEFAULT '["en"]',
  default_language TEXT DEFAULT 'en',
  social JSON DEFAULT '{}',
  hours JSON DEFAULT '{}',
  wifi_name TEXT,
  wifi_password TEXT,
  status TEXT DEFAULT 'active',
  total_menus INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  total_scans INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'main',
  available_from TEXT,
  available_until TEXT,
  available_days JSON DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]',
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  total_categories INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  total_items INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  menu_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  compare_price REAL,
  image_url TEXT,
  calories INTEGER,
  prep_time_min INTEGER,
  spicy_level INTEGER DEFAULT 0,
  tags JSON DEFAULT '[]',
  allergens JSON DEFAULT '[]',
  dietary JSON DEFAULT '[]',
  modifiers JSON DEFAULT '[]',
  variants JSON DEFAULT '[]',
  translations JSON DEFAULT '{}',
  featured INTEGER DEFAULT 0,
  popular INTEGER DEFAULT 0,
  new_item INTEGER DEFAULT 0,
  available INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_restaurant ON items(restaurant_id);

CREATE TABLE IF NOT EXISTS qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  menu_id INTEGER,
  label TEXT NOT NULL,
  table_number TEXT,
  location TEXT,
  short_code TEXT NOT NULL UNIQUE,
  custom_url TEXT,
  style JSON DEFAULT '{}',
  total_scans INTEGER DEFAULT 0,
  last_scanned_at TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  referrer TEXT,
  table_number TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scans_qr ON scans(qr_id);
CREATE INDEX IF NOT EXISTS idx_scans_date ON scans(created_at);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  table_number TEXT,
  qr_id INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  items JSON NOT NULL DEFAULT '[]',
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  tip REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  item_id INTEGER,
  customer_name TEXT,
  rating INTEGER NOT NULL,
  comment TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  total_scans INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  popular_items JSON DEFAULT '[]',
  peak_hour INTEGER,
  UNIQUE(restaurant_id, date)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
