import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, '../data/rasoi.db');
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || defaultPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db: Database.Database = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CLIENT', 'ADMIN')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      firebase_uid TEXT,
      food_preference TEXT NOT NULL DEFAULT 'NONE',
      allergies TEXT NOT NULL DEFAULT '',
      spice_level TEXT NOT NULL DEFAULT 'MEDIUM',
      phone TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      category TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      quantity_mode TEXT NOT NULL DEFAULT 'COUNT',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','READY','PICKED_UP')),
      pickup_time TEXT NOT NULL,
      requested_date TEXT,
      pickup_assigned INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      item_name TEXT NOT NULL,
      variant_label TEXT NOT NULL DEFAULT 'Each',
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price_at_order_cents INTEGER NOT NULL CHECK (price_at_order_cents >= 0)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      subtotal_cents INTEGER NOT NULL,
      tax_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      html_snapshot TEXT NOT NULL,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_item_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(menu_item_id, label)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
  `);

  // Additive migrations keep existing local databases compatible with new releases.
  ensureColumn('users', 'firebase_uid', 'TEXT');
  ensureColumn('users', 'food_preference', "TEXT NOT NULL DEFAULT 'NONE'");
  ensureColumn('users', 'allergies', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'spice_level', "TEXT NOT NULL DEFAULT 'MEDIUM'");
  ensureColumn('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('menu_items', 'quantity_mode', "TEXT NOT NULL DEFAULT 'COUNT'");
  ensureColumn('orders', 'requested_date', 'TEXT');
  ensureColumn('orders', 'pickup_assigned', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('order_items', 'variant_label', "TEXT NOT NULL DEFAULT 'Each'");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL');
  db.prepare("UPDATE orders SET requested_date = substr(pickup_time, 1, 10), pickup_assigned = 1 WHERE requested_date IS NULL").run();
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export type Role = 'CLIENT' | 'ADMIN';
export type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'PICKED_UP';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
  firebase_uid?: string | null;
}

export interface OrderRecord extends Record<string, unknown> {
  id: number;
  client_id: number;
  client_name: string;
  client_email: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  requested_date: string;
  pickup_assigned: number;
  items: unknown[];
}

export function getOrder(id: number) {
  const order = db.prepare(`
    SELECT o.*, u.name AS client_name, u.email AS client_email,
      i.subtotal_cents, i.tax_cents, i.total_cents,
      r.id AS receipt_id, r.sent_at AS receipt_sent_at
    FROM orders o
    JOIN users u ON u.id = o.client_id
    JOIN invoices i ON i.order_id = o.id
    LEFT JOIN receipts r ON r.order_id = o.id
    WHERE o.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!order) return undefined;
  const items = db.prepare(`
    SELECT id, menu_item_id, item_name, variant_label, quantity, price_at_order_cents
    FROM order_items WHERE order_id = ? ORDER BY id
  `).all(id);
  return { ...order, items } as OrderRecord;
}

export function listOrders(clientId?: number) {
  const ids = clientId
    ? db.prepare('SELECT id FROM orders WHERE client_id = ? ORDER BY created_at DESC, id DESC').all(clientId)
    : db.prepare('SELECT id FROM orders ORDER BY created_at DESC, id DESC').all();
  return (ids as { id: number }[]).map(({ id }) => getOrder(id));
}
