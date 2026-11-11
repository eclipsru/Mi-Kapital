import fs from 'node:fs';
import path from 'node:path';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { inflate } from '@sparticuz/chromium';
import { fileURLToPath } from 'node:url';

if (process.platform === 'linux' && !process.env.AWS_EXECUTION_ENV) {
  await inflate(path.join(path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '../bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH = '/tmp/al2023/lib' + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  process.env.FONTCONFIG_PATH = '/tmp/fonts';
}
const out = path.resolve('artifacts/screenshots');
fs.mkdirSync(out, { recursive: true });
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { window.__MI_KAPITAL_TEST__ = true; });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.APP_URL || 'http://127.0.0.1:5173';
const shot = async name => { await page.waitForTimeout(250); return page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); };
async function navigate(hash, heading) {
  await page.evaluate(value => { window.location.hash = value; }, hash);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await page.waitForTimeout(200);
}
async function assertLayout(label) {
  await page.waitForTimeout(250);
  const problem = await page.evaluate(() => {
    const directions = document.querySelector('.income-directions');
    if (directions && getComputedStyle(directions).display !== 'grid') return 'income direction cards lost their base layout';
    const resaleGrid = document.querySelector('.product-grid');
    if (resaleGrid && getComputedStyle(resaleGrid).display !== 'grid') return 'resale grid lost its base layout';
    if (resaleGrid && window.innerWidth >= 1200 && getComputedStyle(resaleGrid).gridTemplateColumns.split(' ').length !== 3) return 'resale grid is not three cards per row on desktop';
    const roleGrid = document.querySelector('.role-accounts-grid');
    if (roleGrid && getComputedStyle(roleGrid).display !== 'grid') return 'role account grid lost its base layout';
    const debtList = document.querySelector('.debts-list');
    if (debtList && getComputedStyle(debtList).display === 'grid') return 'debts should be a list, not a card grid';
    const summary = document.querySelector('.jobs-summary');
    if (summary && getComputedStyle(summary).display !== 'grid') return 'odd-job summary lost its base layout';
    return document.documentElement.scrollWidth > window.innerWidth || [...document.querySelectorAll('.income-direction')].some(el => el.scrollWidth > el.clientWidth + 1) ? 'horizontal overflow' : '';
  });
  if (problem) throw new Error(`${problem}: ${label}`);
}
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Мой капитал', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await shot('01-capital-empty');
  // Deterministic fixture only in this isolated browser, never in user data or production source.
  const month = Object.fromEntries(Array.from({ length: 6 }, (_, offset) => {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 5);
    return [offset, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-05`];
  }));
  await page.evaluate(({ month }) => {
    const income = (id, title, category, amountKopecks, offset, accountId) => ({ id, title, category, amountKopecks, date: month[offset], accountId, note: '' });
    localStorage.setItem('mi-kapital.v2.local', JSON.stringify({
      schemaVersion: 1,
      accounts: [
        { id: 'a1', name: 'Основная карта', kind: 'bank', openingKopecks: 8500000, createdAt: new Date().toISOString(), role: 'capital' },
        { id: 'a2', name: 'Наличные', kind: 'cash', openingKopecks: 1850000, createdAt: new Date().toISOString(), role: 'hand' },
        { id: 'a3', name: 'Накопления', kind: 'investment', openingKopecks: 16000000, createdAt: new Date().toISOString(), role: 'debt' },
      ],
      incomes: [
        income('r1', 'Продажа инструмента', 'Перепродажи', 8500000, 0, 'a1'),
        income('r2', 'Продажа комплектующих', 'Перепродажи', 1250000, 0, 'a2'),
        { ...income('j1', 'Ремонт автомобиля', 'Шабашки', 2400000, 0, 'a2'), costKopecks: 350000, work: { kind: 'Ремонт', values: { object: 'Автомобиль', scope: 'Диагностика и замена масла' } } },
        { ...income('j2', 'Сборка мебели', 'Шабашки', 950000, 0, 'a2'), costKopecks: 120000, work: { kind: 'Сборка мебели', values: { object: 'Шкаф', quantity: '1' } } },
        income('r3', 'Продажа велосипеда', 'Перепродажи', 8000000, 1, 'a1'),
        income('j3', 'Работа на выходных', 'Шабашки', 1800000, 2, 'a2'),
        income('r4', 'Продажа монитора', 'Перепродажи', 7800000, 3, 'a1'),
        income('legacy', 'Подарок на день рождения', 'Подарок', 3200000, 4, 'a2'),
      ],
      products: [
        { id: 'g1', kind: 'Телефон', purchaseDate: month[0], funding: [{ source: 'capital', accountId: 'a1', amountKopecks: 1800000 }], description: 'Проверен, полный комплект. Куплен для перепродажи.', photos: [], investor: { name: 'Алексей', amountKopecks: 500000, percentBasisPoints: 2000, terms: '20% от прибыли' }, createdAt: `${month[0]}T09:00:00.000Z`, status: 'preparing', preparingStartedAt: `${month[0]}T09:00:00.000Z` },
        { id: 'g2', kind: 'Ноутбук', purchaseDate: month[1], funding: [{ source: 'capital', accountId: 'a1', amountKopecks: 2500000 }], description: 'После диагностики, готов к продаже.', photos: [], createdAt: `${month[1]}T09:00:00.000Z`, status: 'listed', preparingStartedAt: `${month[1]}T09:00:00.000Z`, listedAt: `${month[1]}T12:00:00.000Z`, statusChangedAt: `${month[1]}T12:00:00.000Z` },
        { id: 'g3', kind: 'Комплектующие', purchaseDate: month[1], funding: [{ source: 'capital', accountId: 'a1', amountKopecks: 800000 }], description: 'Продано комплектом.', photos: [], investor: { name: 'Михаил', amountKopecks: 0, percentBasisPoints: 1000, terms: '10% прибыли' }, sale: { priceKopecks: 1200000, date: month[0], accountId: 'a1' }, createdAt: `${month[1]}T09:00:00.000Z`, preparingStartedAt: `${month[1]}T09:00:00.000Z` },
      ],
      people: [
        { id: 'person-alexey', name: 'Алексей', createdAt: new Date().toISOString() },
        { id: 'person-mikhail', name: 'Михаил', createdAt: new Date().toISOString() },
        { id: 'person-alexandr', name: 'Александр', createdAt: new Date().toISOString() },
      ],
      workPlans: [
        { id: 'wp1', kind: 'Электрика', title: 'Щиток в гараже', date: month[0], expectedKopecks: 1500000, note: 'Купить автомат заранее', createdAt: new Date().toISOString() },
        { id: 'wp2', kind: 'Отделка', title: 'Покрасить коридор', date: '', expectedKopecks: 900000, note: '', createdAt: new Date().toISOString() },
      ],
      debts: [
        { id: 'd1', title: 'Ремонт мастерской', counterparty: 'Александр', direction: 'i_owe', principalKopecks: 6000000, date: month[2], dueDate: '', note: 'Беспроцентный заём', initialAccountId: null, payments: [{ id: 'p1', amountKopecks: 1500000, date: month[0], accountId: 'a1', note: '' }] },
        { id: 'd2', title: 'Займ на инструмент', counterparty: 'Михаил', direction: 'owed_to_me', principalKopecks: 3000000, date: month[1], dueDate: '', note: '', initialAccountId: null, payments: [] },
      ],
      movements: [
        { id: 'm1', kind: 'expense', title: 'Продукты и дом', amountKopecks: 1800000, date: month[0], accountId: 'a1', note: '' },
        { id: 'm2', kind: 'expense', title: 'Материалы для работы', amountKopecks: 950000, date: month[1], accountId: 'a1', note: '' },
        { id: 'm3', kind: 'expense', title: 'Поездка и топливо', amountKopecks: 650000, date: month[2], accountId: 'a1', note: '' },
      ],
      plan: { income: 9500000, expenses: 3500000, debtPayment: 1500000, months: 12, goal: 100000000 },
      updatedAt: new Date().toISOString(),
    }));
  }, { month });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await shot('02-capital');
  await navigate('income', 'Доходы');
  await page.getByRole('button', { name: /^Перепродажи/ }).waitFor();
  await shot('03-income');
  await page.getByRole('button', { name: /^Перепродажи/ }).click();
  await page.getByRole('heading', { name: 'Перепродажи', exact: true }).waitFor();
  await page.waitForTimeout(220); await shot('03-resales');
  await page.getByRole('tab', { name: 'Продано', exact: true }).click(); await page.waitForTimeout(220); await shot('03-resales-sold');
  await page.getByRole('tab', { name: 'В наличии', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить товар', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[aria-label="Добавить фото"]').setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: png });
  await page.locator('.product-photo-preview img').waitFor();
  await page.getByRole('button', { name: 'Записать голосом', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить запись', exact: true }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Остановить запись', exact: true }).click();
  await page.locator('.voice-field audio').waitFor();
  await shot('09-product-form');
  await page.getByLabel('Вид товара', { exact: true }).fill('Тестовый товар');
  await page.getByLabel('Сумма из капитала, ₽', { exact: true }).fill('999999');
  await page.locator('.modal button[type="submit"]').click();
  if (!(await page.getByRole('alert').textContent())?.includes('не больше')) throw new Error('Capital funding cap missing');
  await shot('09-capital-funding-cap');
  await page.getByLabel('Вид товара', { exact: true }).fill('Тестовый товар');
  await page.getByLabel('Сумма из капитала, ₽', { exact: true }).fill('100');
  await page.getByLabel('Из кармана', { exact: true }).check();
  await page.getByLabel('Сумма из кармана, ₽', { exact: true }).fill('50');
  const purchaseTotal = await page.locator('.purchase-total strong').textContent();
  if (!purchaseTotal?.includes('150')) throw new Error('Pocket funding must increase purchase price');
  await page.getByRole('button', { name: 'Добавить товар', exact: true }).last().click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const mediaSaved = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mi-kapital.v2.local')).products.at(-1); return p.kind === 'Тестовый товар' && p.photos.length === 1 && p.voice.dataUrl.startsWith('data:audio/webm;base64,') && p.funding.some(f => f.source === 'pocket' && f.amountKopecks === 5000 && f.accountId === ''); });
  if (!mediaSaved) throw new Error('Product photo/voice did not persist through the real form');

  await page.getByRole('button', { name: 'Продать', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Цена продажи, ₽').fill('25000');
  await shot('09-sale-form');
  await shot('09-product-voice');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'К доходам', exact: true }).click();
  await page.getByRole('heading', { name: 'Доходы', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Шабашки/ }).click();
  await page.getByRole('heading', { name: 'Шабашки', exact: true }).waitFor();
  await page.waitForTimeout(220);
  await shot('03-odd-jobs');
  await page.getByRole('tab', { name: 'Запланировать', exact: true }).click();
  await page.waitForTimeout(220);
  await shot('03-odd-jobs-plan');
  await page.getByRole('button', { name: 'Запланировать работу', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('09-odd-job-plan-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('tab', { name: 'Выполнено', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить выполненную', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('09-odd-job-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'К доходам', exact: true }).click();
  await page.getByRole('heading', { name: 'Доходы', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Показать всю историю', exact: true }).click();
  await page.getByLabel('Месяц доходов', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Подарок на день рождения', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('08-income-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуться к доходам', exact: true }).click();
  await navigate('debts', 'Долги'); await shot('04-debts');
  await page.locator('.debt-repay-total').click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Сумма, ₽', { exact: true }).fill('300');
  await page.getByLabel('Списать со счёта Накопления', { exact: true }).uncheck();
  await page.getByLabel('Списать со счёта Основная карта', { exact: true }).check();
  await page.getByLabel('Списать со счёта Наличные', { exact: true }).check();
  await page.getByLabel('Сумма со счёта Основная карта', { exact: true }).fill('100');
  await page.getByLabel('Сумма со счёта Наличные', { exact: true }).fill('200');
  await shot('04-debts-repay');
  if (!(await page.getByRole('button', { name: 'Записать голосом', exact: true }).count())) throw new Error('Repayment voice missing');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить человека', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await shot('04-person-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить долг', exact: true }).first().click();
  await page.getByRole('dialog').waitFor(); await shot('04-debt-form');
  await page.getByLabel('Вид долга', { exact: true }).selectOption('consumer');
  await page.getByLabel('Кому вы должны', { exact: true }).selectOption('Алексей');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await navigate('calculation', 'Расчёт'); await shot('05-calculation');
  await page.getByRole('button', { name: 'Данные и настройки', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await shot('06-sync-settings');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Скачать Android-приложение по QR-коду', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await shot('06-android-qr');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Обновления приложения', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await shot('06-updates');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await navigate('capital', 'Мой капитал');
  await page.getByRole('button', { name: 'Добавить счёт', exact: true }).first().click();
  await page.getByRole('dialog').waitFor(); await shot('07-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate('capital', 'Мой капитал'); await assertLayout(`capital ${width}px`); await shot(`capital-${width}`);
    await navigate('income', 'Доходы'); await assertLayout(`income ${width}px`); await shot(`income-${width}`);
    await navigate('resales', 'Перепродажи'); await assertLayout(`resales ${width}px`); await shot(`resales-${width}`);
    await navigate('income', 'Доходы');
    await page.getByRole('button', { name: /^Шабашки/ }).click(); await page.getByRole('heading', { name: 'Шабашки', exact: true }).waitFor(); await page.waitForTimeout(220); await assertLayout(`odd jobs ${width}px`); await shot(`odd-jobs-${width}`);
    await page.getByRole('tab', { name: 'Запланировать', exact: true }).click(); await page.waitForTimeout(220); await assertLayout(`odd jobs plan ${width}px`); await shot(`odd-jobs-plan-${width}`);
    await navigate('income', 'Доходы');
    await page.getByRole('button', { name: 'Показать всю историю', exact: true }).click(); await page.waitForTimeout(220); await assertLayout(`legacy history ${width}px`); await shot(`income-history-${width}`);
    await page.getByRole('button', { name: 'Вернуться к доходам', exact: true }).click();
    await navigate('debts', 'Долги'); await assertLayout(`debts ${width}px`); await shot(`debts-${width}`);
    await page.getByRole('button', { name: 'Добавить долг', exact: true }).first().click(); await page.getByRole('dialog').waitFor(); await assertLayout(`debt form ${width}px`); await shot(`debt-form-${width}`); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  phone.on('pageerror', error => errors.push(error.message));
  await phone.addInitScript(() => {
    window.__MI_KAPITAL_TEST__ = true;
    window.desktop = { platform: 'android', info: async () => ({ version: '2.0.37', shellVersion: '2', phase: 'idle', mode: 'files', percent: 0, transferred: 0, total: 0, packaged: true }), checkUpdates: async () => {}, installUpdate: async () => ({ ok: true }), openReleases: async () => {}, onUpdate: () => () => {}, loadData: async () => JSON.parse(localStorage.getItem('mi-kapital.v2.local') || 'null'), saveData: async data => localStorage.setItem('mi-kapital.v2.local', JSON.stringify(data)), exportBackup: async () => true, bootReady: () => {}, syncConfig: async () => ({ lanEnabled: true, lanPort: 47653, lanToken: '', lanUrl: '', cloudEnabled: false, supabaseUrl: '', supabaseKey: '', email: '' }), saveSyncConfig: async () => {}, syncInfo: async () => null, scanPairing: async () => {} };
  });
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.evaluate(() => document.fonts.ready);
  const bottom = phone.getByRole('navigation', { name: 'Разделы приложения снизу' });
  if (await bottom.locator('button').count() !== 4) throw new Error('Android bottom navigation must contain four sections');
  for (const [label, heading] of [['Капитал', 'Мой капитал'], ['Доходы', 'Доходы'], ['Долги', 'Долги'], ['Расчёт', 'Расчёт']]) {
    await bottom.getByRole('button', { name: label, exact: true }).click();
    await phone.getByRole('heading', { name: heading, exact: true }).waitFor();
    await phone.waitForTimeout(250);
    const layout = await phone.evaluate(() => { const nav = document.querySelector('.bottom-nav'); const rect = nav.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth, fixed: getComputedStyle(nav).position === 'fixed', bottom: Math.abs(rect.bottom - innerHeight) < 1, height: rect.height, mainSize: Number.parseFloat(getComputedStyle(document.querySelector('.main-content')).paddingTop) }; });
    if (layout.overflow || !layout.fixed || !layout.bottom || layout.height > 70 || layout.mainSize > 20) throw new Error(`Android compact layout failed: ${JSON.stringify(layout)}`);
    await phone.screenshot({ path: path.join(out, `android-${label}.png`), fullPage: true });
  }
  await bottom.getByRole('button', { name: 'Капитал', exact: true }).click();
  await phone.getByRole('heading', { name: 'Мой капитал', exact: true }).waitFor();
  const debtPosition = await phone.evaluate(() => { const card = document.querySelector('.role-hand'); return card.querySelector('.borrowed-on-hand').compareDocumentPosition(card.querySelector('strong')) & Node.DOCUMENT_POSITION_FOLLOWING; });
  if (!debtPosition) throw new Error('Borrowed amount must be below the hand label and above its big amount');
  await phone.close();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Visual checks passed: capital role cards, net-profit income, resale statuses/compact cards/media forms, odd-jobs stats/plans, debt list/people/repayment, legacy history, update dialog, 1440/1280/1024/768/390 px. Android four-section fixed bottom menu/compact pages; no browser errors or horizontal overflow.');
} finally {
  await browser.close();
}
