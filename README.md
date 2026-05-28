# ART Music Backend

MVP REST API поверх неофициального [API Яндекс.Музыки](https://ym.marshal.dev).

**Стек:** Node.js 20+, TypeScript, Fastify. Прямые HTTP-запросы к `api.music.yandex.net` (логика совместима с [yandex-music-api](https://github.com/MarshalX/yandex-music-api)).

## Возможности MVP

| Задача | Эндпоинты |
|--------|-----------|
| Прослушивание | `GET /api/tracks/:trackId/stream` (прокси MP3), `GET .../stream-url` |
| Метаданные трека / альбома / плейлиста / артиста | `GET /api/tracks/:id`, `GET /api/albums/:id`, `GET /api/playlists/:userId/:kind`, `GET /api/artists/:id` |
| Радио (rotor) | `GET /api/radio/stations`, `POST /api/radio/stations/:id/start`, `GET .../tracks`, `POST .../feedback` |

## Быстрый старт

```bash
cp .env.example .env
# Вставьте OAuth-токен: https://ym.marshal.dev — «Получение токена»

npm install
npm run dev
```

Сервер: `http://localhost:3001` (порт **3001**, чтобы не конфликтовать с Neutralino на 3000)  
Список маршрутов: `GET /api`

## Авторизация

Токен Яндекс.Музыки обязателен для полного трека и радио (без токена Яндекс отдаёт ~30 с превью).

- Переменная окружения `YANDEX_MUSIC_TOKEN`
- или заголовок `Authorization: OAuth <token>`

## Примеры

```bash
# Трек (id в формате trackId:albumId или только trackId)
curl -H "Authorization: OAuth TOKEN" http://localhost:3001/api/tracks/10994777:1193829

# Поток в плеер
curl -H "Authorization: OAuth TOKEN" -o track.mp3 \
  http://localhost:3001/api/tracks/10994777:1193829/stream

# Альбом с треками
curl -H "Authorization: OAuth TOKEN" http://localhost:3001/api/albums/1193829

# Плейлист (userId + kind из URL music.yandex.ru)
curl -H "Authorization: OAuth TOKEN" http://localhost:3001/api/playlists/123456/3

# Артист (brief-info — полная страница)
curl -H "Authorization: OAuth TOKEN" http://localhost:3001/api/artists/3121

# «Моя волна»
curl -X POST -H "Authorization: OAuth TOKEN" \
  http://localhost:3001/api/radio/stations/user:onyourwave/start
```

### Радио: типичный цикл

1. `POST /api/radio/stations/user:onyourwave/start` — `radioStarted` + первая порция треков (`batchId`, `sequence`).
2. Для каждого трека: `POST .../feedback` с `trackStarted` / `trackFinished` / `skip`.
3. `GET .../tracks?queue=<id_предыдущего_трека>` — следующие треки.

Станции: `genre:rock`, `activity:workout`, `track:12345` и т.д. — см. [документацию rotor](https://ym.marshal.dev).

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка с hot-reload |
| `npm run build` | Сборка в `dist/` |
| `npm start` | Продакшен |

## Ограничения

- Неофициальный API; возможны изменения со стороны Яндекса.
- Прямые ссылки на MP3 живут ~1 минуту — для плеера предпочтителен `/stream`.
- Использование — на ваш риск; соблюдайте условия сервиса Яндекс.Музыки.
