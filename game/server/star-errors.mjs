// Ошибки операций со звёздами. status и code уходят в ответ внутреннего API и игры.
export class StarProblem extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// У ребёнка ещё нет игрового профиля: он ни разу не входил в игру.
export class StarProfileMissing extends StarProblem {
  constructor() { super(409, 'GAME_PROFILE_MISSING', 'Ребёнок ещё не входил в игру'); }
}
