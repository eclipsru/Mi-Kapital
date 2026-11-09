// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { prepareVoice, mediaError } from '../src/core/media';
import { validateData } from '../src/core/storage';
import { emptyData } from '../src/core/model';
describe('local voice notes',()=>{
  it('normalizes recorder codec parameters and survives data validation',async()=>{
    const note=await prepareVoice(new Blob([new Uint8Array([1,2,3])],{type:'audio/webm;codecs=opus'}),2.34);
    expect(note).toEqual({mimeType:'audio/webm',dataUrl:'data:audio/webm;base64,AQID',durationSeconds:2.3});
    const d={...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash' as const,openingKopecks:1000,createdAt:'2026-01-01'}],products:[{id:'g',kind:'Телефон',purchaseDate:'2026-01-01',funding:[{source:'capital' as const,accountId:'a',amountKopecks:100}],description:'',photos:[],voice:note,createdAt:'2026-01-01'}]};
    expect(validateData(d).products![0].voice).toEqual(note);
  });
  it('rejects empty, unsupported and oversized recordings with readable errors',async()=>{
    await expect(prepareVoice(new Blob([],{type:'audio/webm'}),1)).rejects.toThrow('пустая');
    await expect(prepareVoice(new Blob([new Uint8Array([1])],{type:'video/webm'}),1)).rejects.toThrow('не поддерживается');
    await expect(prepareVoice(new Blob([new Uint8Array(1_200_000)],{type:'audio/webm'}),10)).rejects.toThrow('слишком большая');
    expect(mediaError(Object.assign(new Error('denied'),{name:'NotAllowedError'}))).toContain('Нет доступа к микрофону');
  });
});
