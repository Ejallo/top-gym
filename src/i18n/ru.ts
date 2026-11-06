// Russian UI strings. Every visible text lives here under a key;
// a German dictionary (de.ts) with the same keys will be added later.
export const ru = {
  'app.name': 'TOP GYM',

  'tab.workout': 'Трен.',
  'tab.calendar': 'Календ.',
  'tab.progress': 'Прогр.',
  'tab.exercises': 'Упраж.',

  'home.week': 'Неделя {n}',
  'home.noProgram.title': 'Нет программы',
  'home.noProgram.text': 'Импортируй недельный план от Claude или начни свободную тренировку.',
  'home.free': 'Свободная',
  'home.import': 'Импорт плана',
  'home.soon': 'Появится на следующих этапах',

  'calendar.legend': '■ сделано   ┅ запланировано',
  'calendar.empty': 'Тренировок пока нет',

  'progress.title': 'Прогресс',
  'progress.empty': 'Графики появятся после первых тренировок',

  'exercises.title': 'Упражнения',
  'exercises.empty': 'База из 400 упражнений появится на этапе 1',

  'settings.title': 'Настройки',
  'settings.back': '← Назад',
  'settings.version': 'Версия',
  'settings.update.check': 'Проверить обновления',
  'settings.update.checking': 'Проверяю…',
  'settings.update.available': 'Есть новая версия',
  'settings.update.install': 'Обновить',
  'settings.update.latest': 'У тебя последняя версия',
  'settings.update.offline': 'Нет связи с сервером',
  'settings.update.force': 'Всё равно перезагрузить',
  'settings.language': 'Язык',
  'settings.storage': 'Хранилище',
  'settings.storage.persisted': 'Данные защищены от удаления',
  'settings.storage.notPersisted': 'Установи на экран «Домой», чтобы iOS не стёрла данные',
  'settings.backup': 'Бэкап',
  'settings.backup.soon': 'Экспорт и импорт появятся на этапе 5',

  'banner.update': 'Вышла новая версия',
  'banner.update.action': 'Обновить',
} as const;

export type Key = keyof typeof ru;
