import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCheck, ImageOff, Package, Search, TrendingUp, Wallet, X, CalendarDays } from 'lucide-react';
import { formatDate, formatDuration, fundingLabels, inventoryProducts, money, monthKey, monthLabel, productCost, productStatus, productStatusLabels, products, purchasePriceLabel, resaleInventoryValue, resaleNetProfit, saleBreakdown, soldProducts, statusDurations, sum, today, type AppData, type ResaleProduct } from '../core/model';
import { AddButton, Button, Empty, Modal, PageHead, SectionHead } from '../components/ui';
import type { ProductRequest } from '../components/ProductModal';

type StockTab = 'all' | 'stock' | 'preparing' | 'listed' | 'sold';
const tabLabels: Record<StockTab, string> = { all: 'Все товары', stock: 'В наличии', preparing: 'На подготовке', listed: 'На продажи', sold: 'Продано' };
export function ResalesPage({ data, onEdit, onBack }: { data: AppData; onEdit: (request: ProductRequest) => void; onBack: () => void }) {
  const [tab, setTab] = useState<StockTab>('all');
  const [selected, setSelected] = useState<ResaleProduct | null>(null);
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
      {filtered.length ? <div className="product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onOpen={() => setSelected(product)}/>)}</div> : <Empty icon={Package} title={query ? 'Ничего не найдено' : tab === 'sold' ? 'Пока нет продаж' : 'Пока нет товаров'} text={query ? 'Попробуйте другой запрос или месяц.' : tab === 'sold' ? 'Нажмите «Продать» в карточке товара. Прибыль и возврат покупки рассчитаются автоматически.' : 'Добавьте первый товар: фото, цену покупки и источники денег.'} action={tab !== 'sold' && <Button onClick={add}>Добавить товар</Button>}/>}
    </section>
    {selected && <ProductDetails data={data} product={selected} onClose={() => setSelected(null)} onEdit={request => { setSelected(null); onEdit(request); }}/>}
    <div className="info-banner resales-rule"><Wallet size={20}/><p><strong>Как двигаются деньги.</strong> Часть «Капитал» уменьшает остаток счёта, а «Из кармана» входит в цену покупки и активы без списания со счетов. После продажи на выбранный счёт возвращается цена покупки + 15% чистой прибыли (после доли инвестора); убыток уменьшает остаток на всю сумму потери. Остальные доли прибыли — 70% на руки и 15% на долги — показываются на карточках ролей.</p></div>
  </>;
}
function productPresentation(product: ResaleProduct) {
  const result = saleBreakdown(product);
  const status = productStatus(product);
  const tone = status === 'sold' ? result.personalProfit > 0 ? 'profit' : result.personalProfit < 0 ? 'loss' : 'break-even' : status;
  const label = status === 'sold' ? result.personalProfit > 0 ? 'Продан с прибылью' : result.personalProfit < 0 ? 'Продан с убытком' : 'Продан без прибыли' : productStatusLabels[status];
  return { result, status, tone, label };
}
function ProductCard({ product, onOpen }: { product: ResaleProduct; onOpen: () => void }) {
  const { result, status, tone, label } = productPresentation(product);
  return <article className={`product-card compact status-${status} product-tone-${tone}`}>
    <button className="product-card-open" onClick={onOpen} aria-label={`Открыть товар ${product.kind}`}>
      <div className="product-card-image">{product.photos[0] ? <img src={product.photos[0]} alt=""/> : <div className="product-no-photo"><ImageOff size={22}/><span>Без фото</span></div>}<span className="product-status-label">{label}</span></div>
      <div className="product-card-body"><strong className="product-title">{product.kind}</strong>
        <div className="product-cost"><span>Цена покупки</span><strong>{purchasePriceLabel(productCost(product))}</strong></div>
        {product.sale && <div className="product-sale-result"><div><span>Цена продажи</span><strong>{money(product.sale.priceKopecks)}</strong></div><div><span>{result.personalProfit < 0 ? 'Убыток' : 'Чистая прибыль'}</span><strong className={result.personalProfit >= 0 ? 'text-green' : 'text-red'}>{money(result.personalProfit)}</strong></div></div>}
      </div>
    </button>
  </article>;
}
function ProductDetails({ data, product, onClose, onEdit }: { data: AppData; product: ResaleProduct; onClose: () => void; onEdit: (request: ProductRequest) => void }) {
  const { result, status, label } = productPresentation(product);
  const durations = statusDurations(product);
  return <Modal title={product.kind} subtitle={label} onClose={onClose}>
    <div className="product-details">
      {product.photos.length > 0 && <div className="product-details-gallery">{product.photos.map((photo,index)=><img key={index} className="product-details-photo" src={photo} alt={`${product.kind} · фото ${index+1}`}/>)}</div>}
      <div className="product-details-lines"><div><span>Цена покупки</span><strong>{purchasePriceLabel(productCost(product))}</strong></div><div><span>Дата покупки</span><strong>{formatDate(product.purchaseDate)}</strong></div>
      {product.sale && <><div><span>Цена продажи</span><strong>{money(product.sale.priceKopecks)}</strong></div><div><span>Дата продажи</span><strong>{formatDate(product.sale.date)}</strong></div><div><span>Счёт продажи</span><strong>{data.accounts.find(a=>a.id===product.sale!.accountId)?.name ?? '—'}</strong></div><div><span>{result.personalProfit < 0 ? 'Убыток' : 'Чистая прибыль'}</span><strong className={result.personalProfit < 0 ? 'text-red' : 'text-green'}>{money(result.personalProfit)}</strong></div></>}
      <div><span>Подготовка</span><strong>{formatDuration(durations.preparingMs)}</strong></div>{(durations.listedMs > 0 || status === 'listed') && <div><span>На продаже</span><strong>{formatDuration(durations.listedMs)}</strong></div>}{status === 'sold' && <div><span>Продан</span><strong>{formatDuration(durations.soldMs)}</strong></div>}
      <div><span>Вложения</span><strong>{product.funding.length ? product.funding.map(f => `${fundingLabels[f.source]} · ${money(f.amountKopecks)}${f.accountId ? ` · ${data.accounts.find(a=>a.id===f.accountId)?.name ?? ''}` : ''}`).join(', ') : 'Без вложений'}</strong></div>{product.investor && <div><span>Инвестор</span><strong>{product.investor.name} · {product.investor.percentBasisPoints / 100}%</strong></div>}{product.investor?.terms && <div><span>Условия инвестора</span><strong>{product.investor.terms}</strong></div>}{product.description && <div><span>Описание</span><strong>{product.description}</strong></div>}</div>{product.voice && <div><span className="muted small">Голосовая заметка</span><audio controls src={product.voice.dataUrl} style={{width:'100%'}}/></div>}
      <div className="product-details-actions"><Button variant="secondary" onClick={() => onEdit({ type: 'product', item: product })}>Вложения и сведения</Button><Button onClick={() => onEdit({ type: 'product-sale', item: product })}>{product.sale ? 'Изменить продажу' : 'Продать'}</Button></div>
    </div>
  </Modal>;
}
