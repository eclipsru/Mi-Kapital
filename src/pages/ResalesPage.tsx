import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCheck, ImageOff, Mic, Package, Search, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { formatDate, formatDuration, fundingLabels, inventoryProducts, money, monthKey, monthLabel, productCost, productStatus, productStatusLabels, products, purchasePriceLabel, resaleInventoryValue, resaleNetProfit, saleBreakdown, soldProducts, statusDurations, sum, today, type AppData, type ResaleProduct } from '../core/model';
import { AddButton, Badge, Button, Empty, PageHead, SectionHead } from '../components/ui';
import type { ProductRequest } from '../components/ProductModal';

type StockTab = 'all' | 'stock' | 'preparing' | 'listed' | 'sold';
const tabLabels: Record<StockTab, string> = { all: 'Все товары', stock: 'В наличии', preparing: 'На подготовке', listed: 'На продажи', sold: 'Продано' };
export function ResalesPage({ data, onEdit, onBack }: { data: AppData; onEdit: (request: ProductRequest) => void; onBack: () => void }) {
  const [tab, setTab] = useState<StockTab>('all');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(monthKey(today()));
  const all = products(data);
  const stock = inventoryProducts(data);
  const sold = soldProducts(data);
  const periodSold = soldProducts(data, month);
  const months = Array.from(new Set([monthKey(today()), ...sold.map(p => monthKey(p.sale!.date))])).sort().reverse();
  const scoped = tab === 'all' ? all : tab === 'stock' ? stock : tab === 'sold' ? periodSold : stock.filter(p => productStatus(p) === tab);
  const filtered = useMemo(() => scoped.filter(p => !query || `${p.kind} ${p.description} ${p.investor?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.sale?.date ?? b.purchaseDate).localeCompare(a.sale?.date ?? a.purchaseDate) || b.createdAt.localeCompare(a.createdAt)), [scoped, query]);
  const switchTab = (next: StockTab) => { setTab(next); setQuery(''); };
  const add = () => onEdit({ type: 'product' });
  return <>
    <button className="text-link orange-link jobs-back" onClick={onBack}><ArrowLeft size={16}/>К доходам</button>
    <PageHead eyebrow="ДОХОДЫ · ПОКУПКА И ПРОДАЖА" title="Перепродажи" description="Товары, вложения и чистая прибыль после доли инвестора."/>
    <div className="jobs-summary resales-summary">
      <section className="panel jobs-summary-card"><span className="metric-icon orange"><Package size={22}/></span><div><span className="metric-label">Вложено в непроданные товары</span><strong>{money(resaleInventoryValue(data))}</strong><small>{stock.length} товаров · включая деньги инвестора</small></div></section>
      <section className="panel jobs-summary-card"><span className="metric-icon green"><CheckCheck size={22}/></span><div><span className="metric-label">Продажи {month ? `за ${monthLabel(month)}` : 'за всё время'}</span><strong>{money(sum(periodSold.map(p => p.sale!.priceKopecks)))}</strong><small>{periodSold.length} продаж · выручка, не прибыль</small></div></section>
      <section className="panel jobs-summary-card"><span className="metric-icon green"><TrendingUp size={22}/></span><div><span className="metric-label">Общий доход</span><strong>{money(resaleNetProfit(data, month))}</strong><small>Чистая прибыль после доли инвестора</small></div></section>
    </div>
    <div className="resales-add"><AddButton onClick={add}>Добавить товар</AddButton><span>Фото, покупка из капитала и «Из кармана», описание и инвестор</span></div>
    <div className="tabs jobs-tabs resales-tabs" role="tablist" aria-label="Состояние товаров">{(Object.keys(tabLabels) as StockTab[]).map(key => <button key={key} role="tab" id={`resales-tab-${key}`} aria-selected={tab === key} aria-controls="resales-panel" className={tab === key ? 'active' : ''} onClick={() => switchTab(key)}>{tabLabels[key]}</button>)}</div>
    <section className="panel resales-panel" id="resales-panel" role="tabpanel" aria-labelledby={`resales-tab-${tab}`}>
      <div className="filters"><div className="search-field"><Search size={17}/><input aria-label="Поиск товаров" placeholder="Вид товара, описание или инвестор…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15}/></button>}</div>{tab === 'sold' && <div className="month-select"><CalendarDays size={16}/><select className="inp" aria-label="Месяц продаж" value={month} onChange={e => setMonth(e.target.value)}><option value="">За всё время</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>}</div>
      <SectionHead title={tabLabels[tab]} count={filtered.length}/>
      {filtered.length ? <div className="product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onEdit={onEdit}/>)}</div> : <Empty icon={Package} title={query ? 'Ничего не найдено' : tab === 'sold' ? 'Пока нет продаж' : 'Пока нет товаров'} text={query ? 'Попробуйте другой запрос или месяц.' : tab === 'sold' ? 'Нажмите «Продать» в карточке товара. Прибыль и возврат покупки рассчитаются автоматически.' : 'Добавьте первый товар: фото, цену покупки и источники денег.'} action={tab !== 'sold' && <Button onClick={add}>Добавить товар</Button>}/>}
    </section>
    <div className="info-banner resales-rule"><Wallet size={20}/><p><strong>Как двигаются деньги.</strong> Часть «Капитал» уменьшает остаток счёта, а «Из кармана» входит в цену покупки и активы без списания со счетов. После продажи на выбранный счёт возвращается цена покупки + 15% чистой прибыли (после доли инвестора); убыток уменьшает остаток на всю сумму потери. Остальные доли прибыли — 70% на руки и 15% на долги — показываются на карточках ролей.</p></div>
  </>;
}
function ProductCard({ product, onEdit }: { product: ResaleProduct; onEdit: (request: ProductRequest) => void }) {
  const result = saleBreakdown(product);
  const status = productStatus(product);
  const durations = statusDurations(product);
  return <article className={`product-card compact status-${status}`}>
    <div className="product-card-image">{product.photos[0] ? <img src={product.photos[0]} alt={product.kind}/> : <div className="product-no-photo"><ImageOff size={22}/><span>Без фото</span></div>}<Badge tone={status === 'sold' ? 'green' : status === 'listed' ? 'orange' : 'neutral'}>{productStatusLabels[status]}</Badge></div>
    <div className="product-card-body">
      <button className="text-link product-title" onClick={() => onEdit({ type: 'product', item: product })}>{product.kind}<ArrowUpRight size={14}/></button>
      <div className="product-cost"><span>Цена покупки</span><strong>{purchasePriceLabel(productCost(product))}</strong></div>
      <div className="product-meta"><span><CalendarDays size={12}/>{formatDate(product.purchaseDate)}</span>{product.voice && <span><Mic size={12}/></span>}{product.photos.length > 0 && <span>{product.photos.length} фото</span>}</div>
      <div className="product-status-times" aria-label="Время в состояниях">
        <span>Подготовка: {formatDuration(durations.preparingMs)}</span>
        {(durations.listedMs > 0 || status === 'listed') && <span>Продажа: {formatDuration(durations.listedMs)}</span>}
        {status === 'sold' && <span>Продан: {formatDuration(durations.soldMs)}</span>}
      </div>
      <div className="product-funding-tags">{product.funding.length ? product.funding.map(f => <span key={f.source}>{fundingLabels[f.source]} · {money(f.amountKopecks)}</span>) : <span>Без вложений</span>}</div>
      {product.investor && <div className="product-investor"><Users size={13}/><span>{product.investor.name} · {product.investor.percentBasisPoints / 100}%</span></div>}
      {product.sale ? <div className="product-sale-result"><div><span>Продан {formatDate(product.sale.date)}</span><strong>{money(product.sale.priceKopecks)}</strong></div><div><span>Чистая прибыль</span><strong className={result.personalProfit >= 0 ? 'text-green' : 'text-red'}>{money(result.personalProfit)}</strong></div></div> : product.description ? <p className="product-description">{product.description}</p> : null}
      <div className="product-card-actions"><Button variant="secondary" className="btn-small" onClick={() => onEdit({ type: 'product', item: product })}>Вложения</Button><Button className="btn-small" onClick={() => onEdit({ type: 'product-sale', item: product })}>{product.sale ? 'Изменить продажу' : 'Продать'}</Button></div>
    </div>
  </article>;
}
