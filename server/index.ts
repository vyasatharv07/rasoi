import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { authenticate, authorize, clearSession, issueSession, rotateRefresh, tokenHash } from './auth.js';
import { db, getOrder, initializeDatabase, listOrders, type OrderStatus, type UserRow } from './db.js';
import { createAndSendReceipt, sendDailyDigest } from './mail.js';
import { getFirebaseAuth } from './firebase.js';

initializeDatabase();
const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.use(cors({ origin: process.env.APP_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email.toLowerCase()) as UserRow | undefined;
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  issueSession(res, safeUser);
  return res.json({ user: safeUser });
});

const firebaseSessionSchema = z.object({ idToken: z.string().min(100), name: z.string().trim().min(2).max(100).optional() });
app.post('/api/auth/firebase', loginLimiter, async (req, res) => {
  const parsed = firebaseSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Firebase session.' });
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return res.status(503).json({ error: 'Firebase Authentication is not configured on the server.' });
  try {
    const decoded = await firebaseAuth.verifyIdToken(parsed.data.idToken, true);
    if (!decoded.email) return res.status(400).json({ error: 'Your Firebase account needs an email address.' });
    let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ? OR email = ?').get(decoded.uid, decoded.email.toLowerCase()) as UserRow | undefined;
    if (!user) {
      const unusableHash = await bcrypt.hash(crypto.randomUUID(), 12);
      const result = db.prepare("INSERT INTO users (name, email, password_hash, role, firebase_uid) VALUES (?, ?, ?, 'CLIENT', ?)")
        .run(parsed.data.name || decoded.name || decoded.email.split('@')[0], decoded.email.toLowerCase(), unusableHash, decoded.uid);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow;
    } else if (!user.firebase_uid) {
      db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(decoded.uid, user.id);
    }
    const safeUser = { id: user.id, name: parsed.data.name || user.name, email: user.email, role: user.role };
    if (parsed.data.name && parsed.data.name !== user.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(parsed.data.name, user.id);
    issueSession(res, safeUser);
    return res.json({ user: safeUser });
  } catch {
    return res.status(401).json({ error: 'Firebase could not verify this sign-in. Please try again.' });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  const user = rotateRefresh(req, res);
  if (!user) {
    clearSession(res, req.cookies?.rasoi_refresh);
    return res.status(401).json({ error: 'Please sign in again.' });
  }
  return res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(res, req.cookies?.rasoi_refresh);
  res.status(204).end();
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/menu', authenticate, (_req, res) => {
  const menu = db.prepare(`SELECT id, name, description, price_cents, category, is_available, quantity_mode, created_at, updated_at FROM menu_items ORDER BY category, name`).all() as Array<Record<string, unknown>>;
  const optionQuery = db.prepare('SELECT id, label, price_cents FROM menu_item_options WHERE menu_item_id = ? ORDER BY sort_order, id');
  for (const item of menu) item.options = optionQuery.all(item.id);
  res.json({ menu });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).default(''),
  foodPreference: z.enum(['NONE', 'VEGETARIAN', 'VEGAN', 'JAIN']),
  allergies: z.string().trim().max(500).default(''),
  spiceLevel: z.enum(['MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT']),
});

app.get('/api/profile', authenticate, (req, res) => {
  const profile = db.prepare('SELECT id, name, email, role, phone, food_preference, allergies, spice_level FROM users WHERE id = ?').get(req.user!.id);
  res.json({ profile });
});

app.put('/api/profile', authenticate, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check your profile details.' });
  const p = parsed.data;
  db.prepare('UPDATE users SET name = ?, phone = ?, food_preference = ?, allergies = ?, spice_level = ? WHERE id = ?')
    .run(p.name, p.phone, p.foodPreference, p.allergies, p.spiceLevel, req.user!.id);
  const profile = db.prepare('SELECT id, name, email, role, phone, food_preference, allergies, spice_level FROM users WHERE id = ?').get(req.user!.id);
  res.json({ profile });
});

const orderSchema = z.object({
  notes: z.string().trim().max(500).default(''),
  items: z.array(z.object({ menuItemId: z.number().int().positive(), optionId: z.number().int().positive().nullable().optional(), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
});

app.post('/api/orders', authenticate, authorize('CLIENT'), (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose at least one available item and a valid pickup time.' });
  const ids = [...new Set(parsed.data.items.map(item => item.menuItemId))];
  const placeholders = ids.map(() => '?').join(',');
  const menuRows = db.prepare(`SELECT id, name, price_cents, is_available FROM menu_items WHERE id IN (${placeholders})`).all(...ids) as Array<{ id: number; name: string; price_cents: number; is_available: number }>;
  if (menuRows.length !== ids.length || menuRows.some(item => !item.is_available)) return res.status(400).json({ error: 'One or more items are currently unavailable.' });
  const byId = new Map(menuRows.map(item => [item.id, item]));
  const optionQuery = db.prepare('SELECT id, menu_item_id, label, price_cents FROM menu_item_options WHERE id = ?');
  const resolvedItems: Array<{ menuItemId: number; optionId?: number | null; quantity: number; name: string; label: string; priceCents: number }> = [];
  for (const item of parsed.data.items) {
    const menuItem = byId.get(item.menuItemId)!;
    const option = item.optionId ? optionQuery.get(item.optionId) as { id: number; menu_item_id: number; label: string; price_cents: number } | undefined : undefined;
    if (item.optionId && (!option || option.menu_item_id !== item.menuItemId)) return res.status(400).json({ error: 'Choose a valid portion for each item.' });
    resolvedItems.push({ ...item, name: menuItem.name, label: option?.label || 'Each', priceCents: option?.price_cents ?? menuItem.price_cents });
  }
  const subtotal = resolvedItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const tax = Math.round(subtotal * Number(process.env.TAX_RATE || 0.0825));
  const requested = new Date();
  requested.setDate(requested.getDate() + 1);
  const requestedDate = `${requested.getFullYear()}-${String(requested.getMonth() + 1).padStart(2, '0')}-${String(requested.getDate()).padStart(2, '0')}`;
  const placeholderPickup = new Date(`${requestedDate}T12:00:00`);
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO orders (client_id, pickup_time, requested_date, pickup_assigned, notes) VALUES (?, ?, ?, 0, ?)').run(req.user!.id, placeholderPickup.toISOString(), requestedDate, parsed.data.notes);
    const orderId = Number(result.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO order_items (order_id, menu_item_id, item_name, variant_label, quantity, price_at_order_cents) VALUES (?, ?, ?, ?, ?, ?)');
    for (const item of resolvedItems) {
      insertItem.run(orderId, item.menuItemId, item.name, item.label, item.quantity, item.priceCents);
    }
    db.prepare('INSERT INTO invoices (order_id, subtotal_cents, tax_cents, total_cents) VALUES (?, ?, ?, ?)').run(orderId, subtotal, tax, subtotal + tax);
    return orderId;
  });
  const orderId = create();
  res.status(201).json({ order: getOrder(orderId) });
});

app.get('/api/orders', authenticate, (req, res) => {
  res.json({ orders: listOrders(req.user!.role === 'CLIENT' ? req.user!.id : undefined) });
});

app.get('/api/orders/:id', authenticate, (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (req.user!.role === 'CLIENT' && Number(order.client_id) !== req.user!.id) return res.status(403).json({ error: 'You do not have access to this order.' });
  res.json({ order });
});

app.get('/api/receipts/:orderId', authenticate, (req, res) => {
  const order = getOrder(Number(req.params.orderId));
  if (!order) return res.status(404).send('Receipt not found.');
  if (req.user!.role === 'CLIENT' && Number(order.client_id) !== req.user!.id) return res.status(403).send('Forbidden');
  const receipt = db.prepare('SELECT html_snapshot FROM receipts WHERE order_id = ?').get(order.id) as { html_snapshot: string } | undefined;
  if (!receipt) return res.status(404).send('Receipt is available once this order is picked up.');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="rasoi-receipt-${order.id}.html"`);
  res.send(receipt.html_snapshot);
});

const menuSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(''),
  price: z.number().nonnegative().max(10000),
  category: z.string().trim().min(2).max(50),
  isAvailable: z.boolean().default(true),
  quantityMode: z.enum(['COUNT', 'PORTION']).default('COUNT'),
  options: z.array(z.object({ label: z.string().trim().min(1).max(20), price: z.number().nonnegative().max(10000) })).max(10).default([]),
});

app.post('/api/admin/menu', authenticate, authorize('ADMIN'), (req, res) => {
  const parsed = menuSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the menu item details.' });
  const d = parsed.data;
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO menu_items (name, description, price_cents, category, is_available, quantity_mode) VALUES (?, ?, ?, ?, ?, ?)').run(d.name, d.description, Math.round(d.price * 100), d.category, Number(d.isAvailable), d.quantityMode);
    const itemId = Number(result.lastInsertRowid);
    const insertOption = db.prepare('INSERT INTO menu_item_options (menu_item_id, label, price_cents, sort_order) VALUES (?, ?, ?, ?)');
    d.options.forEach((option, index) => insertOption.run(itemId, option.label, Math.round(option.price * 100), index));
    return itemId;
  });
  const itemId = create();
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(itemId);
  res.status(201).json({ item });
});

app.put('/api/admin/menu/:id', authenticate, authorize('ADMIN'), (req, res) => {
  const parsed = menuSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the menu item details.' });
  const d = parsed.data;
  const result = db.prepare(`UPDATE menu_items SET name=?, description=?, price_cents=?, category=?, is_available=?, quantity_mode=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(d.name, d.description, Math.round(d.price * 100), d.category, Number(d.isAvailable), d.quantityMode, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Menu item not found.' });
  db.prepare('DELETE FROM menu_item_options WHERE menu_item_id = ?').run(Number(req.params.id));
  const insertOption = db.prepare('INSERT INTO menu_item_options (menu_item_id, label, price_cents, sort_order) VALUES (?, ?, ?, ?)');
  d.options.forEach((option, index) => insertOption.run(Number(req.params.id), option.label, Math.round(option.price * 100), index));
  res.json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(Number(req.params.id)) });
});

app.delete('/api/admin/menu/:id', authenticate, authorize('ADMIN'), (req, res) => {
  try {
    const result = db.prepare('DELETE FROM menu_items WHERE id = ?').run(Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Menu item not found.' });
    res.status(204).end();
  } catch {
    res.status(409).json({ error: 'This item appears in an order. Mark it unavailable instead.' });
  }
});

const statusSchema = z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'READY', 'PICKED_UP']) });
app.patch('/api/admin/orders/:id/status', authenticate, authorize('ADMIN'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid order status.' });
  const orderId = Number(req.params.id);
  const previous = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined;
  if (!previous) return res.status(404).json({ error: 'Order not found.' });
  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(parsed.data.status, orderId);
  let receiptWarning: string | undefined;
  if (parsed.data.status === 'PICKED_UP' && previous.status !== 'PICKED_UP') {
    try { await createAndSendReceipt(orderId); }
    catch (error) { receiptWarning = error instanceof Error ? error.message : 'Receipt email could not be sent.'; }
  }
  res.json({ order: getOrder(orderId), receiptWarning });
});

const pickupSchema = z.object({ pickupTime: z.string().datetime() });
app.patch('/api/admin/orders/:id/pickup', authenticate, authorize('ADMIN'), (req, res) => {
  const parsed = pickupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid pickup time.' });
  const order = getOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const pickup = new Date(parsed.data.pickupTime);
  const localDate = `${pickup.getFullYear()}-${String(pickup.getMonth() + 1).padStart(2, '0')}-${String(pickup.getDate()).padStart(2, '0')}`;
  if (localDate !== order.requested_date) return res.status(400).json({ error: `Pickup must be scheduled for ${order.requested_date}.` });
  db.prepare('UPDATE orders SET pickup_time = ?, pickup_assigned = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(pickup.toISOString(), order.id);
  res.json({ order: getOrder(order.id) });
});

app.post('/api/orders/:id/confirm-pickup', authenticate, authorize('CLIENT'), async (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (Number(order.client_id) !== req.user!.id) return res.status(403).json({ error: 'You do not have access to this order.' });
  if (order.status !== 'READY') return res.status(409).json({ error: 'You can confirm pickup once the kitchen marks the order ready.' });
  db.prepare("UPDATE orders SET status = 'PICKED_UP', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
  let receiptWarning: string | undefined;
  try { await createAndSendReceipt(order.id); } catch (error) { receiptWarning = error instanceof Error ? error.message : 'Receipt email could not be sent.'; }
  res.json({ order: getOrder(order.id), receiptWarning });
});

app.post('/api/admin/digest', authenticate, authorize('ADMIN'), async (_req, res) => {
  try {
    await sendDailyDigest();
    res.json({ message: 'Daily digest sent.' });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Digest could not be sent.' });
  }
});

cron.schedule(process.env.DIGEST_CRON || '0 18 * * *', () => {
  sendDailyDigest().catch(error => console.error('Daily digest failed:', error));
});

if (isProduction) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(root));
  app.get('*splat', (_req, res) => res.sendFile(path.join(root, 'index.html')));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Rasoi API ready at http://localhost:${port}`);
});
