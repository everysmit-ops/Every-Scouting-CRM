# Deployment Guide

## 1. Environment

Заполните production env:

```env
HOST=0.0.0.0
PORT=4173
DB_PROVIDER=postgres
POSTGRES_SSL=true
POSTGRES_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
```

## 2. Database

Проверка подключения:

```bash
npm run db:check
```

Проверка статуса миграций:

```bash
npm run db:status
```

Применить миграции:

```bash
npm run db:migrate
```

Если база пустая:

```bash
npm run db:bootstrap
```

## 3. Start

```bash
npm run start
```

## 4. Smoke

Health:

```bash
npm run smoke:health
```

Platform smoke:

```bash
npm run smoke:platform
```

## 5. Release checklist

- `POSTGRES_URL` указывает на production БД
- `npm run db:status` не показывает pending migrations
- demo-пароли и demo-пользователи заменены
- публичная заявка и логин проверены
- `/api/health` отвечает `ok`
- `smoke:platform` проходит
- в Render/облаке заданы `DB_PROVIDER=postgres` и `POSTGRES_SSL=true`

## 6. Rollout

1. Применить миграции
2. Выполнить smoke
3. Открыть сайт owner-аккаунтом
4. Проверить уведомления, кандидатов, чаты, финансы
5. Перевести команду на новый URL

## 7. Rollback

- откатить сервис на предыдущий deploy
- не выполнять destructive reset на production БД
- при проблеме с новыми полями откатывать код отдельно от данных
