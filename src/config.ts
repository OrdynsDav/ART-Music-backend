import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  yandexToken: process.env.YANDEX_MUSIC_TOKEN?.trim() ?? '',
  yandexLanguage: process.env.YANDEX_MUSIC_LANGUAGE?.trim() || 'ru',
};
