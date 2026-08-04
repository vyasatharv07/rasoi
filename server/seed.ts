import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, initializeDatabase } from './db.js';

initializeDatabase();

const users = [
  { name: 'Asha Patel', email: 'client@rasoi.test', password: 'Client123!', role: 'CLIENT' },
  { name: 'Mira Shah', email: 'admin@rasoi.test', password: 'Admin123!', role: 'ADMIN' },
] as const;

for (const user of users) {
  const hash = await bcrypt.hash(user.password, 12);
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, role=excluded.role`)
    .run(user.name, user.email, hash, user.role);
}

const menu = [
  ['Saffron Paneer Bowl', 'Charred paneer, fragrant basmati, pickled onion, mint chutney.', 1595, 'Bowls', 'COUNT'],
  ['Tandoori Chicken Bowl', 'Smoky chicken, cumin rice, cucumber, tamarind glaze.', 1695, 'Bowls', 'COUNT'],
  ['Chana Masala', 'Slow-cooked chickpeas, tomato, ginger, warm spices.', 895, 'Curries', 'PORTION'],
  ['Butter Chicken', 'Charred chicken in a silky tomato and fenugreek sauce.', 1095, 'Curries', 'PORTION'],
  ['Dal Makhani', 'Black lentils simmered overnight with tomato and cream.', 895, 'Curries', 'PORTION'],
  ['Garlic Naan', 'Tandoor-baked flatbread, cultured butter, garlic.', 450, 'Sides', 'COUNT'],
  ['Samosa Chaat', 'Crisp samosa, chickpeas, yogurt, tamarind, herbs.', 895, 'Small plates', 'COUNT'],
  ['Roasted Cauliflower', 'Turmeric, chile, toasted cumin, lime.', 750, 'Sides', 'COUNT'],
  ['Mango Lassi', 'Alphonso mango, yogurt, cardamom.', 595, 'Drinks', 'COUNT'],
  ['Masala Chai', 'Assam tea, ginger, cardamom, clove.', 425, 'Drinks', 'COUNT'],
];

if ((db.prepare('SELECT COUNT(*) AS count FROM menu_items').get() as { count: number }).count === 0) {
  const insert = db.prepare('INSERT INTO menu_items (name, description, price_cents, category, quantity_mode) VALUES (?, ?, ?, ?, ?)');
  const seedMenu = db.transaction(() => menu.forEach(item => insert.run(...item)));
  seedMenu();
}

// Keep the temporary sample menu useful until the final menu is supplied.
const portionPrices: Record<string, [number, number, number]> = {
  'Chana Masala': [895, 1595, 2895],
  'Butter Chicken': [1095, 1995, 3695],
  'Dal Makhani': [895, 1595, 2895],
};
const insertOption = db.prepare('INSERT OR IGNORE INTO menu_item_options (menu_item_id, label, price_cents, sort_order) VALUES (?, ?, ?, ?)');
for (const [name, prices] of Object.entries(portionPrices)) {
  const item = db.prepare('SELECT id FROM menu_items WHERE name = ?').get(name) as { id: number } | undefined;
  if (!item) continue;
  db.prepare("UPDATE menu_items SET quantity_mode = 'PORTION', price_cents = ? WHERE id = ?").run(prices[0], item.id);
  ['8 oz', '16 oz', '32 oz'].forEach((label, index) => insertOption.run(item.id, label, prices[index], index));
}

console.log('Seed complete.');
console.log('Client: client@rasoi.test / Client123!');
console.log('Admin:  admin@rasoi.test / Admin123!');
