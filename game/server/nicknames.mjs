import { randomInt } from 'node:crypto';

// Ник собирается из готовых безопасных слов: «КосмоКот83», «СинийДракон42».
// Существительные мужского рода, чтобы прилагательные согласовывались.
export const NICKNAME_PREFIXES = Object.freeze([
  'Космо', 'Робо', 'Кибер', 'Турбо', 'Мега', 'Гига', 'Нано', 'Пиксель', 'Лазер', 'Астро',
  'Синий', 'Смелый', 'Быстрый', 'Весёлый', 'Хитрый', 'Ловкий', 'Яркий', 'Тихий', 'Лунный', 'Звёздный',
  'Солнечный', 'Морской', 'Огненный', 'Добрый',
]);
export const NICKNAME_NOUNS = Object.freeze([
  'Кот', 'Лис', 'Ёж', 'Енот', 'Барсук', 'Дракон', 'Волк', 'Тигр', 'Пингвин', 'Филин',
  'Кит', 'Краб', 'Жук', 'Бобр', 'Сокол', 'Медведь', 'Лемур', 'Хомяк', 'Дельфин', 'Мамонт',
  'Суслик', 'Орёл', 'Крот', 'Заяц',
]);

// Первые попытки — с двумя цифрами, потом с тремя: так ник не упирается в занятые сочетания.
export function generateNickname(attempt = 0, pick = randomInt) {
  const prefix = NICKNAME_PREFIXES[pick(0, NICKNAME_PREFIXES.length)];
  const noun = NICKNAME_NOUNS[pick(0, NICKNAME_NOUNS.length)];
  const number = attempt < 10 ? pick(10, 100) : pick(100, 1000);
  return `${prefix}${noun}${number}`;
}
