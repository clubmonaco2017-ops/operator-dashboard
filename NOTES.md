# Ключевые факты проекта: operator-dashboard

## Инфраструктура
- **GitHub**: репозиторий кода фронта
- **Vercel**: деплой фронта — `https://operator-dashboard-psi.vercel.app`
  - Env vars на Vercel: `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_KEY`
- **Supabase**: `https://akpddaqpggktefkdecrl.supabase.co` — данные + авторизация
- **Google Cloud** (`hourly-492015`): бэкенд-скрипт, пишет данные в Supabase каждый час

## Стек
- React + Vite + Tailwind CSS v4
- Supabase JS client (anon key для обычных запросов, service key для admin-операций)
- Кастомная авторизация через localStorage (не Supabase Auth)
  - Сессия хранится как `auth_session` в localStorage
  - Вход: `supabase.rpc('auth_login', {email, password})`

## Supabase клиенты
- **Обычный** (`src/supabaseClient.js`): anon key, для чтения данных
- **Admin** (`src/supabaseAdmin.js`): service key (lazy init через `getSupabaseAdmin()`), для управления пользователями

## Env vars (`.env.local`)
```
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_SERVICE_KEY=sb_secret_...  # НЕ КОММИТИТЬ
```

## Авторизация
- Суперадмин управляет пользователями через `AdminPanel.jsx`
- Права: `can_view_revenue`, `can_view_chart`, `can_view_top`
- PostgreSQL функции с `SECURITY DEFINER`: `auth_login`, `auth_get_users`, `auth_create_user` и др.

## Таблицы Supabase (данные от бэкенда)
- `hourly_revenue` — почасовые дельты: PK `(refcode, date, hour)`, колонка `delta`
  - delta > 0 = оператор работал в этот час
  - Нет записи = прочерк (—) на дашборде
  - delta=0 не записывается
- `snapshot` — per-client кумулятив Tableau: PK `(refcode, client_id)`, колонки: `cumulative`, `updated_at`

## Важные особенности данных
- Данные поступают с задержкой ~1 час (Tableau обновляет Max Hour раз в час UTC)
- Выручка считается как дельта кумулятива между запусками, по парам (оператор, клиент)
- Шум округления < $0.10 отфильтрован на бэкенде
