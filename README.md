# Every Scouting

Локальная full-stack основа HR-платформы для скаутов, тимлидов и главного администратора с разделением на `frontend` и `backend`.

## Запуск

1. Запустите локальный сервер:

```bash
node server.js
```

2. Затем откройте `http://127.0.0.1:4173`.

## Demo-аккаунты

- `owner@scoutflow.local` / `demo123`
- `lead@scoutflow.local` / `demo123`
- `scout@scoutflow.local` / `demo123`
- `referral@scoutflow.local` / `demo123`

## Что уже есть

- авторизация и сессии;
- роли и базовые права доступа;
- публичная landing-страница с формой заявки;
- внутренняя CRM-панель по ролям;
- кандидаты, офферы, команды, задачи, обучение;
- форум, новости, уведомления, команды;
- профиль, подписки, рефералы, KPI и ТОПы;
- аудит действий;
- хранение данных в `db.json` через backend API.

## Структура проекта

```text
/frontend
  index.html
  app.js
  styles.css

/backend
  /data
    db.json
    schema.postgres.sql
    seed.postgres.sql
    store.js
  /lib
    auth.js
    config.js
    domain.js
    http.js
  /repositories
    fileRepository.js
  /routes
    api.js
  /services
    platformService.js
  server.js

/server.js
/package.json
/.env.example
/.env.production.example
/Dockerfile
/render.yaml
/DEPLOYMENT.md
```

## Что готово для следующего этапа

- frontend и backend больше не смешаны в одном слое;
- backend разбит на config, auth, http, repository, service и routes;
- проще переводить данные в PostgreSQL и выносить маршруты по модулям;
- проще подключать деплой, env-конфиги и отдельный production build pipeline.

## Команды

```bash
npm run start
npm run check
npm run export:seed
npm run db:check
npm run db:init
npm run db:migrate
npm run db:status
npm run db:bootstrap
npm run db:reset
npm run smoke:health
npm run smoke:platform
```

## PostgreSQL-подготовка

- [backend/data/schema.postgres.sql](/Users/sleemy/Documents/Playground/backend/data/schema.postgres.sql) содержит базовую схему таблиц;
- `npm run export:seed` генерирует `backend/data/seed.postgres.sql` из текущего `db.json`;
- `.env.example` уже содержит переключатель `DB_PROVIDER`;
- текущий `DB_PROVIDER=file` оставляет сайт рабочим прямо сейчас;
- при переходе на PostgreSQL нужно реализовать адаптер в [postgresRepository.js](/Users/sleemy/Documents/Playground/backend/repositories/postgresRepository.js).

## Как перейти на PostgreSQL

1. Создайте `.env` из `.env.example`
2. Укажите `POSTGRES_URL`
3. Проверьте соединение:

```bash
npm run db:check
```

4. Сгенерируйте свежий seed при необходимости:

```bash
npm run export:seed
```

5. Примените миграции и seed:

```bash
npm run db:init
```

6. Переключите:

```env
DB_PROVIDER=postgres
```

**Cloud Deploy**

Проект уже подготовлен к облачному запуску:
- health endpoint: [/api/health](http://127.0.0.1:4173/api/health)
- docker build: [Dockerfile](/Users/sleemy/Documents/Playground/Dockerfile)
- Render config: [render.yaml](/Users/sleemy/Documents/Playground/render.yaml)
- `.gitignore` уже исключает `.env` и `node_modules`

Для Render:
1. Подключите репозиторий.
2. Render прочитает [render.yaml](/Users/sleemy/Documents/Playground/render.yaml).
3. В env vars укажите `POSTGRES_URL`.
4. После деплоя healthcheck пойдет в `/api/health`.

Для Railway/Fly/Docker:
- используйте [Dockerfile](/Users/sleemy/Documents/Playground/Dockerfile)
- выставьте env vars:
  `HOST=0.0.0.0`
  `PORT=4173`
  `DB_PROVIDER=postgres`
  `POSTGRES_SSL=true`
  `POSTGRES_URL=...`

## Production DB flow

Для более безопасной выкладки:

1. Проверить подключение:
```bash
npm run db:check
```
2. Посмотреть статус миграций:
```bash
npm run db:status
```
3. Применить только миграции:
```bash
npm run db:migrate
```
4. Если база пустая, выполнить bootstrap:
```bash
npm run db:bootstrap
```

`db:bootstrap` применяет миграции и заливает seed только если в базе еще нет пользователей.

Подробный production rollout:
- [DEPLOYMENT.md](/Users/sleemy/Documents/Playground/DEPLOYMENT.md)

## Следующий продакшен-этап

- полноценная база данных вместо `db.json`;
- JWT/cookie auth, refresh-токены и управление сессиями;
- WebSocket-чаты и live-уведомления;
- платежная/выплатная логика;
- управление пользователями и onboarding-флоу;
- файловые вложения, аналитика и аудит действий.
