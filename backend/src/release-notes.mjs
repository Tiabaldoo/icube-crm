import { ApiProblem } from './catalog.mjs';

const VERSION = '1.1';
const extra = { title: 'Разовые отработки', body: 'Теперь на отдельное занятие можно добавить ребёнка другого направления. Например, ребёнок с Программирования может прийти на занятие группы Робототехники для отработки. Его посещение будет учтено по его собственному направлению.' };
const photos = { title: 'Фото из галереи', body: 'Теперь при добавлении фото можно сразу сфотографировать ребёнка или выбрать уже сделанную фотографию из галереи телефона или файлов устройства.' };
export function releaseForRoles(roles = []) {
  const manager = roles.some((role) => ['director', 'partner'].includes(role));
  if (!manager && !roles.includes('teacher')) return null;
  return { version: VERSION, title: 'Что нового в версии 1.1', sections: [
    ...(manager ? [{ title: 'Смешанные группы', body: 'Теперь при создании или редактировании группы можно выбрать тип «Смешанная». В такую группу можно записывать детей с Робототехники и Программирования одновременно. У каждого ребёнка сохраняются его собственные направление, цена и баланс.' }] : []), extra, photos,
  ] };
}
export function createReleaseNotes(pool) {
  return {
    async current(context) {
      const note = releaseForRoles(context.roles);
      if (!note) return null;
      const [seen] = await pool.query('SELECT release_version FROM user_release_views WHERE user_id=:userId AND release_version=:version', { userId: context.userId, version: note.version });
      return seen.length ? null : note;
    },
    async dismiss(version, context) {
      const note = releaseForRoles(context.roles);
      if (!note || version !== note.version) throw new ApiProblem(404, 'RELEASE_NOT_FOUND', 'Обновление не найдено');
      await pool.query('INSERT IGNORE INTO user_release_views (user_id,release_version) VALUES (:userId,:version)', { userId: context.userId, version });
      return { version, seen: true };
    },
  };
}
