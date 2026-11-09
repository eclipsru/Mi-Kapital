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
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.APP_URL || 'http://127.0.0.1:5173';
const shot = name => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
async function navigate(hash, heading) {
  await page.evaluate(value => { window.location.hash = value; }, hash);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await page.waitForTimeout(200);
}
async function assertLayout(label) {
  const problem = await page.evaluate(() => {
    const directions = document.querySelector('.income-directions');
    if (directions && getComputedStyle(directions).display !== 'grid') return 'income direction cards lost their base layout';
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
        { id: 'a1', name: 'Основная карта', kind: 'bank', openingKopecks: 8500000, createdAt: new Date().toISOString() },
        { id: 'a2', name: 'Наличные', kind: 'cash', openingKopecks: 1850000, createdAt: new Date().toISOString() },
        { id: 'a3', name: 'Накопления', kind: 'investment', openingKopecks: 16000000, createdAt: new Date().toISOString() },
      ],
      incomes: [
        income('r1', 'Продажа инструмента', 'Перепродажи', 8500000, 0, 'a1'),
        income('r2', 'Продажа комплектующих', 'Перепродажи', 1250000, 0, 'a2'),
        income('j1', 'Ремонт автомобиля', 'Шабашки', 2400000, 0, 'a2'),
        income('j2', 'Сборка мебели', 'Шабашки', 950000, 0, 'a2'),
        income('r3', 'Продажа велосипеда', 'Перепродажи', 8000000, 1, 'a1'),
        income('j3', 'Работа на выходных', 'Шабашки', 1800000, 2, 'a2'),
        income('r4', 'Продажа монитора', 'Перепродажи', 7800000, 3, 'a1'),
        income('legacy', 'Подарок на день рождения', 'Подарок', 3200000, 4, 'a2'),
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
  await page.getByRole('tab', { name: /^Перепродажи/ }).waitFor();
  await shot('03-income');
  await page.getByRole('tab', { name: /^Шабашки/ }).click();
  await page.waitForTimeout(220);
  await shot('03-income-jobs');
  await page.getByRole('button', { name: 'Добавить доход', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('08-income-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await navigate('debts', 'Долги'); await shot('04-debts');
  await navigate('calculation', 'Расчёт'); await shot('05-calculation');
  await page.getByRole('button', { name: 'Обновления', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await shot('06-updates');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await navigate('capital', 'Мой капитал');
  await page.getByRole('button', { name: 'Добавить счёт', exact: true }).first().click();
  await page.getByRole('dialog').waitFor(); await shot('07-form');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate('capital', 'Мой капитал'); await assertLayout(`capital ${width}px`); await shot(`capital-${width}`);
    await navigate('income', 'Доходы'); await assertLayout(`resale ${width}px`); await shot(`income-${width}`);
    await page.getByRole('tab', { name: /^Шабашки/ }).click(); await page.waitForTimeout(220); await assertLayout(`odd jobs ${width}px`); await shot(`income-jobs-${width}`);
    await page.getByRole('button', { name: 'Показать всю историю', exact: true }).click(); await page.waitForTimeout(220); await assertLayout(`legacy history ${width}px`); await shot(`income-history-${width}`);
    await page.getByRole('button', { name: 'Вернуться к направлениям', exact: true }).click();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Visual checks passed: 4 sections, both income directions, legacy history, income/account forms, update dialog, 1440/1280/1024/768/390 px. No browser errors or horizontal overflow.');
} finally {
  await browser.close();
}
