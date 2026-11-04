# Стройка — мини-CRM

React + TypeScript + Supabase. [Рабочее приложение](https://stroika-crm-gegez-nov26.gegezahage.chatgpt.site). Доступы передаются отдельно.

## Запуск

Нужны Node.js 24+ и npm.

1. Выполните `npm ci`.
2. В новом Supabase-проекте выполните [миграцию](supabase/migrations/202611040001_crm.sql) через SQL Editor. В Authentication отключите самостоятельную регистрацию, оставив вход по email и паролю.
3. Скопируйте `.env.example` в `.env.local`: задайте `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, оставьте `VITE_DEMO_MODE=false`.
4. Для пустой базы задайте в окружении `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` и выполните `npm run seed`. Скрипт создаст 3 пользователей, 3 объекта и 8 задач; доступы сохранит в `demo-credentials.json`.
5. Запустите `npm run dev`.

В готовом проекте миграция и seed уже выполнены. Административный ключ нельзя помещать в `VITE_*` или Git; после seed удалите его из окружения. Пароли передавайте отдельно.

## Команды

- `npm run build` — проверка TypeScript и сборка.
- `npm run preview` — просмотр сборки.
- `npm test` — SQL-тесты.
- `npm run test:api` — проверка тестового Supabase; задайте `CRM_TEST_CREDENTIALS` — путь к файлу доступов. Создаёт и скрывает временные записи.

[Для руководителя](docs/for-manager.md) · [Решения и ограничения](docs/decisions.md) · [Проверки](docs/verification.md).
