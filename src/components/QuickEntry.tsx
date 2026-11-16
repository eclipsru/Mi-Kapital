import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field } from './ui';
import { accountRoles, capitalFundingAvailable, liquidAccounts, parseMoney, roleAccount, saveMovement, today, uid, validDate, workKindFields, workKinds, type AppData, type DebtDirection, type WorkKind } from '../core/model';
import { validateData } from '../core/storage';

export const quickTypes = [['expense','Расход'], ['income','Доход'], ['debt','Долг'], ['product','Товар'], ['work','Работа']] as const;
type Kind = typeof quickTypes[number][0];
const routeKind = (): Kind => { const key = new URLSearchParams(window.location.hash.split('?')[1]).get('type'); return quickTypes.some(([k]) => k === key) ? key as Kind : 'expense'; };
export function QuickEntry({ data, onSave, onClose, onOpenApp }: { data: AppData; onSave: (data: AppData) => Promise<void>; onClose: () => Promise<void>; onOpenApp: () => Promise<void> }) {
  const [kind, setKind] = useState<Kind>(routeKind);
  const [visited, setVisited] = useState<Kind[]>([kind]);
  const [versions, setVersions] = useState<Partial<Record<Kind,number>>>({});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  function select(k: Kind) { if(busy)return;setKind(k);setVisited(v=>v.includes(k)?v:[...v,k]);setMessage('');setError(''); }
  useEffect(()=>{const route=()=>select(routeKind());window.addEventListener('hashchange',route);return()=>window.removeEventListener('hashchange',route);});
  async function save(next: AppData) { setBusy(true);setError('');setMessage('');try{await onSave(next);setVersions(v=>({...v,[kind]:(v[kind]??0)+1}));setMessage('Сохранено на телефоне');}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function leave(action:()=>Promise<void>){if(busy)return;try{await action();}catch(e){setError((e as Error).message);}}
  return <main className="quick-entry"><header><strong>Быстрое добавление</strong><button type="button" aria-label="Закрыть быстрое добавление" disabled={busy} onClick={()=>void leave(onClose)}>×</button></header>
    <div className="quick-tabs" role="tablist" aria-label="Тип записи">{quickTypes.map(([k,label])=><button type="button" role="tab" id={`quick-tab-${k}`} aria-controls={`quick-panel-${k}`} aria-selected={kind===k} disabled={busy} key={k} onClick={()=>select(k)}>{label}</button>)}</div>
    {quickTypes.map(([k])=><div key={k} id={`quick-panel-${k}`} role="tabpanel" aria-labelledby={`quick-tab-${k}`} hidden={kind!==k}>{visited.includes(k)&&<QuickForm key={versions[k]??0} kind={k} data={data} busy={busy} onSave={save}/>}</div>)}
    {message&&<p className="text-green" role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error} Не закрывайте окно при ошибке записи; повторите сохранение или откройте приложение.</p>}
    <button className="text-link" disabled={busy} onClick={()=>void leave(onOpenApp)}>Открыть полное приложение</button>
  </main>;
}
function QuickForm({kind,data,busy,onSave}:{kind:Kind;data:AppData;busy:boolean;onSave:(data:AppData)=>Promise<void>}) {
  const [title,setTitle]=useState(''); const [amount,setAmount]=useState('');const [date,setDate]=useState(today());
  const [account,setAccount]=useState(kind==='expense'?roleAccount(data,'hand')?.id??data.accounts[0]?.id??'':kind==='product'?roleAccount(data,'capital')?.id??liquidAccounts(data)[0]?.id??'':data.accounts[0]?.id??'');
  const [person,setPerson]=useState(''); const [direction,setDirection]=useState<DebtDirection>('i_owe');const [goods,setGoods]=useState(false);
  const [source,setSource]=useState<'capital'|'pocket'>('capital');const [work,setWork]=useState<WorkKind>('Ремонт');const [cost,setCost]=useState('');const [due,setDue]=useState('');const [note,setNote]=useState('');const [error,setError]=useState('');
  // Stable id makes a retry after a disk failure replace, never duplicate, the in-memory record.
  const [id]=useState(uid);
  const isCapital=kind==='expense'&&roleAccount(data,'capital')?.id===account;
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');try{
    const value=kind==='product'&&!amount.trim()?0:parseMoney(amount);
    if(!title.trim())throw new Error('Укажите название.');
    if(value===null||value<0||(kind!=='product'&&value===0))throw new Error('Введите корректную сумму.');
    if(!validDate(date)||due&&!validDate(due)||due&&due<date)throw new Error('Проверьте дату и срок возврата.');
    if(['expense','income','work'].includes(kind)&&!data.accounts.some(a=>a.id===account))throw new Error('Сначала создайте счёт в полном приложении.');
    const common={id,title:title.trim(),amountKopecks:value,date,accountId:account,note:note.trim()};let next=data;
    if(kind==='expense')next=saveMovement(data,{...common,kind:'expense'},isCapital);
    if(kind==='income'||kind==='work'){
      const costs=cost.trim()?parseMoney(cost):0;if(costs===null)throw new Error('Проверьте расходы на работу.');
      // Quick income is a net job receipt, not an unlinked product sale. Product sales stay in product cards.
      const income={...common,category:'Шабашки',costKopecks:kind==='work'?costs:0,...(kind==='work'?{work:{kind:work,values:{[workKindFields[work][0].key]:title.trim()}}}:{})};
      next={...data,incomes:[...data.incomes.filter(i=>i.id!==id),income]};
    }
    if(kind==='debt'){
      if(!person.trim())throw new Error('Укажите человека.');
      const debt={id,title:title.trim(),counterparty:person.trim(),direction,principalKopecks:value,date,dueDate:due,note:note.trim(),initialAccountId:direction==='i_owe'&&!goods?roleAccount(data,'hand')?.id??null:null,payments:data.debts.find(d=>d.id===id)?.payments??[],...(direction==='i_owe'?{loanReceipt:goods?'goods' as const:'cash' as const}:{})};
      next={...data,debts:[...data.debts.filter(d=>d.id!==id),debt]};
    }
    if(kind==='product'){
      if(data.products?.find(p=>p.id===id)?.sale)throw new Error('Товар уже продан на другом устройстве. Откройте его в полном приложении.');
      if(value&&source==='capital'&&!liquidAccounts(data).some(a=>a.id===account))throw new Error('Выберите наличный или банковский счёт капитала.');
      if(source==='capital'&&value>capitalFundingAvailable(data,data.products?.find(p=>p.id===id)))throw new Error('В капитале недостаточно средств.');
      const product={id,kind:title.trim(),purchaseDate:date,description:note.trim(),photos:[],createdAt:data.products?.find(p=>p.id===id)?.createdAt??new Date().toISOString(),status:'preparing' as const,funding:value?[{source,amountKopecks:value,accountId:source==='capital'?account:''}]:[]};
      next={...data,products:[...(data.products??[]).filter(p=>p.id!==id),product]};
    }
    await onSave(validateData(next));
  }catch(e){setError((e as Error).message);}}
  return <form className="quick-form" onSubmit={submit}><fieldset disabled={busy}>
    <Field label={kind==='product'?'Товар':'Название'}><input className="inp" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
    <div className="form-row"><Field label={kind==='product'?'Цена покупки, ₽':'Сумма, ₽'}><input className="inp" inputMode="decimal" required={kind!=='product'} placeholder={kind==='product'?'0 — бесплатно':'0,00'} value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label="Дата"><input className="inp" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></Field></div>
    {kind==='debt'&&<><div className="form-row"><Field label="Направление"><select className="inp" value={direction} onChange={e=>setDirection(e.target.value as DebtDirection)}><option value="i_owe">Я должен</option><option value="owed_to_me">Мне должны</option></select></Field><Field label="Человек"><input className="inp" required maxLength={100} list="quick-people" value={person} onChange={e=>setPerson(e.target.value)}/><datalist id="quick-people">{[...new Set([...(data.people??[]).map(p=>p.name),...data.debts.map(d=>d.counterparty)])].map(p=><option key={p} value={p}/>)}</datalist></Field></div>{direction==='i_owe'&&<label className="checkbox-label"><input type="checkbox" checked={goods} onChange={e=>setGoods(e.target.checked)}/>Взял товаром — без зачисления в «Руки»</label>}</>}
    {kind==='product'&&<Field label="Источник покупки"><select className="inp" value={source} onChange={e=>setSource(e.target.value as typeof source)}><option value="capital">Капитал</option><option value="pocket">Из кармана — без списания</option></select></Field>}
    {(kind!=='debt'&&(kind!=='product'||source==='capital'))&&<Field label="Счёт"><select className="inp" required={kind!=='product'||(parseMoney(amount)??0)>0} value={account} onChange={e=>setAccount(e.target.value)}><option value="">Выберите счёт</option>{(kind==='product'?liquidAccounts(data):data.accounts).map(a=><option key={a.id} value={a.id}>{a.name}{a.role?` · ${accountRoles[a.role]}`:''}</option>)}</select></Field>}
    {kind==='work'&&<div className="form-row"><Field label="Вид работы"><select className="inp" value={work} onChange={e=>setWork(e.target.value as WorkKind)}>{workKinds.map(k=><option key={k}>{k}</option>)}</select></Field><Field label="Расходы на работу, ₽"><input className="inp" inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} placeholder="0"/></Field></div>}
    {isCapital&&<p className="field-hint">Уменьшит капитал и создаст «Долг в капитал». Возврат восстановит сумму.</p>}
    {kind==='income'&&<p className="field-hint">Чистый доход без затрат, учитывается в «Шабашках» с распределением 15/70/15. Продажу товара оформляйте в его карточке.</p>}
    <details><summary>Дополнительно</summary>{kind==='debt'&&<Field label="Срок возврата"><input className="inp" type="date" min={date} value={due} onChange={e=>setDue(e.target.value)}/></Field>}<Field label="Заметка"><textarea className="inp" rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></Field></details>
    {error&&<p className="form-error" role="alert">{error}</p>}<Button type="submit" className="wide">{busy?'Сохраняем…':'Добавить'}</Button>
  </fieldset></form>;
}
