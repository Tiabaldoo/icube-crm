import { createNotificationEvents } from './notification-events.mjs';

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
export function createReleaseNotes(pool, { notificationEvents = createNotificationEvents(pool) } = {}) {
  return {
    async current(context) { return releaseForRoles(context.roles); },
    async ensureNotification(context, { roleCode, projectId } = {}) {
      const note = releaseForRoles(context.roles);
      if (!note || !context.userId) return;
      // Internal inbox only: never enqueue Web Push, regardless of user settings.
      await notificationEvents.createUser(pool, {
        userId: context.userId, roleCode, projectId,
        type: 'crm_release', title: `Обновление ${note.version}`, body: 'В АйКуб появились новые возможности',
        entityType: 'crm_release', destination: 'crm-release', dedupKey: `crm-release:${note.version}`,
        pushEnabled: false,
      });
    },
  };
}
