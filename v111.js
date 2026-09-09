
// iCube CRM v1.1.1 — groups, sites, group schedule and assigning children.
// This file extends the prototype without changing unrelated CRM areas.

(function () {
  const DAY_SHORT = {
    'Понедельник':'Пн','Вторник':'Вт','Среда':'Ср','Четверг':'Чт',
    'Пятница':'Пт','Суббота':'Сб','Воскресенье':'Вс'
  };
  const DIR_SHORT = {'Робототехника':'Р','Программирование':'П'};

  function minutesToTime(total) {
    total = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }

  function addMinutes(time, minutes) {
    if (!time || time.indexOf(':') < 0) return '';
    const parts = time.split(':').map(Number);
    return minutesToTime(parts[0] * 60 + parts[1] + minutes);
  }

  window.groupTitle = function (g) {
    if (!g) return 'Без группы';
    const site = byId(state.sites, g.siteId);
    const siteName = site ? (site.shortName || site.name) : 'Без площадки';
    return (DIR_SHORT[g.direction] || g.direction) + ', ' +
      (DAY_SHORT[g.day] || g.day) + ', ' + siteName + ', ' + (g.startTime || '—');
  };

  function normalizeSite(site, shortName) {
    if (!site.shortName) site.shortName = shortName || site.name;
  }

  normalizeSite(byId(state.sites,1), 'Школа №1');
  normalizeSite(byId(state.sites,2), 'ДК Океан');
  normalizeSite(byId(state.sites,3), 'Зебра');

  function attachComputedName(g) {
    if (!g.startTime || !g.endTime) {
      const parts = String(g.time || '').split('–');
      g.startTime = g.startTime || parts[0] || '13:00';
      g.endTime = g.endTime || parts[1] || addMinutes(g.startTime, 90);
    }
    g.time = g.startTime + '–' + g.endTime;
    try {
      Object.defineProperty(g, 'name', {
        configurable: true,
        enumerable: true,
        get: function () { return groupTitle(g); },
        set: function () {}
      });
    } catch (e) {}
  }

  state.groups.forEach(attachComputedName);

  window.refreshGroupEndTime = function () {
    const start = document.querySelector('#gf-start');
    const end = document.querySelector('#gf-end');
    if (start && end && start.value) end.value = addMinutes(start.value, 90);
    const preview = document.querySelector('#gf-preview');
    if (preview) {
      const direction = document.querySelector('#gf-dir')?.value;
      const day = document.querySelector('#gf-day')?.value;
      const siteId = Number(document.querySelector('#gf-site')?.value);
      const site = byId(state.sites, siteId);
      preview.textContent = (DIR_SHORT[direction] || direction) + ', ' +
        (DAY_SHORT[day] || day) + ', ' + (site?.shortName || site?.name || '—') + ', ' +
        (start?.value || '—');
    }
  };

  window.refreshGroupPreview = function () {
    const preview = document.querySelector('#gf-preview');
    if (!preview) return;
    const direction = document.querySelector('#gf-dir')?.value;
    const day = document.querySelector('#gf-day')?.value;
    const siteId = Number(document.querySelector('#gf-site')?.value);
    const start = document.querySelector('#gf-start')?.value;
    const site = byId(state.sites, siteId);
    preview.textContent = (DIR_SHORT[direction] || direction) + ', ' +
      (DAY_SHORT[day] || day) + ', ' + (site?.shortName || site?.name || '—') + ', ' +
      (start || '—');
  };

  window.groupForm = function (id) {
    const g = id ? byId(state.groups, id) : null;
    const direction = g?.direction || 'Робототехника';
    const day = g?.day || 'Четверг';
    const start = g?.startTime || '13:00';
    const end = g?.endTime || addMinutes(start,90);

    let html = '<h3>' + (g ? 'Редактировать группу' : 'Новая группа') + '</h3>';
    html += '<div class="notice" style="margin-bottom:14px">Название формируется автоматически: <b id="gf-preview"></b></div>';
    html += '<div class="form-grid">';

    html += '<div class="field"><label>Направление</label><select class="select" id="gf-dir" onchange="refreshGroupPreview()">';
    ['Робототехника','Программирование'].forEach(function(d){
      html += '<option' + (d===direction?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Площадка</label><select class="select" id="gf-site" onchange="refreshGroupPreview()">';
    state.sites.forEach(function(site){
      html += '<option value="' + site.id + '"' + (g?.siteId===site.id?' selected':'') + '>' +
        site.name + ' (' + site.shortName + ')</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>День недели</label><select class="select" id="gf-day" onchange="refreshGroupPreview()">';
    Object.keys(DAY_SHORT).forEach(function(d){
      html += '<option' + (d===day?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Начало</label><input class="input" id="gf-start" type="time" step="1800" value="' + start + '" onchange="refreshGroupEndTime()"><div class="muted mini" style="margin-top:4px">Обычно шаг 30 минут; при необходимости можно ввести другое время.</div></div>';
    html += '<div class="field"><label>Окончание</label><input class="input" id="gf-end" type="time" value="' + end + '"><div class="muted mini" style="margin-top:4px">Автоматически +1:30, но поле можно изменить.</div></div>';

    html += '<div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher">';
    state.teachers.forEach(function(t){
      html += '<option value="' + t.id + '"' + (g?.teacherId===t.id?' selected':'') + '>' + t.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project">';
    ['iCubeRobots','Зебра'].forEach(function(p){
      html += '<option' + (p===(g?.project||'iCubeRobots')?' selected':'') + '>' + p + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="' + (g?.price ?? '') + '" placeholder="Пусто = цена направления"></div>';
    html += '<div class="field"><label>Активность</label><select class="select" id="gf-active"><option value="true"' + (g?.active!==false?' selected':'') + '>Активна</option><option value="false"' + (g?.active===false?' selected':'') + '>Неактивна</option></select></div>';
    html += '</div>';

    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111(' + (g?.id || 'null') + ')">' + (g?'Сохранить':'Создать группу') + '</button></div>';
    modal(html);
    setTimeout(refreshGroupPreview,0);
  };

  window.saveGroupV111 = function (id) {
    const data = {
      direction: document.querySelector('#gf-dir').value,
      siteId: Number(document.querySelector('#gf-site').value),
      day: document.querySelector('#gf-day').value,
      startTime: document.querySelector('#gf-start').value,
      endTime: document.querySelector('#gf-end').value,
      teacherId: Number(document.querySelector('#gf-teacher').value),
      project: document.querySelector('#gf-project').value,
      price: document.querySelector('#gf-price').value === '' ? null : Number(document.querySelector('#gf-price').value),
      active: document.querySelector('#gf-active').value === 'true'
    };
    data.time = data.startTime + '–' + data.endTime;

    let g;
    if (id) {
      g = byId(state.groups,id);
      Object.assign(g,data);
    } else {
      const nextId = Math.max.apply(null,state.groups.map(function(x){return x.id;})) + 1;
      g = Object.assign({id:nextId},data);
      state.groups.push(g);
      state.selectedGroup = nextId;
    }
    attachComputedName(g);
    state.modal = null;
    state.page = 'group';
    render();
  };

  window.groups = function () {
    return pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>') +
      '<div class="grid cols-3">' +
      state.groups.map(function(g){
        const kids = groupChildren(g.id);
        return '<div class="card pad clickable" onclick="openGroup(' + g.id + ')">' +
          '<div style="display:flex;justify-content:space-between;gap:8px"><span class="badge ' + (g.project==='Зебра'?'purple':'blue') + '">' + g.project + '</span><span class="badge ' + (g.active?'green':'gray') + '">' + (g.active?'Активна':'Неактивна') + '</span></div>' +
          '<h3 style="margin:14px 0 5px">' + g.name + '</h3>' +
          '<div class="muted">' + g.direction + '</div>' +
          '<div class="info-list" style="margin-top:12px">' +
            '<div class="info-line"><span>Время</span><b>' + g.startTime + '–' + g.endTime + '</b></div>' +
            '<div class="info-line"><span>Площадка</span><b>' + byId(state.sites,g.siteId).name + '</b></div>' +
            '<div class="info-line"><span>Преподаватель</span><b>' + byId(state.teachers,g.teacherId).name + '</b></div>' +
            '<div class="info-line"><span>Детей</span><b>' + kids.length + '</b></div>' +
            '<div class="info-line"><span>Цена</span><b>' + (g.price?money(g.price):'Наследуется') + '</b></div>' +
          '</div></div>';
      }).join('') + '</div>';
  };

  function statusMatch(child, filter) {
    if (filter === 'all') return true;
    if (filter === 'active') return child.status === 'Активный';
    if (filter === 'leads') return child.status === 'Лид';
    if (filter === 'pause') return child.status === 'Пауза';
    return true;
  }

  window.addChildrenToGroup = function (groupId) {
    state.addChildrenGroupId = groupId;
    state.addChildrenFilter = 'active';
    modal('<h3>Добавить детей</h3><div class="toolbar" style="margin-bottom:10px"><select class="select" id="ac-filter" onchange="renderAddChildrenList()" style="max-width:220px"><option value="active">Активные</option><option value="leads">Лиды</option><option value="pause">Пауза</option><option value="all">Все</option></select></div><div id="ac-list"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="ac-submit" onclick="confirmAddChildren()">Добавить 0 детей</button></div>');
    setTimeout(renderAddChildrenList,0);
  };

  window.renderAddChildrenList = function () {
    const g = byId(state.groups,state.addChildrenGroupId);
    const filter = document.querySelector('#ac-filter')?.value || state.addChildrenFilter || 'active';
    state.addChildrenFilter = filter;
    const candidates = state.children.filter(function(c){
      if (!statusMatch(c,filter)) return false;
      const e = c.enrollments.find(function(x){return x.direction===g.direction;});
      return !!e && e.groupId == null;
    });
    const box = document.querySelector('#ac-list');
    if (!box) return;
    if (!candidates.length) {
      box.innerHTML = '<div class="empty">Нет подходящих детей с направлением «' + g.direction + '» без основной группы.</div>';
    } else {
      box.innerHTML = candidates.map(function(c){
        const e = c.enrollments.find(function(x){return x.direction===g.direction;});
        return '<label class="student-check"><input type="checkbox" class="ac-check" value="' + c.id + '" onchange="updateAddChildrenCount()"><div><b>' + c.name + '</b><div class="muted mini">' + c.status + ' · баланс ' + Number(e.balance.toFixed(4)) + '</div></div><span class="badge gray">Без группы</span></label>';
      }).join('');
    }
    updateAddChildrenCount();
  };

  window.updateAddChildrenCount = function () {
    const count = document.querySelectorAll('.ac-check:checked').length;
    const btn = document.querySelector('#ac-submit');
    if (btn) btn.textContent = 'Добавить ' + count + (count===1?' ребёнка':' детей');
  };

  window.confirmAddChildren = function () {
    const g = byId(state.groups,state.addChildrenGroupId);
    const ids = Array.from(document.querySelectorAll('.ac-check:checked')).map(function(x){return Number(x.value);});
    ids.forEach(function(id){
      const c = byId(state.children,id);
      const e = c.enrollments.find(function(x){return x.direction===g.direction;});
      if (e && e.groupId == null) e.groupId = g.id;
    });
    state.modal = null;
    render();
  };

  window.group = function () {
    const g = byId(state.groups,state.selectedGroup);
    if (!g) return groups();
    const kids = groupChildren(g.id);
    let kidsHtml = '';
    if (!kids.length) {
      kidsHtml = '<div class="empty" style="padding:22px 4px">Пока нет детей в основной группе.</div>';
    } else {
      kidsHtml = kids.map(function(c){
        return '<div class="kpi-line clickable" onclick="openChild(' + c.id + ')"><div><b>' + c.name + '</b><div class="muted mini">' + c.parent + '</div></div><span class="badge ' + statusBadge(c.status) + '">' + c.status + '</span></div>';
      }).join('');
    }

    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'groups\')">← Группы</button>' +
      pageHead(g.name,g.direction + ' · ' + g.project,'<button class="btn" onclick="groupForm(' + g.id + ')">Редактировать</button>') +
      '<div class="split"><div class="card pad"><div class="section-title"><h2>Основные данные</h2><span class="badge ' + (g.active?'green':'gray') + '">' + (g.active?'Активна':'Неактивна') + '</span></div>' +
        '<div class="info-line"><span>Регулярное расписание</span><b>' + g.day + ', ' + g.startTime + '–' + g.endTime + '</b></div>' +
        '<div class="info-line"><span>Площадка</span><b>' + byId(state.sites,g.siteId).name + '</b></div>' +
        '<div class="info-line"><span>Основной преподаватель</span><b>' + byId(state.teachers,g.teacherId).name + '</b></div>' +
        '<div class="info-line"><span>Цена группы</span><b>' + (g.price?money(g.price):'Наследуется от направления') + '</b></div>' +
        '<div class="notice" style="margin-top:12px">Изменение регулярных параметров влияет на будущие занятия; уже проведённые занятия должны хранить свой фактический снимок.</div></div>' +
      '<div class="card pad"><div class="section-title"><h2>Основная группа</h2><div style="display:flex;gap:8px;align-items:center"><b>' + kids.length + ' детей</b><button class="btn soft" onclick="addChildrenToGroup(' + g.id + ')">+ Добавить детей</button></div></div>' +
        kidsHtml +
      '</div></div>';
  };

  window.sites = function () {
    return pageHead('Площадки','Единый справочник мест проведения занятий') +
      '<div class="grid cols-3">' +
      state.sites.map(function(s){
        return '<div class="card pad"><span class="badge gray">' + s.type + '</span><h3 style="margin-bottom:4px">' + s.name + '</h3><div class="badge blue">' + s.shortName + '</div><div class="muted" style="margin-top:12px">' + s.address + '</div><div style="margin-top:13px">' + s.note + '</div><div class="muted mini" style="margin-top:12px">' + state.groups.filter(function(g){return g.siteId===s.id;}).length + ' групп</div></div>';
      }).join('') + '</div>';
  };

  // Direction may exist without a group.
  window.enrollmentForm = function (childId, direction) {
    const c = byId(state.children, childId);
    const existing = direction ? c.enrollments.find(function(e){return e.direction===direction;}) : null;
    const available = ['Робототехника','Программирование'].filter(function(d){
      return existing || !c.enrollments.some(function(e){return e.direction===d;});
    });
    if (!available.length) { alert('Все доступные направления уже добавлены ребёнку.'); return; }
    const selected = existing?.direction || available[0];

    let html = '<h3>' + (existing?'Изменить направление':'Добавить направление') + '</h3><div class="form-grid">';
    html += '<div class="field"><label>Направление</label><select class="select" id="ef-dir" ' + (existing?'disabled':'onchange="refreshEnrollmentGroups()"') + '>';
    available.forEach(function(d){html += '<option' + (d===selected?' selected':'') + '>' + d + '</option>';});
    html += '</select></div><div class="field"><label>Основная группа</label><select class="select" id="ef-group"></select></div>';
    html += '<div class="field span-2"><label>Индивидуальная цена, ₽</label><input class="input" id="ef-price" type="number" step="0.01" value="' + (existing?.individualPrice ?? '') + '" placeholder="Пусто = цена группы или направления"></div></div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveEnrollmentV111(' + childId + ',' + (existing ? '\''+existing.direction+'\'' : 'null') + ')">Сохранить</button></div>';
    modal(html);
    setTimeout(function(){refreshEnrollmentGroups(existing?.groupId ?? null);},0);
  };

  window.refreshEnrollmentGroups = function (selectedGroupId) {
    const d = document.querySelector('#ef-dir')?.value;
    const box = document.querySelector('#ef-group');
    if (!box) return;
    let html = '<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.direction===d && g.active;}).forEach(function(g){
      html += '<option value="' + g.id + '"' + (Number(selectedGroupId)===g.id?' selected':'') + '>' + g.name + '</option>';
    });
    box.innerHTML = html;
    if (selectedGroupId == null) box.value = '';
  };

  window.saveEnrollmentV111 = function (childId, oldDirection) {
    const c = byId(state.children,childId);
    const direction = oldDirection || document.querySelector('#ef-dir').value;
    const rawGroup = document.querySelector('#ef-group').value;
    const groupId = rawGroup === '' ? null : Number(rawGroup);
    const rawPrice = document.querySelector('#ef-price').value;
    const individualPrice = rawPrice === '' ? null : Number(rawPrice);
    let e = c.enrollments.find(function(x){return x.direction===direction;});
    if (e) {
      e.groupId = groupId;
      e.individualPrice = individualPrice;
    } else {
      c.enrollments.push({direction:direction,groupId:groupId,individualPrice:individualPrice,balance:0});
    }
    state.modal = null;
    state.page = 'child';
    render();
  };

  // Create/edit child: first direction can explicitly be left without a group.
  window.childForm = function (id) {
    const c = id ? byId(state.children,id) : null;
    const first = c?.enrollments?.[0] || null;
    const direction = first?.direction || 'Робототехника';

    let html = '<h3>' + (c?'Редактировать ребёнка':'Новый ребёнок') + '</h3><div class="form-grid">';
    html += '<div class="field span-2"><label>ФИО</label><input class="input" id="cf-name" value="' + (c?.name || '') + '" placeholder="Фамилия Имя"></div>';
    html += '<div class="field"><label>Дата рождения</label><input class="input" id="cf-birth" type="date" value="' + (c?.birth || '') + '"></div>';
    html += '<div class="field"><label>Статус</label><select class="select" id="cf-status">';
    ['Лид','Активный','Пауза','Закончил'].forEach(function(st){html += '<option' + (c?.status===st?' selected':'') + '>' + st + '</option>';});
    html += '</select></div>';
    html += '<div class="field"><label>Школа</label><input class="input" id="cf-school" value="' + (c?.school || '') + '"></div>';
    html += '<div class="field"><label>Класс</label><input class="input" id="cf-grade" value="' + (c?.grade || '') + '"></div>';
    html += '<div class="field"><label>Родитель</label><input class="input" id="cf-parent" value="' + (c?.parent || '') + '"></div>';
    html += '<div class="field"><label>Телефон</label><input class="input" id="cf-phone" value="' + (c?.phone || '') + '"></div>';
    html += '<div class="field"><label>Направление</label><select class="select" id="cf-direction" ' + (c?'disabled':'onchange="refreshChildGroupOptions()"') + '><option' + (direction==='Робототехника'?' selected':'') + '>Робототехника</option><option' + (direction==='Программирование'?' selected':'') + '>Программирование</option></select></div>';
    html += '<div class="field"><label>Основная группа</label><select class="select" id="cf-group"></select></div>';
    html += '<div class="field span-2"><label>Примечание</label><textarea class="textarea" id="cf-note">' + (c?.note || '') + '</textarea></div></div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveChildV111(' + (c?.id || 'null') + ')">Сохранить</button></div>';
    modal(html);
    setTimeout(function(){refreshChildGroupOptions(first?.groupId ?? null);},0);
  };

  window.refreshChildGroupOptions = function (selectedGroupId) {
    const direction = document.querySelector('#cf-direction')?.value;
    const box = document.querySelector('#cf-group');
    if (!box) return;
    let html = '<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.direction===direction && g.active;}).forEach(function(g){
      html += '<option value="' + g.id + '"' + (Number(selectedGroupId)===g.id?' selected':'') + '>' + g.name + '</option>';
    });
    box.innerHTML = html;
    if (selectedGroupId == null) box.value = '';
  };

  window.saveChildV111 = function (id) {
    const direction = document.querySelector('#cf-direction').value;
    const rawGroup = document.querySelector('#cf-group').value;
    const groupId = rawGroup === '' ? null : Number(rawGroup);
    const common = {
      name: document.querySelector('#cf-name').value.trim() || 'Новый ребёнок',
      birth: document.querySelector('#cf-birth').value,
      school: document.querySelector('#cf-school').value,
      grade: document.querySelector('#cf-grade').value,
      parent: document.querySelector('#cf-parent').value,
      phone: document.querySelector('#cf-phone').value,
      status: document.querySelector('#cf-status').value,
      note: document.querySelector('#cf-note').value
    };

    if (id) {
      const c = byId(state.children,id);
      Object.assign(c,common);
      const e = c.enrollments.find(function(x){return x.direction===direction;});
      if (e) e.groupId = groupId;
    } else {
      const nextId = Math.max.apply(null,state.children.map(function(x){return x.id;})) + 1;
      const c = Object.assign({id:nextId,shift:'1'},common,{enrollments:[{direction:direction,groupId:groupId,individualPrice:null,balance:0}]});
      state.children.push(c);
      state.selectedChild = nextId;
    }
    state.modal = null;
    state.page = 'child';
    render();
  };

  // Safe balances rendering for enrolments without a group.
  window.balances = function () {
    const entries = state.children.flatMap(function(c){return c.enrollments.map(function(e){return {c:c,e:e};});}).sort(function(a,b){return a.e.balance-b.e.balance;});
    return pageHead('Балансы и долги','Баланс отдельно по каждому направлению. Ребёнок может временно быть без группы.') +
      '<div class="grid cols-3" style="margin-bottom:16px"><div class="card metric"><div class="label">Долг</div><div class="value negative">' + entries.filter(function(x){return x.e.balance<0;}).length + '</div></div><div class="card metric"><div class="label">Ноль</div><div class="value">' + entries.filter(function(x){return x.e.balance===0;}).length + '</div></div><div class="card metric"><div class="label">Осталось 1</div><div class="value" style="color:var(--amber)">' + entries.filter(function(x){return x.e.balance===1;}).length + '</div></div></div>' +
      '<div class="card list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Группа</div><div>Цена</div><div>Баланс</div></div>' +
      entries.map(function(x){const g=byId(state.groups,x.e.groupId);return '<div class="row clickable" onclick="openChild(' + x.c.id + ')"><div><b>' + x.c.name + '</b></div><div>' + x.e.direction + '</div><div>' + (g?g.name:'Без группы') + '</div><div>' + money(effectivePrice(x.e)) + '</div><div class="money ' + (x.e.balance<0?'negative':x.e.balance>0?'positive':'') + '">' + Number(x.e.balance.toFixed(4)) + '</div></div>';}).join('') + '</div>';
  };

  // Keep the salary prototype logic untouched; only standardize displayed group names.
  const oldSalary = window.salary;
  window.salary = function () {
    const html = oldSalary();
    const g = byId(state.groups,1);
    return html.replaceAll('Роботы · Чт 14:00', g ? g.name : 'Р, Чт, Школа №1, 14:00');
  };

  render();
})();


// v1.1.1 polish — compact group time row + recurring monthly calendar.
(function () {
  function add90(time) {
    if (!time || time.indexOf(':') < 0) return '';
    const p=time.split(':').map(Number), total=(p[0]*60+p[1]+90)%1440;
    return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
  }
  const CAL_DAY_NAME = {
    0:'Воскресенье',1:'Понедельник',2:'Вторник',3:'Среда',
    4:'Четверг',5:'Пятница',6:'Суббота'
  };

  window.groupForm = function (id) {
    const g = id ? byId(state.groups, id) : null;
    const direction = g?.direction || 'Робототехника';
    const day = g?.day || 'Четверг';
    const start = g?.startTime || '13:00';
    const end = g?.endTime || add90(start);

    let html = '<h3>' + (g ? 'Редактировать группу' : 'Новая группа') + '</h3>';
    html += '<div class="form-grid">';

    html += '<div class="field"><label>Направление</label><select class="select" id="gf-dir">';
    ['Робототехника','Программирование'].forEach(function(d){
      html += '<option' + (d===direction?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Площадка</label><select class="select" id="gf-site">';
    state.sites.forEach(function(site){
      html += '<option value="' + site.id + '"' + (g?.siteId===site.id?' selected':'') + '>' + site.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>День недели</label><select class="select" id="gf-day">';
    ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'].forEach(function(d){
      html += '<option' + (d===day?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher">';
    state.teachers.forEach(function(t){
      html += '<option value="' + t.id + '"' + (g?.teacherId===t.id?' selected':'') + '>' + t.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field span-2"><label>Время занятия</label>';
    html += '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center">';
    html += '<input class="input" id="gf-start" type="time" step="1800" value="' + start + '" onchange="refreshGroupEndTime()">';
    html += '<span class="muted" style="font-size:18px">→</span>';
    html += '<input class="input" id="gf-end" type="time" value="' + end + '">';
    html += '</div></div>';

    html += '<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project">';
    ['iCubeRobots','Зебра'].forEach(function(p){
      html += '<option' + (p===(g?.project||'iCubeRobots')?' selected':'') + '>' + p + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="' + (g?.price ?? '') + '" placeholder="Пусто = цена направления"></div>';

    html += '<div class="field"><label>Активность</label><select class="select" id="gf-active">';
    html += '<option value="true"' + (g?.active!==false?' selected':'') + '>Активна</option>';
    html += '<option value="false"' + (g?.active===false?' selected':'') + '>Неактивна</option>';
    html += '</select></div>';

    html += '</div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111(' + (g?.id || 'null') + ')">' + (g?'Сохранить':'Создать группу') + '</button></div>';
    modal(html);
  };

  window.refreshGroupEndTime = function () {
    const start = document.querySelector('#gf-start');
    const end = document.querySelector('#gf-end');
    if (start && end && start.value) end.value = add90(start.value);
  };

  function recurringEventsForSeptember() {
    const events = [];
    state.groups.filter(function(g){ return g.active; }).forEach(function(g){
      for (let d=1; d<=30; d++) {
        const dt = new Date(2026,8,d);
        if (CAL_DAY_NAME[dt.getDay()] !== g.day) continue;
        const dd = String(d).padStart(2,'0');
        const date = dd + '.09.2026';
        const explicit = state.lessons.find(function(l){ return l.groupId===g.id && l.date===date; });
        events.push({
          date: date,
          groupId: g.id,
          time: explicit?.time || (g.startTime + '–' + g.endTime),
          status: explicit?.status || 'По расписанию',
          lessonId: explicit?.id || null,
          done: !!explicit?.done,
          project: g.project
        });
      }
    });
    return events;
  }

  window.setCalendarProject = function (project) {
    state.calendarProject = project;
    render();
  };

  window.calendar = function () {
    if (!state.calendarProject) state.calendarProject = 'all';
    const events = recurringEventsForSeptember().filter(function(e){
      return state.calendarProject==='all' || e.project===state.calendarProject;
    });

    const firstDay = new Date(2026,8,1).getDay();
    const mondayIndex = (firstDay + 6) % 7;
    const cells = [];
    for (let i=0;i<mondayIndex;i++) cells.push(null);
    for (let d=1;d<=30;d++) cells.push(d);

    const projectButton = function(value,label){
      return '<button class="btn ' + (state.calendarProject===value?'soft':'') + '" onclick="setCalendarProject(\'' + value + '\')">' + label + '</button>';
    };

    let html = pageHead('Календарь','Сентябрь 2026 · активные группы автоматически попадают в календарь');
    html += '<div class="toolbar">';
    html += '<button class="btn">Неделя</button><button class="btn soft">Месяц</button>';
    html += '<span style="width:1px;background:var(--line);margin:0 2px"></span>';
    html += projectButton('all','Все проекты');
    html += projectButton('iCubeRobots','iCubeRobots');
    html += projectButton('Зебра','Зебра');
    html += '</div>';

    html += '<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(d){
      html += '<div class="muted mini" style="padding:0 8px 4px;font-weight:700">' + d + '</div>';
    });
    html += '</div>';

    html += '<div class="calendar">';
    cells.forEach(function(day){
      if (day===null) {
        html += '<div class="day" style="opacity:.35"></div>';
        return;
      }
      const dd = String(day).padStart(2,'0');
      const date = dd + '.09.2026';
      const dayEvents = events.filter(function(e){ return e.date===date; });
      html += '<div class="day"><div class="date">' + dd + '.09' + (day===9?' · сегодня':'') + '</div>';
      dayEvents.forEach(function(e){
        const g = byId(state.groups,e.groupId);
        const cls = e.project==='Зебра' ? 'partner' : '';
        const done = e.done ? ' done' : '';
        const click = e.lessonId ? ' onclick="openLesson(' + e.lessonId + ')"' : '';
        html += '<div class="event ' + cls + done + '"' + click + '>';
        html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
        html += '<div>' + g.name + '</div>';
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  render();
})();


// Calendar interaction fix — real week/month modes, select filter, clickable recurring lessons.
(function () {
  function ensureCalendarState() {
    if (!state.calendarMode) state.calendarMode = 'month';
    if (!state.calendarProject) state.calendarProject = 'all';
  }

  function dayNameRu(date) {
    return ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][date.getDay()];
  }

  function formatDate(date) {
    return String(date.getDate()).padStart(2,'0') + '.' +
      String(date.getMonth()+1).padStart(2,'0') + '.' + date.getFullYear();
  }

  function recurringEventsForRange(startDate, endDate) {
    const events = [];
    state.groups.filter(function(g){ return g.active; }).forEach(function(g){
      for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate()+1)) {
        if (dayNameRu(dt) !== g.day) continue;
        const date = formatDate(dt);
        const explicit = state.lessons.find(function(l){ return l.groupId===g.id && l.date===date; });
        events.push({
          date,
          groupId:g.id,
          time: explicit?.time || (g.startTime + '–' + g.endTime),
          project:g.project,
          lessonId:explicit?.id || null,
          done:!!explicit?.done
        });
      }
    });
    return events;
  }

  window.openCalendarEvent = function (groupId, date, time) {
    let lesson = state.lessons.find(function(l){ return l.groupId===Number(groupId) && l.date===date; });
    if (!lesson) {
      const g = byId(state.groups, groupId);
      const nextId = state.lessons.length ? Math.max.apply(null,state.lessons.map(function(x){return x.id;})) + 1 : 1;
      lesson = {
        id:nextId,
        date:date,
        time:time,
        groupId:Number(groupId),
        teacherId:g.teacherId,
        status:'Запланировано',
        topic:'',
        attendance:{},
        extras:[],
        photos:{},
        started:false,
        done:false,
        intro:false,
        emptyTrip:false,
        attendanceApplied:false,
        summary:null
      };
      groupChildren(g.id).forEach(function(c){ lesson.attendance[c.id] = false; });
      state.lessons.push(lesson);
    }
    openLesson(lesson.id);
  };

  window.setCalendarMode = function (mode) {
    state.calendarMode = mode;
    render();
  };

  window.setCalendarProjectSelect = function (value) {
    state.calendarProject = value;
    render();
  };

  window.calendar = function () {
    ensureCalendarState();

    const today = new Date(2026,8,9);
    let startDate, endDate, title;

    if (state.calendarMode === 'week') {
      const mondayOffset = (today.getDay() + 6) % 7;
      startDate = new Date(today);
      startDate.setDate(today.getDate() - mondayOffset);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      title = 'Неделя ' + String(startDate.getDate()).padStart(2,'0') + '–' + String(endDate.getDate()).padStart(2,'0') + ' сентября 2026';
    } else {
      startDate = new Date(2026,8,1);
      endDate = new Date(2026,8,30);
      title = 'Сентябрь 2026';
    }

    const events = recurringEventsForRange(startDate,endDate).filter(function(e){
      return state.calendarProject === 'all' || e.project === state.calendarProject;
    });

    let html = pageHead('Календарь', title + ' · активные группы автоматически попадают в календарь');
    html += '<div class="toolbar">';
    html += '<button class="btn ' + (state.calendarMode==='week'?'soft':'') + '" onclick="setCalendarMode(\'week\')">Неделя</button>';
    html += '<button class="btn ' + (state.calendarMode==='month'?'soft':'') + '" onclick="setCalendarMode(\'month\')">Месяц</button>';
    html += '<select class="select" style="max-width:220px" onchange="setCalendarProjectSelect(this.value)">';
    html += '<option value="all"' + (state.calendarProject==='all'?' selected':'') + '>Все проекты</option>';
    html += '<option value="iCubeRobots"' + (state.calendarProject==='iCubeRobots'?' selected':'') + '>iCubeRobots</option>';
    html += '<option value="Зебра"' + (state.calendarProject==='Зебра'?' selected':'') + '>Зебра</option>';
    html += '</select></div>';

    html += '<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(d){
      html += '<div class="muted mini" style="padding:0 8px 4px;font-weight:700">' + d + '</div>';
    });
    html += '</div>';

    if (state.calendarMode === 'week') {
      html += '<div class="calendar">';
      for (let i=0;i<7;i++) {
        const dt = new Date(startDate);
        dt.setDate(startDate.getDate()+i);
        const date = formatDate(dt);
        const dd = String(dt.getDate()).padStart(2,'0');
        const dayEvents = events.filter(function(e){ return e.date===date; });
        html += '<div class="day" style="min-height:260px"><div class="date">' + dd + '.09' + (date==='09.09.2026'?' · сегодня':'') + '</div>';
        dayEvents.forEach(function(e){
          const g = byId(state.groups,e.groupId);
          html += '<div class="event ' + (e.project==='Зебра'?'partner':'') + (e.done?' done':'') + '" onclick="openCalendarEvent(' + e.groupId + ',\'' + e.date + '\',\'' + e.time + '\')">';
          html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
          html += '<div>' + g.name + '</div></div>';
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    const firstDay = new Date(2026,8,1).getDay();
    const mondayIndex = (firstDay + 6) % 7;
    const cells = [];
    for (let i=0;i<mondayIndex;i++) cells.push(null);
    for (let d=1;d<=30;d++) cells.push(d);

    html += '<div class="calendar">';
    cells.forEach(function(day){
      if (day===null) {
        html += '<div class="day" style="opacity:.35"></div>';
        return;
      }
      const dd = String(day).padStart(2,'0');
      const date = dd + '.09.2026';
      const dayEvents = events.filter(function(e){ return e.date===date; });
      html += '<div class="day"><div class="date">' + dd + '.09' + (date==='09.09.2026'?' · сегодня':'') + '</div>';
      dayEvents.forEach(function(e){
        const g = byId(state.groups,e.groupId);
        html += '<div class="event ' + (e.project==='Зебра'?'partner':'') + (e.done?' done':'') + '" onclick="openCalendarEvent(' + e.groupId + ',\'' + e.date + '\',\'' + e.time + '\')">';
        html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
        html += '<div>' + g.name + '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  render();
})();
