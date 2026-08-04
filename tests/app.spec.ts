import { expect, request as playwrightRequest, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('client can sign in, browse menu, and add an item', async ({ page }) => {
  await page.getByRole('button', { name: 'Client' }).click();
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText('Saffron Paneer Bowl')).toBeVisible();
  await page.getByRole('button', { name: 'Add Saffron Paneer Bowl' }).click();
  await page.getByRole('button', { name: 'Open cart' }).click();
  await expect(page.getByRole('dialog')).toContainText('Saffron Paneer Bowl');
  await expect(page.getByRole('button', { name: /Place order/ })).toBeEnabled();
});

test('client can open profile and edit food preferences', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Client' }).click();
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  if (testInfo.project.name === 'chromium') await page.getByRole('button', { name: 'Open my profile' }).click();
  else await page.getByRole('button', { name: /Profile/ }).click();
  await expect(page.getByRole('heading', { name: 'Profile & settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Jain' }).click();
  await page.getByRole('button', { name: /Save changes/ }).click();
  await expect(page.getByText('Profile and food preferences saved.')).toBeVisible();
});

test('admin can sign in and see operational dashboard', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon)/ })).toBeVisible();
  await expect(page.getByText('Today’s orders')).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('button', { name: /Menu/ }).click();
  await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add item/ })).toBeVisible();
});

test('role protection returns forbidden', async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { email: 'client@rasoi.test', password: 'Client123!' } });
  expect(login.ok()).toBeTruthy();
  const response = await request.post('/api/admin/menu', { data: { name: 'Nope', description: '', price: 1, category: 'Test', isAvailable: true } });
  expect(response.status()).toBe(403);
});

test('next-day order can be scheduled and confirmed picked up', async ({}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chrome', 'API lifecycle only needs one browser project');
  const client = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const admin = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:5173' });
  await client.post('/api/auth/login', { data: { email: 'client@rasoi.test', password: 'Client123!' } });
  const menuResponse = await client.get('/api/menu');
  const menu = (await menuResponse.json()).menu;
  const portionItem = menu.find((item: { quantity_mode: string }) => item.quantity_mode === 'PORTION');
  expect(portionItem.options.map((option: { label: string }) => option.label)).toEqual(['8 oz', '16 oz', '32 oz']);
  const placed = await client.post('/api/orders', { data: { notes: 'Playwright lifecycle order', items: [{ menuItemId: portionItem.id, optionId: portionItem.options[1].id, quantity: 1 }] } });
  expect(placed.status()).toBe(201);
  const order = (await placed.json()).order;
  expect(order.pickup_assigned).toBe(0);
  expect(order.items[0].variant_label).toBe('16 oz');

  await admin.post('/api/auth/login', { data: { email: 'admin@rasoi.test', password: 'Admin123!' } });
  const scheduled = await admin.patch(`/api/admin/orders/${order.id}/pickup`, { data: { pickupTime: new Date(`${order.requested_date}T13:00:00`).toISOString() } });
  expect(scheduled.ok()).toBeTruthy();
  await admin.patch(`/api/admin/orders/${order.id}/status`, { data: { status: 'READY' } });
  const confirmed = await client.post(`/api/orders/${order.id}/confirm-pickup`);
  expect(confirmed.ok()).toBeTruthy();
  expect((await confirmed.json()).order.status).toBe('PICKED_UP');
  const receipt = await client.get(`/api/receipts/${order.id}`);
  expect(receipt.ok()).toBeTruthy();
  expect(await receipt.text()).toContain('16 oz');
  await client.dispose(); await admin.dispose();
});
