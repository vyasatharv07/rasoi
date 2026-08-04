import nodemailer from 'nodemailer';
import { db, getOrder } from './db.js';

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
}

async function sendMail(options: { to: string; subject: string; html: string }) {
  if (!process.env.SMTP_HOST) {
    console.info(`[mail preview] ${options.subject} -> ${options.to}`);
    return { preview: true };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter.sendMail({ from: process.env.MAIL_FROM || 'Rasoi Kitchen <orders@example.com>', ...options });
}

export function renderReceipt(order: NonNullable<ReturnType<typeof getOrder>>) {
  const items = order.items as Array<{ item_name: string; variant_label: string; quantity: number; price_at_order_cents: number }>;
  const rows = items.map(item => `<tr><td>${escape(item.item_name)} <span style="color:#777">· ${escape(item.variant_label)} × ${item.quantity}</span></td><td style="text-align:right">${money(item.price_at_order_cents * item.quantity)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Receipt #${order.id}</title></head>
  <body style="margin:0;background:#f4f2ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#232620">
  <main style="max-width:600px;margin:40px auto;background:white;border-radius:20px;padding:40px;box-shadow:0 12px 40px rgba(35,38,32,.08)">
    <div style="color:#c65a35;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:12px">Rasoi Kitchen</div>
    <h1 style="font-size:32px;margin:14px 0 4px">Thank you, ${escape(order.client_name)}.</h1>
    <p style="color:#74776f;margin:0 0 32px">Receipt for order #${order.id} · ${new Date().toLocaleString()}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px"><tbody>${rows}
      <tr><td style="padding-top:20px;border-top:1px solid #e8e6e0">Subtotal</td><td style="padding-top:20px;border-top:1px solid #e8e6e0;text-align:right">${money(Number(order.subtotal_cents))}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">${money(Number(order.tax_cents))}</td></tr>
      <tr style="font-weight:700;font-size:18px"><td style="padding-top:10px">Total</td><td style="padding-top:10px;text-align:right">${money(Number(order.total_cents))}</td></tr>
    </tbody></table>
    <p style="margin-top:36px;padding-top:20px;border-top:1px solid #e8e6e0;color:#74776f;font-size:13px">Picked up from Rasoi Kitchen · Made with care.</p>
  </main></body></html>`;
}

export async function createAndSendReceipt(orderId: number) {
  const order = getOrder(orderId);
  if (!order) throw new Error('Order not found');
  let receipt = db.prepare('SELECT * FROM receipts WHERE order_id = ?').get(orderId) as { id: number; html_snapshot: string } | undefined;
  const html = receipt?.html_snapshot || renderReceipt(order);
  if (!receipt) {
    const result = db.prepare('INSERT INTO receipts (order_id, html_snapshot) VALUES (?, ?)').run(orderId, html);
    receipt = { id: Number(result.lastInsertRowid), html_snapshot: html };
  }
  await sendMail({ to: String(order.client_email), subject: `Your Rasoi receipt — order #${orderId}`, html });
  db.prepare('UPDATE receipts SET sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(receipt.id);
  return receipt;
}

export async function sendDailyDigest() {
  const orders = db.prepare(`
    SELECT o.id, o.status, o.pickup_time, o.pickup_assigned, o.requested_date, o.notes, u.name AS client_name,
      i.total_cents
    FROM orders o JOIN users u ON u.id = o.client_id JOIN invoices i ON i.order_id = o.id
    WHERE date(o.created_at, 'localtime') = date('now', 'localtime')
    ORDER BY o.pickup_time
  `).all() as Array<Record<string, unknown>>;
  const rows = orders.length ? orders.map(o => `<tr><td style="padding:10px;border-bottom:1px solid #eee">#${o.id}</td><td style="padding:10px;border-bottom:1px solid #eee">${escape(o.client_name)}</td><td style="padding:10px;border-bottom:1px solid #eee">${o.pickup_assigned ? new Date(String(o.pickup_time)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : `Awaiting assignment (${escape(o.requested_date)})`}</td><td style="padding:10px;border-bottom:1px solid #eee">${escape(o.notes || '—')}</td><td style="padding:10px;border-bottom:1px solid #eee">${money(Number(o.total_cents))}</td></tr>`).join('') : '<tr><td colspan="5" style="padding:20px">No orders today.</td></tr>';
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#252721"><h1>Today at Rasoi</h1><p>${orders.length} order${orders.length === 1 ? '' : 's'} received.</p><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;background:#f6f4ef"><th style="padding:10px">Order</th><th>Client</th><th>Pickup</th><th>Notes</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return sendMail({ to: process.env.ADMIN_DIGEST_EMAIL || 'admin@example.com', subject: `Rasoi daily orders — ${new Date().toLocaleDateString()}`, html });
}
