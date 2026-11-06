# Мой капитал

Личное приложение для учёта доходов, товаров на перепродажу, инвестиций и долгов. Интерфейс построен на React + TypeScript + Vite. Общая веб-кодовая база подготавливается для запуска в Android через Capacitor и для Windows через Electron.

## Требования

- Node.js 20.19+ или 22.12+ и npm.
- Для APK: Android Studio, Android SDK и JDK 21.
- Для Windows installer: сборка на Windows или настроенный Windows cross-build toolchain.
- Для облачной синхронизации: Supabase-проект с применённой SQL-миграцией и настроенным Supabase Auth.

## Запуск в браузере

```bash
npm install
cp .env.example .env
npm run dev
```

Если `.env` не заполнен, приложение использует локальное хранилище браузера. Эти записи не синхронизируются с другими устройствами. Не удаляйте данные сайта, пока не настроено облако.

## Supabase

1. В Supabase Dashboard откройте SQL Editor и примените `supabase/migrations/202611060001_initial_schema.sql`.
2. Включите Email/Password в Authentication → Providers и создайте пользователя в Authentication → Users. Регистрация из интерфейса приложения закрыта.
3. Скопируйте Project URL и anon/publishable key из Settings → API в `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-or-publishable-key>
```

Используйте только публичный anon/publishable ключ. Никогда не помещайте `service_role`/secret key в `.env` клиентского приложения, Git, Android или Windows bundle. Доступ к данным ограничивается Supabase Auth и RLS-политиками миграции.

4. Перезапустите dev-server. В форме входа используйте созданный аккаунт.

Приложение синхронизирует записи через `public.ledger_entries`, обновляет данные при загрузке/ручном обновлении и слушает Supabase Realtime для изменений в том же аккаунте. Голосовые заметки хранятся отдельно в закрытом bucket `voice-notes`.

## Android APK

```bash
npm install
npx cap add android       # один раз, если папки android ещё нет
npm run android:sync
npx cap open android
```

В Android Studio выберите Build → Build Bundle(s) / APK(s) → Build APK(s). Для выпуска в Google Play создайте собственный signing key и соберите signed APK/AAB. Права микрофона и поведение WebView следует проверить в Android Studio перед передачей приложения.

## Windows EXE/installer

```bash
npm install
npm run build
npm run desktop:build
```

Electron Builder создаёт NSIS installer в `release/`. Сборку необходимо запускать на Windows для надёжного формирования Windows installer. Для локального запуска desktop shell: `npm run desktop:dev`.

## Автоматическая сборка и ссылки на файлы

Workflow `.github/workflows/build-apps.yml` запускает сборку после push в рабочую ветку или вручную через GitHub Actions → **Build Android APK and Windows installer** → **Run workflow**. При ручном запуске выберите `publish_release=true`, чтобы добавить APK и EXE как прямые скачиваемые файлы в публичный GitHub pre-release. Без этой настройки доступны build artifacts `mi-kapital-android-apk` и `mi-kapital-windows-exe` на странице запуска (хранятся 30 дней).

Чтобы эти сборки подключались к общей базе, до запуска workflow добавьте GitHub Actions secret с именем `VITE_SUPABASE_ANON_KEY` и значением публичного anon/publishable key из Supabase. Не добавляйте service_role key. Если secret не задан, APK и EXE будут собираться в локальном режиме без облачной синхронизации.

## Проверка

```bash
npm run build
```

## Финансовые принципы

См. `docs/DATA_MODEL.md`. На главной выручка, вложения, прибыль и остатки долгов отображаются отдельно. Текущая сводка охватывает всё время; фильтр периодов будет реализован отдельно.
