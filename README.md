# ART Music Backend

REST-обёртка над неофициальным [API Яндекс.Музыки](https://ym.marshal.dev) для MVP-плеера.

**Стек:** Node.js 20+, TypeScript, Fastify → `https://api.music.yandex.net`  
**Совместимость:** логика запросов как у [yandex-music-api](https://github.com/MarshalX/yandex-music-api) (Python).

Базовый URL сервера: **`http://localhost:3001`** (порт 3001, чтобы не пересекаться с Neutralino на 3000).

---

## Ключевое из документации Яндекс.Музыки

Источник: [ym.marshal.dev](https://ym.marshal.dev)

| Тема | Суть |
|------|------|
| **Токен** | OAuth-токен аккаунта. Без него — только превью (~30 с). Получение: [раздел «Получение токена»](https://ym.marshal.dev). |
| **ID трека** | Формат `trackId:albumId` (из URL `music.yandex.ru/album/**albumId**/track/**trackId**`). Для стрима и метаданных надёжнее всегда с альбомом. |
| **Плейлист** | `userId` (владелец) + `kind` (номер плейлиста в URL). Пример: `music.yandex.ru/users/123/playlists/3` → `userId=123`, `kind=3`. |
| **Альбом** | Числовой `albumId` из URL альбома. С треками: `with-tracks` (у нас по умолчанию). |
| **Артист** | Числовой `artistId`. Полная карточка — `brief-info` (треки, альбомы, похожие и т.д.). |
| **Радио (rotor)** | Станция — строка вроде `user:onyourwave` («Моя волна»), `genre:rock`, `activity:workout`. Нужны feedback-события для очереди. |
| **Стрим** | `download-info` → XML → подписанная ссылка `get-mp3/...`. Ссылка живёт ~1 мин; наш `/stream` проксирует MP3 для `<audio>`. |
| **Язык** | Заголовок `Accept-Language` / `YANDEX_MUSIC_LANGUAGE` (`ru`, `en`, …). |

---

## Авторизация

Токен на бэкенде (рекомендуется для фронта):

```env
YANDEX_MUSIC_TOKEN=ваш_oauth_токен
```

Или в каждом запросе:

```http
Authorization: OAuth <token>
```

Для CORS с Vite (`localhost:5173`) в `.env` бэкенда:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

На фронте:

```env
VITE_API_URL=http://localhost:3001
```

---

## Эндпоинты

### Треки

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/tracks` | Несколько треков по ID (`body: { trackIds: string[] }`) |
| `GET` | `/api/tracks/:trackId` | Полная информация о треке (`full-info`) |
| `GET` | `/api/tracks/:trackId/stream` | Поток MP3 (прокси, для плеера) |
| `GET` | `/api/tracks/:trackId/stream-url` | Прямая ссылка на MP3 (~1 мин) |
| `GET` | `/api/tracks/:trackId/lyrics` | Текст (`?format=TEXT` или `LRC`) |

### Альбомы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/albums/:albumId` | Альбом **с треками** (по умолчанию) |
| `GET` | `/api/albums/:albumId?withTracks=false` | Только метаданные альбома |

Ответ: `{ "album": { ... } }` — структура как у API Яндекса (обложка, артисты, `volumes` / треки и т.д.).

### Плейлисты

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/playlists/:userId/:kind` | Плейлист со списком треков |

Ответ: `{ "playlist": { ... } }` — название, владелец, `tracks`, `trackCount`, обложка.

### Исполнители

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/artists/:artistId` | Страница артиста (`brief-info`: топ-треки, альбомы, похожие) |
| `GET` | `/api/artists/:artistId?brief=false` | Краткая карточка артиста |
| `POST` | `/api/artists` | Несколько артистов (`body: { artistIds: string[] }`) |

### Радио

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/radio/stations` | Список станций |
| `GET` | `/api/radio/dashboard` | Рекомендованные станции |
| `GET` | `/api/radio/stations/:stationId` | Инфо о станции |
| `POST` | `/api/radio/stations/:stationId/start` | Старт + первая порция треков |
| `GET` | `/api/radio/stations/:stationId/tracks` | Следующие треки (`?queue=trackId:albumId`) |
| `POST` | `/api/radio/stations/:stationId/feedback` | `radioStarted` / `trackStarted` / `trackFinished` / `skip` |

Станция «Моя волна»: `user:onyourwave` (в URL кодировать как `user%3Aonyourwave`).

Цикл радио:

1. `POST .../start` → `batchId`, `sequence[]`, `radioSessionId`
2. Воспроизвести трек: `/api/tracks/{id}:{albumId}/stream`
3. `POST .../feedback` — события прослушивания
4. `GET .../tracks?queue=...` — следующая порция

---

## Быстрый старт

```bash
cp .env.example .env
# YANDEX_MUSIC_TOKEN=...

npm install
npm run build
npm run start
```

Проверка: `GET http://localhost:3001/health` → `{ "status": "ok" }`  
Справка по маршрутам: `GET http://localhost:3001/api`

---

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка (hot-reload) |
| `npm run build` | Сборка в `dist/` |
| `npm start` | Продакшен |

---

## Прямые запросы

Подставьте свой токен вместо `TOKEN`. Для `trackId` с двоеточием в URL используйте кодирование (`%3A`) или кавычки в curl.

### cURL

```bash
# Health
curl http://localhost:3001/health

# ——— Трек ———
curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/tracks/10994777%3A1193829"

curl -H "Authorization: OAuth TOKEN" -o track.mp3 \
  "http://localhost:3001/api/tracks/122359018%3A29603287/stream"

# Несколько треков
curl -X POST http://localhost:3001/api/tracks \
  -H "Authorization: OAuth TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"trackIds\":[\"10994777:1193829\",\"40133452:5206873\"]}"

# ——— Альбом ———
curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/albums/29603287"

curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/albums/29603287?withTracks=false"

# ——— Плейлист ———
# music.yandex.ru/users/{userId}/playlists/{kind}
curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/playlists/123456789/3"

# ——— Исполнитель ———
curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/artists/29242"

curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/artists/29242?brief=false"

curl -X POST http://localhost:3001/api/artists \
  -H "Authorization: OAuth TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"artistIds\":[\"29242\",\"3121\"]}"

# ——— Радио: Моя волна ———
curl -X POST http://localhost:3001/api/radio/stations/user%3Aonyourwave/start \
  -H "Authorization: OAuth TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"web-player\"}"

curl -H "Authorization: OAuth TOKEN" \
  "http://localhost:3001/api/radio/stations/user%3Aonyourwave/tracks?queue=122359018%3A29603287"

curl -X POST http://localhost:3001/api/radio/stations/user%3Aonyourwave/feedback \
  -H "Authorization: OAuth TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"trackStarted\",\"batchId\":\"BATCH_ID\",\"trackId\":\"122359018:29603287\"}"
```

### fetch (TypeScript, фронт)

```typescript
const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const headers = {
  "Content-Type": "application/json",
  // Authorization: `OAuth ${token}`,  // если токен не на бэкенде
};

// Альбом
const album = await fetch(`${API}/api/albums/29603287`, { headers }).then((r) =>
  r.json(),
);

// Плейлист
const playlist = await fetch(`${API}/api/playlists/123456789/3`, {
  headers,
}).then((r) => r.json());

// Исполнитель (полная страница)
const artist = await fetch(`${API}/api/artists/29242`, { headers }).then((r) =>
  r.json(),
);

// Моя волна
const { radio } = await fetch(
  `${API}/api/radio/stations/${encodeURIComponent("user:onyourwave")}/start`,
  { method: "POST", headers, body: JSON.stringify({ from: "web-player" }) },
).then((r) => r.json());

// Плеер: trackId + albumId из radio.sequence[0].track
const t = radio.sequence[0].track;
const key = `${t.id}:${t.albums[0].id}`;
const audio = new Audio(`${API}/api/tracks/${encodeURIComponent(key)}/stream`);
audio.play();
```

---

## Ограничения

- Неофициальный API; Яндекс может менять контракт без предупреждения.
- Прямые MP3-URL истекают примерно за минуту — для UI используйте `/stream`.
- Соблюдайте [условия использования](https://yandex.ru/legal/music_termsofuse/) Яндекс.Музыки.
