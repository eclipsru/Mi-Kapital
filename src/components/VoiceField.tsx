import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { MAX_VOICE_SECONDS, type VoiceNote } from '../core/model';
import { mediaError, prepareVoice, recordingMime } from '../core/media';
import { Button, Field } from './ui';

export function VoiceField({ label = 'Заметка · необязательно', value, onChange, voice, onVoiceChange, onBusyChange, rows = 2, placeholder = 'Детали, которые важно не забыть' }: { label?: string; value: string; onChange: (value: string) => void; voice?: VoiceNote; onVoiceChange: (voice?: VoiceNote) => void; onBusyChange?: (busy: boolean) => void; rows?: number; placeholder?: string }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(voice?.durationSeconds ?? 0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const alive = useRef(true);
  useEffect(() => { onBusyChange?.(recording || busy); }, [recording, busy, onBusyChange]);
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
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  async function toggle() {
    setError('');
    if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.stop(); return; }
    const mimeType = recordingMime();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) return setError('В этом браузере запись недоступна. Используйте приложение Windows или Android либо введите текст.');
    setBusy(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!alive.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const current = new MediaRecorder(input, { mimeType, audioBitsPerSecond: 48000 });
      recorder.current = current;
      const chunks: BlobPart[] = [];
      started.current = Date.now(); setSeconds(0); setRecording(true);
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => { stopTracks(); if (alive.current) { setRecording(false); setBusy(false); setError('Не удалось записать аудио. Попробуйте ещё раз или введите текст.'); } };
      current.onstop = async () => {
        const duration = (Date.now() - started.current) / 1000;
        stopTracks();
        try { const note = await prepareVoice(new Blob(chunks, { type: current.mimeType || mimeType }), duration); if (alive.current) { onVoiceChange(note); setSeconds(note.durationSeconds); } }
        catch (e) { if (alive.current) setError(mediaError(e)); }
        finally { if (alive.current) { setRecording(false); setBusy(false); } }
      };
      current.start(250);
      timer.current = setInterval(() => {
        const elapsed = (Date.now() - started.current) / 1000;
        if (alive.current) setSeconds(Math.min(MAX_VOICE_SECONDS, Math.floor(elapsed)));
        if (elapsed >= MAX_VOICE_SECONDS && current.state !== 'inactive') current.stop();
      }, 250);
    } catch (e) { stopTracks(); if (alive.current) { setError(mediaError(e)); setBusy(false); } }
  }
  return <div className="voice-note-field"><Field label={label}><textarea className="inp" rows={rows} maxLength={2000} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/></Field><div className="voice-field"><div className="voice-controls"><Button type="button" variant={recording ? 'danger' : 'secondary'} disabled={busy && !recording} onClick={() => void toggle()}>{recording ? <Square size={15}/> : <Mic size={16}/>} {recording ? 'Остановить запись' : voice ? 'Перезаписать заметку' : 'Записать голосом'}</Button><span className={recording ? 'recording-indicator' : 'muted small'}>{recording && <i/>}{recording || seconds ? `${seconds} / ${MAX_VOICE_SECONDS} сек.` : 'Аудиозаметка · до 90 секунд'}</span>{voice && !recording && <button type="button" className="text-link" onClick={() => { onVoiceChange(undefined); setSeconds(0); }}>Удалить аудио</button>}</div>{voice && !recording && <audio controls src={voice.dataUrl} aria-label={`Аудио: ${label}`}/>}<span className="field-hint">Запись только по кнопке. Сохраняется аудио, не автоматическая расшифровка. При синхронизации аудио передаётся вместе с данными.</span>{error && <p className="form-error" role="alert">{error}</p>}</div></div>;
}
