import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mic, Plus, Save, Trash2, X } from 'lucide-react';
import { createId, moneyToKopecks, today, type Entry, type WorkLine } from './domain';

export type ModalType = 'resale' | 'job' | 'debt' | 'investor' | 'category' | 'sale' | 'payment' | null;
type Investor = Entry;

export function EntryModal({
  type,
  target,
  investors,
  categories,
  defaultCategory,
  onClose,
  onSave,
  onSell,
  onPayment,
}: {
  type: ModalType;
  target: Entry | null;
  investors: Investor[];
  categories: string[];
  defaultCategory: string;
  onClose: () => void;
  onSave: (entry: Entry) => void;
  onSell: (entry: Entry, amount: number, date: string) => void;
  onPayment: (entry: Entry, amount: number, date: string) => void;
}) {
  const [name, setName] = useState('');
  const [condition, setCondition] = useState('Хорошее');
  const [description, setDescription] = useState('');
  const [purchase, setPurchase] = useState('');
  const [investment, setInvestment] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [investorPercent, setInvestorPercent] = useState('');
  const [investorRule, setInvestorRule] = useState<'profit' | 'capital' | 'sale' | 'manual'>('profit');
  const [manualPayout, setManualPayout] = useState('');
  const [category, setCategory] = useState(defaultCategory || categories[0] || 'Спил деревьев');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [lines, setLines] = useState<WorkLine[]>([{ id: createId(), name: '', amountKopecks: 0 }]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [date, setDate] = useState(today());
  const [purpose, setPurpose] = useState('');
  const [creditor, setCreditor] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [sale, setSale] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [error, setError] = useState('');

  const title =
    type === 'resale'
      ? 'Добавить товар на перепродажу'
      : type === 'job'
        ? 'Добавить выполненную работу'
        : type === 'debt'
          ? 'Добавить потребительский долг'
          : type === 'investor'
            ? 'Добавить инвестора'
            : type === 'category'
              ? 'Новый пункт подработки'
              : type === 'sale'
                ? 'Продажа товара'
                : 'Записать погашение долга';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (type === 'sale' && target) {
      const value = moneyToKopecks(sale);
      if (value === null || value <= 0) return setError('Введите сумму продажи больше нуля.');
      onSell(target, value, date);
      return;
    }
    if (type === 'payment' && target) {
      const value = moneyToKopecks(payAmount);
      if (value === null || value <= 0) return setError('Введите сумму платежа больше нуля.');
      onPayment(target, value, date);
      return;
    }
    if (type === 'category') {
      const clean = categoryName.trim();
      if (!clean) return setError('Введите название пункта.');
      onSave(makeEntry('category', { name: clean }));
      return;
    }
    if (type === 'resale') {
      if (!name.trim()) return setError('Укажите название товара.');
      const purchaseValue = moneyToKopecks(purchase || '0');
      const investmentValue = moneyToKopecks(investment || '0');
      if (purchaseValue === null || investmentValue === null) {
        return setError('Проверьте формат сумм: например, 1250 или 1250,50.');
      }
      if (investmentValue > 0 && !investorName) {
        return setError('Выберите инвестора для указанного вложения.');
      }
      const percent = Number((investorPercent || '0').trim().replace(',', '.'));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return setError('Процент должен быть от 0 до 100.');
      }
      const manualValue = moneyToKopecks(manualPayout || '0');
      if (manualValue === null) return setError('Проверьте сумму выплаты инвестору.');
      onSave(
        makeEntry('resale', {
          name: name.trim(),
          condition,
          description: description.trim(),
          voiceNote,
          purchaseKopecks: purchaseValue,
          investmentKopecks: investmentValue,
          investorName: investmentValue ? investorName : '',
          investorPercent: percent,
          investorRule,
          manualPayoutKopecks: manualValue,
          sold: false,
        }),
      );
      return;
    }
    if (type === 'job') {
      if (startTime && endTime && endTime < startTime) {
        return setError('Время окончания раньше начала. Проверьте часы работы.');
      }
      let total = 0;
      let savedLines: WorkLine[] = [];
      if (category === 'Ремонт авто') {
        savedLines = lines.filter((line) => line.name.trim());
        if (!savedLines.length) return setError('Добавьте хотя бы одну проведённую работу.');
        total = savedLines.reduce((sum, line) => sum + (line.amountKopecks || 0), 0);
      } else {
        const value = moneyToKopecks(amount);
        if (value === null) return setError('Введите корректную сумму.');
        total = value;
      }
      if (category === 'Спил деревьев' && !address.trim()) {
        return setError('Укажите адрес работы.');
      }
      onSave(
        makeEntry('job', {
          category,
          address: address.trim(),
          amountKopecks: total,
          lines: savedLines,
          description: description.trim(),
          voiceNote,
          startTime,
          endTime,
          date,
        }),
      );
      return;
    }
    if (type === 'debt') {
      const value = moneyToKopecks(amount);
      if (!purpose.trim() || !creditor.trim()) {
        return setError('Заполните поля «На что» и «У кого».');
      }
      if (value === null || value <= 0) return setError('Введите сумму долга больше нуля.');
      onSave(
        makeEntry('consumerDebt', {
          purpose: purpose.trim(),
          creditor: creditor.trim(),
          amountKopecks: value,
          payments: [],
          description: description.trim(),
          voiceNote,
          date,
        }),
      );
      return;
    }
    if (type === 'investor') {
      if (!name.trim()) return setError('Укажите имя инвестора.');
      onSave(makeEntry('investor', { name: name.trim(), description: description.trim(), voiceNote }));
    }
  };

  const setLine = (id: string, field: 'name' | 'amountKopecks', value: string) =>
    setLines((current) =>
      current.map((line) =>
        line.id === id
          ? { ...line, [field]: field === 'name' ? value : moneyToKopecks(value) ?? 0 }
          : line,
      ),
    );

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div>
            <span className="eyebrow">Мой капитал</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <form className="modal-form" onSubmit={submit}>
          <div className="modal-body">
            {type === 'resale' && (
              <>
                <div className="form-section-label">
                  01 <span>О товаре</span>
                </div>
                <label>
                  Название товара
                  <input
                    className="inp"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, фрезер ручной или перфоратор Bosch"
                    required
                  />
                </label>
                <label>
                  Состояние
                  <select className="inp" value={condition} onChange={(e) => setCondition(e.target.value)}>
                    <option>Новое</option>
                    <option>Отличное</option>
                    <option>Хорошее</option>
                    <option>Есть недостатки</option>
                    <option>Под восстановление</option>
                  </select>
                </label>
                <Description value={description} onChange={setDescription} voice={voiceNote} onVoice={setVoiceNote} />

                <div className="form-section-label separated">
                  02 <span>Вложения и инвестор</span>
                </div>
                <div className="form-row">
                  <label>
                    Цена покупки, ₽
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={purchase}
                      onChange={(e) => setPurchase(e.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                  <label>
                    Инвестиции, ₽
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={investment}
                      onChange={(e) => setInvestment(e.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                </div>

                {Number(moneyToKopecks(investment) || 0) > 0 && (
                  <div className="investor-fields">
                    <label>
                      Инвестор
                      <select
                        className="inp"
                        value={investorName}
                        onChange={(e) => setInvestorName(e.target.value)}
                      >
                        <option value="">Выберите инвестора</option>
                        {investors.map((item) => (
                          <option key={item.id} value={String(item.data.name)}>
                            {String(item.data.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!investors.length && (
                      <small className="inline-hint">
                        Сначала добавьте инвестора во вкладке «Инвесторы».
                      </small>
                    )}
                    <label>
                      Условие выплаты
                      <select
                        className="inp"
                        value={investorRule}
                        onChange={(e) => setInvestorRule(e.target.value as typeof investorRule)}
                      >
                        <option value="profit">Вложение + % от прибыли</option>
                        <option value="capital">Вложение + % от суммы вложения</option>
                        <option value="sale">Вложение + % от суммы продажи</option>
                        <option value="manual">Сумму выплаты укажу вручную</option>
                      </select>
                    </label>
                    {investorRule !== 'manual' ? (
                      <label>
                        Процент по договорённости
                        <input
                          className="inp"
                          inputMode="decimal"
                          value={investorPercent}
                          onChange={(e) => setInvestorPercent(e.target.value)}
                          placeholder="Например, 20"
                        />
                      </label>
                    ) : (
                      <label>
                        Дополнительная выплата инвестору, ₽
                        <input
                          className="inp"
                          inputMode="decimal"
                          value={manualPayout}
                          onChange={(e) => setManualPayout(e.target.value)}
                          placeholder="0,00"
                        />
                      </label>
                    )}
                    <small className="inline-hint">
                      Возврат самого вложения учитывается отдельно и прибавляется к вознаграждению.
                    </small>
                  </div>
                )}
              </>
            )}

            {type === 'job' && (
              <>
                <label>
                  Категория
                  <select className="inp" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {category === 'Спил деревьев' && <AddressInput value={address} onChange={setAddress} />}
                <label>
                  Дата
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <div className="form-row">
                  <label>
                    Начал
                    <input
                      className="inp"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </label>
                  <label>
                    Окончил
                    <input
                      className="inp"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </label>
                </div>

                {category === 'Ремонт авто' ? (
                  <div className="work-lines">
                    <div className="work-lines-heading">
                      <span>Проведённые работы</span>
                      <button
                        type="button"
                        className="btn xs sec"
                        onClick={() =>
                          setLines((items) => [...items, { id: createId(), name: '', amountKopecks: 0 }])
                        }
                      >
                        <Plus size={14} /> Добавить строку
                      </button>
                    </div>
                    {lines.map((line, index) => (
                      <div className="work-line" key={line.id}>
                        <span className="line-index">{index + 1}</span>
                        <input
                          className="inp"
                          value={line.name}
                          onChange={(e) => setLine(line.id, 'name', e.target.value)}
                          placeholder="Например, замена масла"
                        />
                        <input
                          className="inp"
                          inputMode="decimal"
                          value={line.amountKopecks ? (line.amountKopecks / 100).toString() : ''}
                          onChange={(e) => setLine(line.id, 'amountKopecks', e.target.value)}
                          placeholder="Сумма, ₽"
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            className="close-btn"
                            onClick={() =>
                              setLines((items) => items.filter((item) => item.id !== line.id))
                            }
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="lines-total num-tab">
                      <span>Итого</span>
                      <b>
                        {(
                          lines.reduce((sum, line) => sum + line.amountKopecks, 0) / 100
                        ).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}{' '}
                        ₽
                      </b>
                    </div>
                  </div>
                ) : (
                  <label>
                    Сумма заработка, ₽
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                  </label>
                )}

                <Description value={description} onChange={setDescription} voice={voiceNote} onVoice={setVoiceNote} />
              </>
            )}

            {type === 'debt' && (
              <>
                <div className="form-row">
                  <label>
                    На что
                    <input
                      className="inp"
                      autoFocus
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="Например, ремонт авто или инструмент"
                      required
                    />
                  </label>
                  <label>
                    У кого
                    <input
                      className="inp"
                      value={creditor}
                      onChange={(e) => setCreditor(e.target.value)}
                      placeholder="Имя или организация"
                      required
                    />
                  </label>
                </div>
                <label>
                  Сумма долга, ₽
                  <input
                    className="inp"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  Дата долга
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <Description value={description} onChange={setDescription} voice={voiceNote} onVoice={setVoiceNote} />
                <div className="inline-hint">
                  Частичные погашения можно вносить прямо из карточки долга.
                </div>
              </>
            )}

            {type === 'investor' && (
              <>
                <label>
                  Имя инвестора
                  <input
                    className="inp"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя или название"
                    required
                  />
                </label>
                <Description value={description} onChange={setDescription} voice={voiceNote} onVoice={setVoiceNote} />
                <div className="inline-hint">
                  Суммы инвестиций и правила расчёта привязываются к конкретным товарам в «Перепродаже».
                </div>
              </>
            )}

            {type === 'category' && (
              <label>
                Название пункта подработки
                <input
                  className="inp"
                  autoFocus
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Например, Доставка или Монтаж"
                  required
                />
              </label>
            )}

            {type === 'sale' && target && (
              <>
                <div className="sale-summary">
                  <span className="sale-summary-icon">✓</span>
                  <div>
                    <small>ТОВАР К ПРОДАЖЕ</small>
                    <b>{String(target.data.name || '')}</b>
                  </div>
                </div>
                <label>
                  Сумма продажи, ₽
                  <input
                    className="inp"
                    autoFocus
                    inputMode="decimal"
                    value={sale}
                    onChange={(e) => setSale(e.target.value)}
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  Дата продажи
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <p className="inline-hint">
                  Прибыль рассчитывается как сумма продажи минус цена покупки и вложение инвестора.
                </p>
              </>
            )}

            {type === 'payment' && target && (
              <>
                <div className="sale-summary">
                  <span className="sale-summary-icon">₽</span>
                  <div>
                    <small>ПОГАШЕНИЕ ДОЛГА</small>
                    <b>
                      {String(target.data.purpose || '')} · {String(target.data.creditor || '')}
                    </b>
                  </div>
                </div>
                <label>
                  Сумма платежа, ₽
                  <input
                    className="inp"
                    autoFocus
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  Дата платежа
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <p className="inline-hint">
                  Остаток долга пересчитается автоматически сразу после сохранения.
                </p>
              </>
            )}

            {error && <p className="form-error">{error}</p>}
          </div>

          <footer className="modal-footer">
            <button type="button" className="btn sec sm" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn sm">
              <Save size={16} />
              {type === 'sale'
                ? 'Подтвердить продажу'
                : type === 'payment'
                  ? 'Сохранить платёж'
                  : type === 'category'
                    ? 'Добавить пункт'
                    : 'Сохранить'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function makeEntry(type: Entry['type'], data: Record<string, unknown>): Entry {
  const now = new Date().toISOString();
  return { id: createId(), type, data, createdAt: now, updatedAt: now };
}

function Description({
  value,
  onChange,
  voice,
  onVoice,
}: {
  value: string;
  onChange: (value: string) => void;
  voice: string;
  onVoice: (value: string) => void;
}) {
  return (
    <div className="description-field">
      <label>
        Описание
        <textarea
          className="inp"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Добавьте подробности…"
        />
      </label>
      <VoiceRecorder value={voice} onChange={onVoice} />
    </div>
  );
}

function VoiceRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const record = async () => {
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('Запись аудио не поддерживается на этом устройстве.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        setBusy(true);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        const reader = new FileReader();
        reader.onloadend = () => {
          onChange(String(reader.result || ''));
          setBusy(false);
          setMessage('Голосовое описание сохранено');
        };
        reader.onerror = () => {
          setBusy(false);
          setMessage('Не удалось сохранить аудиозапись.');
        };
        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start();
      setRecording(true);
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 120000);
    } catch {
      setMessage('Нет доступа к микрофону. Разрешите его в настройках системы.');
    }
  };

  return (
    <div className="voice-row">
      <button
        type="button"
        className={`voice-button ${recording ? 'recording' : ''}`}
        onClick={() => (recording ? stop() : void record())}
        disabled={busy}
      >
        <Mic size={15} />
        {recording ? 'Остановить запись' : busy ? 'Сохраняем…' : 'Записать голосом'}
      </button>
      {value && (
        <>
          <audio controls src={value} />
          <button
            type="button"
            className="close-btn"
            title="Удалить аудио"
            onClick={() => onChange('')}
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
      {message && <small>{message}</small>}
    </div>
  );
}

function AddressInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=ru`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('photon');
        const body = (await response.json()) as {
          features?: Array<{
            properties?: {
              name?: string;
              street?: string;
              housenumber?: string;
              city?: string;
              state?: string;
            };
          }>;
        };
        setSuggestions(
          (body.features || [])
            .map(({ properties: p }) =>
              [p?.street || p?.name, p?.housenumber, p?.city, p?.state]
                .filter(Boolean)
                .join(', '),
            )
            .filter(Boolean),
        );
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <label className="address-wrap">
      Адрес
      <input
        className="inp"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
        }}
        onFocus={() => setActive(true)}
        onBlur={() => window.setTimeout(() => setActive(false), 180)}
        placeholder="Начните вводить улицу и город"
        autoComplete="street-address"
      />
      {loading && <small className="address-loading">Ищем адрес…</small>}
      {active && suggestions.length > 0 && (
        <div className="address-suggestions">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={() => {
                onChange(item);
                setQuery('');
                setSuggestions([]);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      <small className="field-hint">Подсказки адресов Photon; можно указать вручную.</small>
    </label>
  );
}
