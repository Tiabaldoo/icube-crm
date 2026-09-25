export const USER_NOTIFICATION_TYPES = Object.freeze({
  teacher_lesson_soon: { role: 'teacher', label: 'Занятие через час', defaultEnabled: true, ttl: 2 * 60 * 60 },
  teacher_lesson_moved: { role: 'teacher', label: 'Перенос занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
  teacher_lesson_cancelled: { role: 'teacher', label: 'Отмена занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
  teacher_child_added: { role: 'teacher', label: 'Новый ребёнок в группе', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },
  teacher_absence_notice: { role: 'teacher', label: 'Ребёнка не будет', defaultEnabled: true, ttl: 24 * 60 * 60 },
  teacher_lesson_start_reminder: { role: 'teacher', label: 'Напомнить начать занятие', defaultEnabled: true, ttl: 60 * 60 },
  teacher_lesson_finish_reminder: { role: 'teacher', label: 'Напомнить завершить занятие', defaultEnabled: true, ttl: 4 * 60 * 60 },
  teacher_child_birthday: { role: 'teacher', label: 'День рождения ребёнка', defaultEnabled: true, ttl: 12 * 60 * 60 },

  director_quick_child_created: { role: 'director', label: 'Новый ребёнок от преподавателя', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },
  director_lesson_not_started: { role: 'director', label: 'Занятие не начато', defaultEnabled: true, ttl: 4 * 60 * 60 },
  director_lesson_not_finished: { role: 'director', label: 'Занятие не завершено', defaultEnabled: true, ttl: 8 * 60 * 60 },
  director_lesson_moved: { role: 'director', label: 'Перенос занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
  director_lesson_cancelled: { role: 'director', label: 'Отмена занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
  director_child_added_group: { role: 'director', label: 'Ребёнок добавлен в группу', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },
  director_debt_threshold: { role: 'director', label: 'Задолженность 2 занятия', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },

  partner_quick_child_created: { role: 'partner', label: 'Новый ребёнок от преподавателя', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },
  partner_child_added_group: { role: 'partner', label: 'Ребёнок добавлен в группу', defaultEnabled: true, ttl: 7 * 24 * 60 * 60 },
  partner_lesson_not_started: { role: 'partner', label: 'Занятие не начато', defaultEnabled: false, ttl: 4 * 60 * 60 },
  partner_lesson_not_finished: { role: 'partner', label: 'Занятие не завершено', defaultEnabled: false, ttl: 8 * 60 * 60 },
  partner_lesson_moved: { role: 'partner', label: 'Перенос занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
  partner_lesson_cancelled: { role: 'partner', label: 'Отмена занятия', defaultEnabled: true, ttl: 2 * 24 * 60 * 60 },
});

export const PARENT_PUSH_TYPES = Object.freeze({
  reminder_day_before: { ttl: 18 * 60 * 60 },
  lesson_move: { ttl: 2 * 24 * 60 * 60 },
  lesson_cancel: { ttl: 2 * 24 * 60 * 60 },
  last_paid_lesson: { ttl: 7 * 24 * 60 * 60 },
  payment_reminder: { ttl: 18 * 60 * 60 },
  lesson_finished: { ttl: 7 * 24 * 60 * 60 },
  push_test: { ttl: 60 * 60 },
});

export function notificationTypeConfig(type) {
  return USER_NOTIFICATION_TYPES[type] ?? PARENT_PUSH_TYPES[type] ?? { ttl: 24 * 60 * 60 };
}

export function settingsForRole(role) {
  return Object.entries(USER_NOTIFICATION_TYPES)
    .filter(([, value]) => value.role === role)
    .map(([type, value]) => ({ type, label: value.label, defaultEnabled: value.defaultEnabled }));
}

export function notificationTag(type, entityType, entityId, notificationId) {
  const base = String(type ?? 'notification').replace(/^(teacher|director|partner)_/, '').replace(/_/g, '-');
  const entity = entityId == null ? notificationId : entityId;
  return `${base}-${entity}`.slice(0, 96);
}
