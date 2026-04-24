# Database migrations

Versioned SQL files. Apply в Supabase SQL Editor **in order**.

## Naming
`YYYYMMDD_NN_description.sql`

## How to apply
1. Открыть Supabase Dashboard → SQL Editor → New query
2. Скопировать содержимое файла миграции
3. Нажать Run
4. Проверить результат (каждая миграция содержит блок `-- VERIFY`)
5. Коммитить файл в репозиторий

## Rollback
Каждая миграция должна иметь комментарий `-- ROLLBACK` с обратным SQL (если применимо).
