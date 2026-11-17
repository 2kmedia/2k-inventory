# 2K Inventory

Система обліку складу та оренди обладнання (аналог Rentman) для власних задач. Інтерфейс українською, основна валюта — гривня.

ТЗ і план робіт (кроки 0–10) — у проєкті Claude «Програма для налагодження роботи складу та оренди».

## Стек

TypeScript скрізь: React + Vite (веб і PWA-сканер), Node.js + Fastify (API), PostgreSQL + Prisma.

## Структура

- `apps/api` — сервер і схема БД (`apps/api/prisma/schema.prisma`)
- `apps/web` — веб-інтерфейс
- `docker-compose.yml` — локальний PostgreSQL

## Локальний запуск

```bash
cp .env.example .env
npm install
npm run db:up                 # PostgreSQL (Docker або локальна, порт 5433)
cd apps/api
npx prisma migrate dev --name init   # створить таблиці й згенерує клієнт
cd ../..
npm run dev:api               # http://localhost:3000/api/health
npm run dev:web               # http://localhost:5173
```

## Статус

- [x] Крок 0: каркас і схема БД (потребує першої міграції на локальній машині)
- [x] Крок 1: імпорт INVENTORY (CSV) зі звітом про помилки (674 позиції імпортовано)
- [~] Крок 2: каталог у вебі (пошук, фільтри, картка, категорії) — перший варіант готовий

## Імпорт INVENTORY

Експортуйте вкладку INVENTORY у CSV (файли *.csv не потрапляють у git) і запустіть:

```bash
cd apps/api
npm run import:inventory -- "/шлях/до/файлу.csv" --dry   # пробний запуск, БД не чіпає
npm run import:inventory -- "/шлях/до/файлу.csv"         # імпорт у БД
```

Звіт з помилками й попередженнями пишеться в `import-report.txt`. Повторний запуск безпечний: позиції оновлюються за кодом.
