// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReminderSettings } from '../src/components/ReminderSettings';
let root:Root;let container:HTMLElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());container?.remove();delete (window as any).desktop;delete (window as any).MiKapitalNative;});
async function mount(){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(createElement(ReminderSettings)));}
it('toggles eight independent native categories without requiring permission and preserves state on save errors',async()=>{
  let settings:any={my_due:false,their_due:false,my_overdue:false,their_overdue:false,work:false,past_work:false,preparing:false,listed:false,allowed:false};let fail=false;let permission=0;
  (window as any).desktop={platform:'android'};
  (window as any).MiKapitalNative={reminderSettings:()=>JSON.stringify(settings),saveReminderSettings:(json:string)=>{if(fail)return '{"ok":false}';settings=JSON.parse(json);return '{"ok":true}';},requestNotificationPermission:()=>permission++};
  await mount();expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(8);
  await act(async()=>container.querySelector<HTMLInputElement>('input')!.click());expect(settings.my_due).toBe(true);expect(settings.their_due).toBe(false);
  fail=true;await act(async()=>container.querySelector<HTMLInputElement>('input')!.click());expect(settings.my_due).toBe(true);expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(true);expect(container.querySelector('[role=alert]')).not.toBeNull();
  await act(async()=>container.querySelector<HTMLButtonElement>('button')!.click());expect(permission).toBe(1);
  settings.allowed=true;await act(async()=>window.dispatchEvent(new Event('mi-kapital-reminders')));expect(container.textContent).toContain('Уведомления приложения разрешены.');
});
it('asks older Android shells to update instead of pretending native reminders exist',async()=>{
  (window as any).desktop={platform:'android'};await mount();expect(container.textContent).toContain('обновите Android-приложение');expect(container.querySelector('input')).toBeNull();
});
