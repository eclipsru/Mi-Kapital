import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Check, ImagePlus, Info, Mic, PackagePlus, Square, Trash2, X } from 'lucide-react';
import { fundingLabels, inputMoney, liquidAccounts, MAX_PRODUCT_PHOTOS, MAX_VOICE_SECONDS, money, parseMoney, parsePercent, people, productKinds, productStatusLabels, profitAllocation, roleAccount, saleBreakdown, today, uid, validDate, type AppData, type FundingSource, type Investor, type ProductFunding, type ProductStatus, type ResaleProduct, type VoiceNote } from '../core/model';
import { mediaError, photoAccept, preparePhoto, prepareVoice, recordingMime } from '../core/media';
import { Button, Field, Modal } from './ui';
import { validateData } from '../core/storage';

export type ProductRequest = { type: 'product'; item?: ResaleProduct } | { type: 'product-sale'; item: ResaleProduct };
type FundingDraft = { enabled: boolean; amount: string; accountId: string };
export function ProductModal({ request, data, onClose, onSave, onDelete }: { request: ProductRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void; onDelete: (data: AppData, message: string) => void }) {
  const item = request.item;
  const selling = request.type === 'product-sale';
  const accounts = liquidAccounts(data);
  const defaultAccount = accounts[0]?.id ?? '';
  const defaultForSource = (source: FundingSource) => { const role = roleAccount(data, source === 'capital' ? 'capital' : 'hand'); return role && accounts.some(a => a.id === role.id) ? role.id : defaultAccount; };
  const [kind, setKind] = useState(!selling ? request.item?.kind ?? '' : '');
  const [purchaseDate, setPurchaseDate] = useState(!selling ? request.item?.purchaseDate ?? today() : today());
  const [funding, setFunding] = useState<Record<FundingSource, FundingDraft>>(() => ({
    capital: { enabled: !item || item.funding.some(f => f.source === 'capital'), amount: inputMoney(item?.funding.find(f => f.source === 'capital')?.amountKopecks ?? 0), accountId: item?.funding.find(f => f.source === 'capital')?.accountId ?? defaultForSource('capital') },
    pocket: { enabled: !!item?.funding.some(f => f.source === 'pocket'), amount: inputMoney(item?.funding.find(f => f.source === 'pocket')?.amountKopecks ?? 0), accountId: item?.funding.find(f => f.source === 'pocket')?.accountId ?? defaultForSource('pocket') },
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
  const [saleAccount, setSaleAccount] = useState(item?.sale?.accountId ?? (capitalRole && accounts.some(a => a.id === capitalRole.id) ? capitalRole.id : undefined) ?? item?.funding[0]?.accountId ?? defaultAccount);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const alive = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const drafts = (['capital', 'pocket'] as const).filter(source => funding[source].enabled);
  const purchaseTotal = drafts.reduce((total, source) => total + (parseMoney(funding[source].amount) ?? 0), 0);
  const previewPrice = parseMoney(salePrice);
  const preview = item && selling && previewPrice !== null ? saleBreakdown({ ...item, investor: hasInvestor ? { name: investorName, amountKopecks: parseMoney(investorAmount) ?? 0, percentBasisPoints: parsePercent(investorPercent) ?? 0, terms: '' } : undefined, sale: { priceKopecks: previewPrice, date: saleDate, accountId: saleAccount } }) : null;

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    recorder.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
      const current = recorder.current;
      if (current && current.state !== 'inactive') current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
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
  async function toggleRecording() {
    setError('');
    if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.stop(); return; }
    const mimeType = recordingMime();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) return setError('В этом браузере запись недоступна. Используйте приложение Windows или введите описание текстом.');
    setMediaBusy(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!alive.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const current = new MediaRecorder(input, { mimeType, audioBitsPerSecond: 48000 });
      recorder.current = current;
      const chunks: BlobPart[] = [];
      started.current = Date.now(); setSeconds(0); setRecording(true);
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => { stopTracks(); if (alive.current) { setRecording(false); setMediaBusy(false); setError('Не удалось записать аудио. Попробуйте ещё раз или введите текст.'); } };
      current.onstop = async () => {
        const duration = (Date.now() - started.current) / 1000;
        stopTracks();
        try { const note = await prepareVoice(new Blob(chunks, { type: current.mimeType || mimeType }), duration); if (alive.current) { setVoice(note); setSeconds(note.durationSeconds); } }
        catch (e) { if (alive.current) setError(mediaError(e)); }
        finally { if (alive.current) { setRecording(false); setMediaBusy(false); } }
      };
      current.start(250);
      timer.current = setInterval(() => {
        const elapsed = (Date.now() - started.current) / 1000;
        if (alive.current) setSeconds(Math.min(MAX_VOICE_SECONDS, Math.floor(elapsed)));
        if (elapsed >= MAX_VOICE_SECONDS && current.state !== 'inactive') current.stop();
      }, 250);
    } catch (e) { stopTracks(); if (alive.current) setError(mediaError(e)); }
    finally { if (alive.current && recorder.current?.state !== 'recording') setMediaBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (recording || mediaBusy) return setError('Дождитесь окончания обработки или остановите запись.');
    if (!accounts.length) return setError('Сначала создайте наличный или банковский счёт в разделе «Мой капитал».');
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
      if (!validDate(saleDate) || saleDate < item.purchaseDate) return setError('Дата продажи не может быть раньше даты покупки.');
      if (!accounts.some(a => a.id === saleAccount)) return setError('Выберите счёт для возврата денег.');
      product = { ...item, investor, sale: { priceKopecks: price, date: saleDate, accountId: saleAccount } };
    } else {
      if (!kind.trim()) return setError('Укажите вид товара.');
      if (!validDate(purchaseDate)) return setError('Проверьте дату покупки.');
      if (!drafts.length) return setError('Выберите хотя бы один источник: капитал или карман.');
      const sources: ProductFunding[] = [];
      for (const source of drafts) {
        const draft = funding[source]; const amount = parseMoney(draft.amount);
        if (amount === null || amount <= 0) return setError(`Введите положительную сумму для источника «${fundingLabels[source]}».`);
        if (!accounts.some(a => a.id === draft.accountId)) return setError(`Выберите счёт для источника «${fundingLabels[source]}».`);
        sources.push({ source, amountKopecks: amount, accountId: draft.accountId });
      }
      if (sources.reduce((n, f) => n + f.amountKopecks, 0) > 100_000_000_000_00) return setError('Цена покупки слишком большая.');
      const editingItem = !selling ? item : undefined;
      const now = new Date().toISOString();
      const statusFields = editingItem?.sale ? { ...(editingItem.status ? { status: editingItem.status } : {}), ...(editingItem.statusChangedAt ? { statusChangedAt: editingItem.statusChangedAt } : {}), ...(editingItem.preparingStartedAt ? { preparingStartedAt: editingItem.preparingStartedAt } : {}), ...(editingItem.listedAt ? { listedAt: editingItem.listedAt } : {}) } : { status, preparingStartedAt: editingItem?.preparingStartedAt ?? editingItem?.createdAt ?? now, statusChangedAt: editingItem && editingItem.status === status ? editingItem.statusChangedAt ?? now : now, ...(status === 'listed' ? { listedAt: editingItem?.listedAt ?? now } : {}) };
      product = { id: editingItem?.id ?? uid(), kind: kind.trim().slice(0, 120), purchaseDate, funding: sources, description: description.trim().slice(0, 2000), photos, ...(voice ? { voice } : {}), ...(investor ? { investor } : {}), ...(editingItem?.sale ? { sale: editingItem.sale } : {}), createdAt: editingItem?.createdAt ?? now, ...statusFields };
      if (product.sale && product.sale.date < purchaseDate) return setError('Дата продажи не может быть раньше новой даты покупки.');
    }
    const next = { ...data, products: item ? (data.products ?? []).map(p => p.id === product.id ? product : p) : [...(data.products ?? []), product] };
    try { validateData(next); } catch (e) { return setError(mediaError(e)); }
    onSave(next, selling ? 'Продажа сохранена. Возврат покупки и 15% в капитал зачислены на счёт.' : item ? 'Товар обновлён. Деньги и активы пересчитаны.' : 'Товар добавлен. Цена покупки списана, товар учтён в активах.');
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
  return <Modal title={title} subtitle={selling ? `${item?.kind} · покупка ${money(saleBreakdown(item!).cost)}` : 'Покупка, источники денег, состояние и инвестор — в одной карточке.'} onClose={onClose} wide>
    <form className="entry-form product-form" onSubmit={submit}>
      {!selling && <>
        <div className="form-section-title"><span>01</span><h3>Товар и покупка</h3></div>
        <div className="product-photo-field"><span className="field-label">Фото товара · необязательно</span><div className="product-photo-list">{photos.map((src, index) => <div className="product-photo-preview" key={`${index}-${src.slice(-24)}`}><img src={src} alt={`Фото товара ${index + 1}`}/><button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={14}/></button></div>)}{photos.length < MAX_PRODUCT_PHOTOS && <button type="button" className="photo-add" disabled={mediaBusy} onClick={() => photoInput.current?.click()}><ImagePlus size={23}/><span>{mediaBusy ? 'Обработка…' : 'Добавить фото'}</span></button>}</div><input ref={photoInput} className="sr-only" type="file" multiple accept={photoAccept} aria-label="Добавить фото" onChange={e => void addPhotos(e.target.files)}/><span className="field-hint">До {MAX_PRODUCT_PHOTOS} фото. Фото уменьшается на устройстве, оригинал не сохраняется.</span></div>
        <div className="form-row"><Field label="Вид товара"><input className="inp" required maxLength={120} list="product-kinds" value={kind} placeholder="Например, телефон" onChange={e => setKind(e.target.value)}/><datalist id="product-kinds">{productKinds.map(k => <option key={k} value={k}/>)}</datalist></Field><Field label="Дата покупки"><input className="inp" type="date" required min="1900-01-01" max="2200-12-31" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}/></Field></div>
        <fieldset className="funding-fieldset"><legend>Деньги из</legend><p className="field-hint">Можно выбрать оба источника. Цена покупки — их сумма. Счёт выбирается автоматически по роли: капитал или карман.</p>{(['capital', 'pocket'] as const).map(source => <div className={`funding-row ${funding[source].enabled ? 'enabled' : ''}`} key={source}><label className="checkbox-label"><input type="checkbox" checked={funding[source].enabled} onChange={e => changeFunding(source, { enabled: e.target.checked })}/>{fundingLabels[source]}</label><input className="inp money-input" aria-label={`Сумма из ${source === 'capital' ? 'капитала' : 'кармана'}, ₽`} inputMode="decimal" placeholder="0,00" disabled={!funding[source].enabled} required={funding[source].enabled} value={funding[source].amount} onChange={e => changeFunding(source, { amount: e.target.value })}/></div>)}<div className="purchase-total"><span>Цена покупки</span><strong>{money(purchaseTotal)}</strong></div></fieldset>
        {!item?.sale && <Field label="Состояние"><select className="inp" value={status} onChange={e => setStatus(e.target.value as ProductStatus)}><option value="preparing">{productStatusLabels.preparing}</option><option value="listed">{productStatusLabels.listed}</option></select></Field>}
        <Field label="Описание"><textarea className="inp" rows={3} maxLength={2000} value={description} placeholder="Состояние, комплектация, где купили…" onChange={e => setDescription(e.target.value)}/></Field>
        <div className="voice-field"><div className="voice-controls"><Button type="button" variant={recording ? 'danger' : 'secondary'} disabled={mediaBusy && !recording} onClick={() => void toggleRecording()}>{recording ? <Square size={15}/> : <Mic size={16}/>} {recording ? 'Остановить запись' : voice ? 'Перезаписать заметку' : 'Записать голосом'}</Button><span className={recording ? 'recording-indicator' : 'muted small'}>{recording && <i/>}{recording || seconds ? `${seconds} / ${MAX_VOICE_SECONDS} сек.` : 'Аудиозаметка к описанию · до 90 секунд'}</span>{voice && !recording && <button type="button" className="text-link" onClick={() => { setVoice(undefined); setSeconds(0); }}>Удалить аудио</button>}</div>{voice && !recording && <audio controls src={voice.dataUrl} aria-label="Голосовое описание"/>}<span className="field-hint">Запись только по кнопке, хранится на вашем ПК. Это аудио, не автоматическая расшифровка.</span></div>
      </>}
      {!selling && <div className="form-section-title investor-section-title"><span>02</span><h3>Инвестор</h3><label className="checkbox-label"><input type="checkbox" checked={hasInvestor} onChange={e => setHasInvestor(e.target.checked)}/>Есть инвестор</label></div>}
      {hasInvestor && <div className="investor-fields"><div className="form-row"><Field label="Инвестор" hint="Список людей управляется в разделе «Долги»."><select className="inp" required value={investorName} onChange={e => setInvestorName(e.target.value)}><option value="">Выберите человека</option>{people(data).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}{investorName && !people(data).some(p => p.name === investorName) && <option value={investorName}>{investorName}</option>}</select></Field><Field label="Сумма инвестора, ₽"><input className="inp money-input" inputMode="decimal" value={investorAmount} placeholder="0,00 · необязательно" onChange={e => setInvestorAmount(e.target.value)}/></Field></div><div className="form-row"><Field label="% от чистой прибыли"><input className="inp" inputMode="decimal" value={investorPercent} placeholder="0 · необязательно" onChange={e => setInvestorPercent(e.target.value)}/></Field></div><div className="form-note"><Info size={16}/><span>Сумма инвестора — справочная и входит во вложения непроданного товара на этой странице. Процент вычитается из положительной прибыли до распределения 15/15/70.</span></div></div>}
      {selling && <><div className="form-row"><Field label="Цена продажи, ₽"><input className="inp money-input" required inputMode="decimal" value={salePrice} placeholder="0,00" onChange={e => setSalePrice(e.target.value)}/></Field><Field label="Дата продажи"><input className="inp" type="date" required min={item?.purchaseDate} max="2200-12-31" value={saleDate} onChange={e => setSaleDate(e.target.value)}/></Field></div><Field label="Куда вернуть деньги"><select className="inp" required value={saleAccount} onChange={e => setSaleAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>{preview && <div className="sale-preview" aria-label="Расчёт продажи"><div><span>Прибыль до инвестора</span><strong className={preview.profit < 0 ? 'text-red' : ''}>{money(preview.profit)}</strong></div><div><span>Доля инвестора</span><strong>−{money(preview.investorKopecks)}</strong></div><div><span>Чистая прибыль</span><strong>{money(preview.personalProfit)}</strong></div><div><span>В капитал · 15%</span><strong className="text-green">+{money(profitAllocation(preview.personalProfit).capital)}</strong></div><div><span>На руки · 70%</span><strong>{money(profitAllocation(preview.personalProfit).hand)}</strong></div><div><span>На долги · 15%</span><strong>{money(profitAllocation(preview.personalProfit).debt)}</strong></div><div className="sale-preview-total"><span>Вернётся на счёт</span><strong>{money(preview.returnedKopecks)}</strong></div><p>{preview.profit < 0 ? 'При убытке возвращается цена продажи; убыток полностью уменьшает деньги на руках.' : `Цена покупки + 15% в капитал. Доли 70% на руки и 15% на долги начисляются на карточки ролей; доля инвестора на счёт не зачисляется.`}</p></div>}</>}
      {!selling && <div className="form-note"><PackagePlus size={17}/><span>Покупка уменьшит остаток и увеличит активы. Доход появится только после продажи.</span></div>}
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      {confirmDelete && <div className="delete-confirm"><strong>Удалить товар и связанные суммы?</strong><p>{item?.sale ? 'Покупка и возврат продажи будут исключены из расчёта. Фото и аудио тоже удалятся.' : 'Цена покупки вернётся на счета, товар исчезнет из активов.'} Отменить действие нельзя.</p><div className="flex gap-2"><Button type="button" variant="danger" onClick={remove}>Да, удалить</Button><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button></div></div>}
      <div className="modal-actions">{item && !selling && <Button type="button" variant="ghost" className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Удалить</Button>}{selling && item?.sale && <Button type="button" variant="ghost" className="delete-btn" onClick={cancelSale}>Отменить продажу</Button>}<Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" disabled={mediaBusy || recording}><Check size={17}/>{selling ? item?.sale ? 'Сохранить продажу' : 'Подтвердить продажу' : item ? 'Сохранить' : 'Добавить товар'}</Button></div>
    </form>
  </Modal>;
}
