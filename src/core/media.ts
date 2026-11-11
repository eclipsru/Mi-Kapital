import { MAX_PHOTO_CHARS, MAX_VOICE_CHARS, type VoiceNote } from './model';

export const photoAccept = 'image/jpeg,image/png,image/webp';
export function fileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать файл'));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}
// Photos are resized locally. No upload, EXIF location or original full-resolution file is retained.
export async function preparePhoto(file: File): Promise<string> {
  if (!photoAccept.split(',').includes(file.type)) throw new Error('Выберите фото JPG, PNG или WebP.');
  if (file.size > 15_000_000) throw new Error('Фото до обработки должно быть не больше 15 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось открыть фото. Попробуйте другой файл.')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('В файле нет изображения.');
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог обработать фото.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= MAX_PHOTO_CHARS) return result;
    }
    throw new Error('Фото слишком детальное. Выберите изображение поменьше.');
  } finally { URL.revokeObjectURL(url); }
}
export function recordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const isAndroid = typeof window !== 'undefined' && (window.desktop?.platform === 'android' || /Android/i.test(navigator.userAgent));
  const candidates = isAndroid ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find(type => MediaRecorder.isTypeSupported(type));
}
export async function prepareVoice(blob: Blob, seconds: number): Promise<VoiceNote> {
  if (!blob.size) throw new Error('Запись пустая. Попробуйте ещё раз.');
  if (blob.size * 4 / 3 > MAX_VOICE_CHARS - 100) throw new Error('Голосовая заметка слишком большая. Запишите не больше 90 секунд.');
  const mimeType = blob.type.split(';')[0].toLowerCase();
  if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'].includes(mimeType)) throw new Error('Этот формат аудио не поддерживается. Попробуйте приложение Windows.');
  const raw = await fileDataUrl(blob);
  // MediaRecorder may report `audio/webm;codecs=opus`; store a stable, validated MIME prefix.
  const payload = raw.slice(raw.indexOf(';base64,') + 8);
  const dataUrl = `data:${mimeType};base64,${payload}`;
  if (dataUrl.length > MAX_VOICE_CHARS) throw new Error('Голосовая заметка слишком большая.');
  return { mimeType, dataUrl, durationSeconds: Math.max(0.1, Math.round(seconds * 10) / 10) };
}
export function mediaError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Нет доступа к микрофону. Разрешите его в настройках Windows и приложения или напишите описание текстом.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Микрофон не найден. Подключите его или напишите описание текстом.';
  return error instanceof Error ? error.message : 'Не удалось записать аудио. Текстовое описание доступно.';
}
