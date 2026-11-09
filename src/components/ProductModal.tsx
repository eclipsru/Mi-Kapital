import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Check, ImagePlus, Info, PackagePlus, Trash2, X } from 'lucide-react';
import { capitalFundingAvailable, capitalRemainder, fundingLabels, inputMoney, liquidAccounts, MAX_PRODUCT_PHOTOS, money, parseMoney, parsePercent, people, productKinds, purchasePriceLabel, productStatusLabels, profitAllocation, roleAccount, saleBreakdown, today, uid, validDate, type AppData, type FundingSource, type Investor, type ProductFunding, type ProductStatus, type ResaleProduct, type VoiceNote } from '../core/model';
import { mediaError, photoAccept, preparePhoto } from '../core/media';
import { Button, Field, Modal } from './ui';
import { validateData } from '../core/storage';
import { VoiceField } from './VoiceField';

export type ProductRequest = { type: 'product'; item?: ResaleProduct } | { type: 'product-sale'; item: ResaleProduct };
type FundingDraft = { enabled: boolean; amount: string; accountId: string };
export function ProductModal({ request, data, onClose, onSave, onDelete }: { request: ProductRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void; onDelete: (data: AppData, message: string) => void }) {
  const item = request.item;
  const selling = request.type === 'product-sale';
  const accounts = liquidAccounts(data);
  const defaultAccount = accounts[0]?.id ?? '';
  const defaultForSource = (_source: FundingSource) => { const role = roleAccount(data, 'capital'); return role && accounts.some(a => a.id === role.id) ? role.id : defaultAccount; };
  const [kind, setKind] = useState(!selling ? request.item?.kind ?? '' : '');
  const [purchaseDate, setPurchaseDate] = useState(!selling ? request.item?.purchaseDate ?? today() : today());
  const [funding, setFunding] = useState<Record<FundingSource, FundingDraft>>(() => ({
    capital: { enabled: true, amount: inputMoney(item?.funding.find(f => f.source === 'capital')?.amountKopecks ?? 0), accountId: item?.funding.find(f => f.source === 'capital')?.accountId ?? defaultForSource('capital') },
    pocket: { enabled: !!item?.funding.some(f => f.source === 'pocket'), amount: inputMoney(item?.funding.find(f => f.source === 'pocket')?.amountKopecks ?? 0), accountId: '' },
  }));
  const [description, setDescription] = useState(!selling ? item?.description ?? '' : '');
  const [photos, setPhotos] = useState<string[]>(!selling ? item?.photos ?? [] : []);
  const [voice, setVoice] = useState<VoiceNote | undefined>(!selling ? item?.voice : undefined);
  const [status, setStatus] = useState<ProductStatus>(!selling && item?.sale ? item.status ?? 'preparing' : !selling ? item?.status ?? 'preparing' : 'preparing');
  const [hasInvestor, setHasInvestor] = useState(!!item?.investor);
  const [investorName, setInvestorName] = useState(item?.investor?.name ?? '');
  const [investorAmount, setInvestorAmount] = useState(item?.investor ? inputMoney(item.investor.amountKopecks) : '');
  const [investorPercent, setInvestorPercent] = useState(item?.investor ? String(item.investor.percentBasisPoints / 100).replace('.', ',') : '');
    const [salePrice, setSalePrice] = useState(item?.sale ? inputMoney(item.sale.priceKopecks) : '');
  const [saleDate, setSaleDate] = useState(item?.sale?.date ?? today());
  const capitalRole = roleAccount(data, 'capital');
  const [saleAccount, setSaleAccount] = useState(item?.sale?.accountId ?? (capitalRole && accounts.some(a => a.id === capitalRole.id) ? capitalRole.id : undefined) ?? item?.funding.find(f => f.source === 'capital')?.accountId ?? defaultAccount);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const alive = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const drafts = (['capital', 'pocket'] as const).filter(source => funding[source].enabled);
  const availableCapital = capitalFundingAvailable(data, !selling ? item : undefined);
  const purchaseTotal = drafts.reduce((total, source) => total + (parseMoney(funding[source].amount) ?? 0), 0);
  const previewPrice = parseMoney(salePrice);
  const preview = item && selling && previewPrice !== null ? saleBreakdown({ ...item, investor: hasInvestor ? { name: investorName, amountKopecks: parseMoney(investorAmount) ?? 0, percentBasisPoints: parsePercent(investorPercent) ?? 0, terms: '' } : undefined, sale: { priceKopecks: previewPrice, date: saleDate, accountId: saleAccount } }) : null;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function changeFunding(source: FundingSource, patch: Partial<FundingDraft>) { setFunding(current => ({ ...current, [source]: { ...current[source], ...patch } })); }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    if (photos.length + files.length > MAX_PRODUCT_PHOTOS) { if (photoInput.current) photoInput.current.value = ''; return setError(`Можно добавить не больше ${MAX_PRODUCT_PHOTOS} фото.`); }
    setMediaBusy(true);
    try {
      const added = await Promise.all(Array.from(files).map(preparePhoto));
      if (alive.current) setPhotos(current => [...current, ...added]);
    } catch (e) { if (alive.current) setError(mediaError(e)); }
    finally { if (alive.current) setMediaBusy(false); if (photoInput.current) photoInput.current.value = ''; }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (voiceBusy || mediaBusy) return setError('Дождитесь окончания обработки или остановите запись.');
    let investor: Investor | undefined;
    if (hasInvestor) {
      const amount = investorAmount.trim() ? parseMoney(investorAmount) : 0;
      const percent = investorPercent.trim() ? parsePercent(investorPercent) : 0;
      if (!investorName.trim()) return setError('Выберите инвестора из списка людей.');
      if (!people(data).some(p => p.name === investorName) && item?.investor?.name !== investorName) return setError('Инвестор должен быть выбран из списка людей в разделе «Долги».');
      if (amount === null || percent === null) return setError('Проверьте сумму и процент инвестора: процент от 0 до 100, не больше двух знаков после запятой.');
      investor = { name: investorName.trim().slice(0, 100), amountKopecks: amount, percentBasisPoints: percent, terms: percent ? `${percent / 100}% от чистой прибыли` : '' };
    }
    let product: ResaleProduct;
    if (selling && item) {
      const price = parseMoney(salePrice);
      if (price === null) return setError('Введите корректную цену продажи.');
      if (!accounts.length) return setError('Сначала создайте наличный или банковский счёт для возврата денег.');
      if (!validDate(saleDate) || saleDate < item.purchaseDate) return setError('Дата продажи не может быть раньше даты покупки.');
      if (!accounts.some(a => a.id === saleAccount)) return setError('Выберите счёт для возврата денег.');
      product = { ...item, investor, sale: { priceKopecks: price, date: saleDate, accountId: saleAccount } };
    } else {
      if (!kind.trim()) return setError('Укажите вид товара.');
      if (!validDate(purchaseDate)) return setError('Проверьте дату покупки.');
      const sources: ProductFunding[] = [];
      for (const source of drafts) {
        const draft = funding[source]; const amount = draft.amount.trim() ? parseMoney(draft.amount) : 0;
        if (amount === null || amount < 0) return setError(`Введите корректную сумму для источника «${fundingLabels[source]}».`);
        if (amount === 0) continue;
        if (source === 'capital') {
          if (!accounts.some(a => a.id === draft.accountId)) return setError('Выберите счёт для источника «Капитал».');
          if (amount > availableCapital) return setError(`Из капитала можно взять не больше ${money(Math.max(0, availableCapital))} — это остаток «Мой капитал»${item ? ' с возвращённой суммой этой покупки' : ''}.`);
        }
        sources.push({ source, amountKopecks: amount, accountId: source === 'capital' ? draft.accountId : '' });
      }
      if (sources.reduce((n, f) => n + f.amountKopecks, 0) > 100_000_000_000_00) return setError('Цена покупки слишком большая.');
      const editingItem = !selling ? item : undefined;
      const now = new Date().toISOString();
      const statusFields = editingItem?.sale ? { ...(editingItem.status ? { status: editingItem.status } : {}), ...(editingItem.statusChangedAt ? { statusChangedAt: editingItem.statusChangedAt } : {}), ...(editingItem.preparingStartedAt ? { preparingStartedAt: editingItem.preparingStartedAt } : {}), ...(editingItem.listedAt ? { listedAt: editingItem.listedAt } : {}) } : { status, preparingStartedAt: editingItem?.preparingStartedAt ?? editingItem?.createdAt ?? now, statusChangedAt: editingItem && editingItem.status === status ? editingItem.statusChangedAt ?? now : now, ...(status === 'listed' ? { listedAt: editingItem?.listedAt ?? now } : {}) };
      product = { id: editingItem?.id ?? uid(), kind: kind.trim().slice(0, 120), purchaseDate, funding: sources, description: description.trim().slice(0, 2000), photos, ...(voice ? { voice } : {}), ...(investor ? { investor } : {}), ...(editingItem?.sale ? { sale: editingItem.sale } : {}), createdAt: editingItem?.createdAt ?? now, ...statusFields };
      if (!selling && capitalRemainder({ ...data, products: editingItem ? (data.products ?? []).map(p => p.id === product.id ? product : p) : [...(data.products ?? []), product] }) < 0) return setError('После изменения покупки остаток капитала станет отрицательным. Уменьшите сумму из капитала.');
      if (product.sale && product.sale.date < purchaseDate) return setError('Дата продажи не может быть раньше новой даты покупки.');
    }
    const next = { ...data, products: item ? (data.products ?? []).map(p => p.id === product.id ? product : p) : [...(data.products ?? []), product] };
    try { validateData(next); } catch (e) { return setError(mediaError(e)); }
    onSave(next, selling ? 'Продажа сохранена. Возврат покупки и 15% в капитал зачислены на счёт.' : item ? 'Товар обновлён. Деньги и активы пересчитаны.' : 'Товар добавлен. Из капитала списана только часть «Капитал»; «Из кармана» учтено в цене без списания.');
    onClose();
  }
  function remove() {
    if (!item) return;
    onDelete({ ...data, products: (data.products ?? []).filter(p => p.id !== item.id) }, 'Товар удалён. Покупка и продажа исключены из расчёта.'); onClose();
  }
  function cancelSale() {
    if (!item) return;
    const { sale: _sale, ...rest } = item;
    onDelete({ ...data, products: (data.products ?? []).map(p => p.id === item.id ? rest : p) }, 'Продажа отменена. Товар снова в наличии, возврат денег отменён.'); onClose();
  }
  const title = selling ? item?.sale ? 'Изменить продажу' : 'Продать товар' : item ? 'Изменить товар' : 'Добавить товар';
  return <Modal title={title} subtitle={selling ? `${item?.kind} · покупка ${purchasePriceLabel(saleBreakdown(item!).cost)}` : 'Покупка, источники денег, состояние и инвестор — в одной карточке.'} onClose={onClose} wide>
    <form className="entry-form product-form" onSubmit={submit}>
      {!selling && <>
        <div className="form-section-title"><span>01</span><h3>Товар и покупка</h3></div>
        <div className="product-photo-field"><span className="field-label">Фото товара · необязательно</span><div className="product-photo-list">{photos.map((src, index) => <div className="product-photo-preview" key={`${index}-${src.slice(-24)}`}><img src={src} alt={`Фото товара ${index + 1}`}/><button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={14}/></button></div>)}{photos.length < MAX_PRODUCT_PHOTOS && <button type="button" className="photo-add" disabled={mediaBusy} onClick={() => photoInput.current?.click()}><ImagePlus size={23}/><span>{mediaBusy ? 'Обработка…' : 'Добавить фото'}</span></button>}</div><input ref={photoInput} className="sr-only" type="file" multiple accept={photoAccept} aria-label="Добавить фото" onChange={e => void addPhotos(e.target.files)}/><span className="field-hint">До {MAX_PRODUCT_PHOTOS} фото. Фото уменьшается на устройстве, оригинал не сохраняется.</span></div>
        <div className="form-row"><Field label="Вид товара"><input className="inp" required maxLength={120} list="product-kinds" value={kind} placeholder="Например, телефон" onChange={e => setKind(e.target.value)}/><datalist id="product-kinds">{productKinds.map(k => <option key={k} value={k}/>)}</datalist></Field><Field label="Дата покупки"><input className="inp" type="date" required min="1900-01-01" max="2200-12-31" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}/></Field></div>
        <fieldset className="funding-fieldset"><legend>Деньги для покупки</legend><p className="field-hint">Счёт для капитала выбирается автоматически по роли «Капитал». Доступно: <strong>{money(Math.max(0, availableCapital))}</strong>. «Из кармана» входит в цену покупки и расчёт прибыли, но ниоткуда не списывается. Оставьте оба поля по 0 — товар будет «Бесплатно».</p><div className="funding-row enabled"><span className="checkbox-label">Капитал</span><input className="inp money-input" aria-label="Сумма из капитала, ₽" inputMode="decimal" placeholder="0,00" value={funding.capital.amount} onChange={e => changeFunding('capital', { amount: e.target.value })}/><span className="field-hint">Списание со счёта капитала</span></div><div className={`funding-row ${funding.pocket.enabled ? 'enabled' : ''}`}><label className="checkbox-label"><input type="checkbox" checked={funding.pocket.enabled} onChange={e => changeFunding('pocket', { enabled: e.target.checked })}/>Из кармана</label><input className="inp money-input" aria-label="Сумма из кармана, ₽" inputMode="decimal" placeholder="0,00" disabled={!funding.pocket.enabled} value={funding.pocket.amount} onChange={e => changeFunding('pocket', { amount: e.target.value })}/><span className="field-hint">Без списания со счетов</span></div><div className="purchase-total"><span>Цена покупки</span><strong>{purchasePriceLabel(purchaseTotal)}</strong></div></fieldset>
        {!item?.sale && <Field label="Состояние"><select className="inp" value={status} onChange={e => setStatus(e.target.value as ProductStatus)}><option value="preparing">{productStatusLabels.preparing}</option><option value="listed">{productStatusLabels.listed}</option></select></Field>}
        <VoiceField label="Описание" value={description} onChange={setDescription} voice={voice} onVoiceChange={setVoice} onBusyChange={setVoiceBusy} rows={3} placeholder="Состояние, комплектация, где купили…"/>
      </>}
      {!selling && <div className="form-section-title investor-section-title"><span>02</span><h3>Инвестор</h3><label className="checkbox-label"><input type="checkbox" checked={hasInvestor} onChange={e => setHasInvestor(e.target.checked)}/>Есть инвестор</label></div>}
      {hasInvestor && <div className="investor-fields"><div className="form-row"><Field label="Инвестор" hint="Список людей управляется в разделе «Долги»."><select className="inp" required value={investorName} onChange={e => setInvestorName(e.target.value)}><option value="">Выберите человека</option>{people(data).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}{investorName && !people(data).some(p => p.name === investorName) && <option value={investorName}>{investorName}</option>}</select></Field><Field label="Сумма инвестора, ₽"><input className="inp money-input" inputMode="decimal" value={investorAmount} placeholder="0,00 · необязательно" onChange={e => setInvestorAmount(e.target.value)}/></Field></div><div className="form-row"><Field label="% от чистой прибыли"><input className="inp" inputMode="decimal" value={investorPercent} placeholder="0 · необязательно" onChange={e => setInvestorPercent(e.target.value)}/></Field></div><div className="form-note"><Info size={16}/><span>Сумма инвестора — справочная и входит во вложения непроданного товара на этой странице. Процент вычитается из положительной прибыли до распределения 15/15/70.</span></div></div>}
      {selling && <><div className="form-row"><Field label="Цена продажи, ₽"><input className="inp money-input" required inputMode="decimal" value={salePrice} placeholder="0,00" onChange={e => setSalePrice(e.target.value)}/></Field><Field label="Дата продажи"><input className="inp" type="date" required min={item?.purchaseDate} max="2200-12-31" value={saleDate} onChange={e => setSaleDate(e.target.value)}/></Field></div><Field label="Куда вернуть деньги"><select className="inp" required value={saleAccount} onChange={e => setSaleAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>{preview && <div className="sale-preview" aria-label="Расчёт продажи"><div><span>Прибыль до инвестора</span><strong className={preview.profit < 0 ? 'text-red' : ''}>{money(preview.profit)}</strong></div><div><span>Доля инвестора</span><strong>−{money(preview.investorKopecks)}</strong></div><div><span>Чистая прибыль</span><strong>{money(preview.personalProfit)}</strong></div><div><span>В капитал · 15%</span><strong className="text-green">+{money(profitAllocation(preview.personalProfit).capital)}</strong></div><div><span>На руки · 70%</span><strong>{money(profitAllocation(preview.personalProfit).hand)}</strong></div><div><span>На долги · 15%</span><strong>{money(profitAllocation(preview.personalProfit).debt)}</strong></div><div className="sale-preview-total"><span>Вернётся на счёт</span><strong>{money(preview.returnedKopecks)}</strong></div><p>{preview.profit < 0 ? 'При убытке возвращается цена продажи; убыток полностью уменьшает деньги на руках.' : `Цена покупки + 15% в капитал. Доли 70% на руки и 15% на долги начисляются на карточки ролей; доля инвестора на счёт не зачисляется.`}</p></div>}</>}
      {!selling && <div className="form-note"><PackagePlus size={17}/><span>Часть «Капитал» уменьшит остаток счёта; «Из кармана» увеличит цену покупки и активы без списания. Доход появится только после продажи.</span></div>}
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      {confirmDelete && <div className="delete-confirm"><strong>Удалить товар и связанные суммы?</strong><p>{item?.sale ? 'Покупка и возврат продажи будут исключены из расчёта. Фото и аудио тоже удалятся.' : 'Цена покупки вернётся на счета, товар исчезнет из активов.'} Отменить действие нельзя.</p><div className="flex gap-2"><Button type="button" variant="danger" onClick={remove}>Да, удалить</Button><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button></div></div>}
      <div className="modal-actions">{item && !selling && <Button type="button" variant="ghost" className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Удалить</Button>}{selling && item?.sale && <Button type="button" variant="ghost" className="delete-btn" onClick={cancelSale}>Отменить продажу</Button>}<Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" disabled={mediaBusy || voiceBusy}><Check size={17}/>{selling ? item?.sale ? 'Сохранить продажу' : 'Подтвердить продажу' : item ? 'Сохранить' : 'Добавить товар'}</Button></div>
    </form>
  </Modal>;
}
