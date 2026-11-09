import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Check, ChevronRight, CreditCard, Inbox, Landmark, Plus, TrendingUp, X, type LucideIcon } from 'lucide-react';
import { accountKinds, money, type AccountKind, type LedgerItem } from '../core/model';
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) { return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>; }
export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button className="icon-btn" title={label} aria-label={label} {...props}>{children}</button>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'green' | 'orange' | 'red' | 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) { return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>; }
export function Empty({ title, text, action, icon: Icon = Inbox }: { title: string; text: string; action?: ReactNode; icon?: LucideIcon }) { return <div className="empty"><div className="empty-icon"><Icon size={28} strokeWidth={1.5}/></div><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function SectionHead({ title, count, action }: { title: string; count?: number; action?: ReactNode }) { return <div className="section-head"><h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>{action}</div>; }
export function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export const accountIcons: Record<AccountKind, LucideIcon> = { cash: Banknote, bank: CreditCard, investment: TrendingUp, other: Landmark };
export function AccountIcon({ kind, size = 21 }: { kind: AccountKind; size?: number }) { const Icon = accountIcons[kind]; return <Icon size={size} strokeWidth={1.7}/>; }
export function AccountChip({ kind }: { kind: AccountKind }) { return <span className="account-chip">{accountKinds[kind]}</span>; }
export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(timer); document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}><div className="modal-head"><div><h2 id={id}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Закрыть" onClick={onClose}><X size={20}/></IconButton></div>{children}</div></div>;
}
export function LedgerTable({ items, onEdit, emptyAction }: { items: LedgerItem[]; onEdit: (item: LedgerItem) => void; emptyAction?: ReactNode }) {
  if (!items.length) return <Empty title="Здесь появятся ваши операции" text="Добавьте первую запись — суммы и остатки пересчитаются автоматически." action={emptyAction}/>;
  return <div className="table-scroll"><table className="ledger-table"><thead><tr><th>Операция</th><th>Дата</th><th className="align-right">Сумма</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><div className="transaction"><span className={`transaction-icon ${item.positive ? 'positive' : 'negative'}`}>{item.positive ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</span><div><button className="text-link" onClick={() => onEdit(item)}>{item.title}</button><small>{item.subtitle}</small></div></div></td><td className="muted date-cell">{new Date(`${item.date}T12:00:00`).toLocaleDateString('ru-RU')}</td><td className={`align-right money-cell ${item.positive ? 'text-green' : ''}`}>{item.type === 'product-purchase' && item.amount === 0 ? 'Бесплатно' : <>{item.type === 'adjustment' && item.amount >= 0 ? '+' : item.positive ? '+' : '−'}{money(Math.abs(item.amount))}</>}</td><td><IconButton label={`Изменить: ${item.title}`} onClick={() => onEdit(item)}><ChevronRight size={17}/></IconButton></td></tr>)}</tbody></table></div>;
}
export function Bars({ series, label = 'Чистая прибыль и расходы' }: { series: { key: string; income: number; expense: number }[]; label?: string }) {
  const rawMax = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));
  const rawMin = Math.min(0, ...series.flatMap(s => [s.income, s.expense]));
  const magnitude = 10 ** Math.floor(Math.log10(rawMax - rawMin));
  const step = Math.ceil((rawMax - rawMin) / magnitude / 4) * magnitude / 4;
  const max = Math.ceil(rawMax / step) * step;
  const min = Math.floor(rawMin / step) * step;
  const ticks = Array.from({ length: 5 }, (_, i) => max - (max - min) * i / 4);
  const compact = (value: number) => `${new Intl.NumberFormat('ru-RU', { notation: Math.abs(value) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value / 100)} ₽`;
  const zero = max / (max - min) * 100;
  return <div className="chart-with-axis"><div className="chart-y-axis" aria-hidden="true">{ticks.map((tick,i)=><span key={i}>{compact(tick)}</span>)}</div><div className="bar-chart" role="img" aria-label={`${label}. Шкала слева в рублях. ${series.map(s => `${s.key}: чистая прибыль ${money(s.income)}, расходы ${money(s.expense)}`).join('; ')}`}><div className="chart-grid" aria-hidden="true">{ticks.map((_,i)=><i key={i} style={{top:`${i*25}%`}}/>)}<i className="chart-zero" style={{top:`${zero}%`}}/></div>{series.map(s => <div className="bar-column" key={s.key}><div className="bar-pair"><div className="bar income-bar" style={{ height:`${Math.abs(s.income) / (max-min) * 100}%`, bottom:s.income >= 0 ? `${100-zero}%` : `${zero}%` }} title={`Чистая прибыль: ${money(s.income)}`}/><div className="bar expense-bar" style={{ height:`${Math.max(s.expense ? 2 : 0, s.expense / (max-min) * 100)}%`, bottom:`${100-zero}%` }} title={`Расходы: ${money(s.expense)}`}/></div><span>{new Date(`${s.key}-01T12:00:00`).toLocaleDateString('ru-RU',{month:'short'}).replace('.','')}</span></div>)}</div></div>;
}

export function Forecast({ points }: { points: { month: number; value: number }[] }) {
  const id = useId().replace(/:/g,''); const min = Math.min(0,...points.map(p=>p.value)); const max = Math.max(1,...points.map(p=>p.value));
  const x = (i:number) => 40 + i / (points.length - 1) * 620; const y = (v:number) => 175 - (v-min)/(max-min || 1)*145;
  const path = points.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p.value)}`).join(' ');
  return <svg className="forecast-chart" viewBox="0 0 700 215" role="img" aria-label={`Прогноз капитала на ${points.length-1} месяцев: ${money(points[points.length-1].value)}`}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF8F1F" stopOpacity=".24"/><stop offset="100%" stopColor="#FF8F1F" stopOpacity="0"/></linearGradient></defs>{[30,80,130,175].map(yy=><line key={yy} x1="40" x2="660" y1={yy} y2={yy} stroke="#262B35" strokeDasharray="4 5"/>)}<path d={`${path} L660,175 L40,175 Z`} fill={`url(#${id})`}/><path d={path} fill="none" stroke="#FF8F1F" strokeWidth="3" strokeLinejoin="round"/><circle cx="660" cy={y(points[points.length-1].value)} r="5" fill="#FF8F1F" stroke="#1A1D24" strokeWidth="3"/><text x="40" y="205" fill="#9AA1B0" fontSize="12">Сейчас</text><text x="660" y="205" textAnchor="end" fill="#9AA1B0" fontSize="12">Через {points.length-1} мес.</text></svg>;
}
export function SaveStatus({ status, platform }: { status: 'saved'|'saving'|'error'; platform?: string }) { return <span className={`save-status ${status === 'error' ? 'text-red' : ''}`}>{status === 'saved' ? <Check size={14}/> : <span className={`status-dot ${status === 'saving' ? 'pulse' : 'red'}`}/>} {status === 'saved' ? platform === 'android' ? 'Сохранено на телефоне' : 'Сохранено на ПК' : status === 'saving' ? 'Сохраняем…' : 'Ошибка сохранения'}</span>; }
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <Button onClick={onClick}><Plus size={18}/>{children}</Button>; }
