
// iCube CRM v1.1 UI extension: child directions management.
// Loaded after app.js so it can safely extend the prototype without touching the main SPA file.

function enrollmentForm(childId, direction) {
  const c = byId(state.children, childId);
  const existing = direction ? c.enrollments.find(e => e.direction === direction) : null;
  const availableDirections = ['Робототехника', 'Программирование'].filter(d =>
    existing || !c.enrollments.some(e => e.direction === d)
  );

  if (!availableDirections.length) {
    alert('Все доступные направления уже добавлены ребёнку.');
    return;
  }

  const selectedDirection = existing ? existing.direction : availableDirections[0];

  let html = '';
  html += '<h3>' + (existing ? 'Изменить направление' : 'Добавить направление') + '</h3>';
  html += '<div class="form-grid">';
  html += '<div class="field"><label>Направление</label>';
  html += '<select class="select" id="ef-dir" ' + (existing ? 'disabled' : 'onchange="refreshEnrollmentGroups()"') + '>';
  availableDirections.forEach(d => {
    html += '<option' + (d === selectedDirection ? ' selected' : '') + '>' + d + '</option>';
  });
  html += '</select></div>';

  html += '<div class="field"><label>Основная группа</label><select class="select" id="ef-group"></select></div>';
  html += '<div class="field span-2"><label>Индивидуальная цена, ₽</label>';
  html += '<input class="input" id="ef-price" type="number" step="0.01" value="' +
    (existing && existing.individualPrice != null ? existing.individualPrice : '') +
    '" placeholder="Пусто = цена группы или направления">';
  html += '<div class="muted mini" style="margin-top:5px">Приоритет цены: индивидуальная → группа → направление.</div></div>';
  html += '</div>';

  html += '<div class="modal-actions">';
  html += '<button class="btn" onclick="closeModal()">Отмена</button>';
  html += '<button class="btn primary" onclick="saveEnrollment(' + childId + ', ' +
    (existing ? "'" + existing.direction + "'" : 'null') + ')">Сохранить</button>';
  html += '</div>';

  modal(html);
  setTimeout(() => refreshEnrollmentGroups(existing ? existing.groupId : null), 0);
}

function refreshEnrollmentGroups(selectedGroupId) {
  const directionSelect = document.querySelector('#ef-dir');
  const groupSelect = document.querySelector('#ef-group');
  if (!directionSelect || !groupSelect) return;

  const direction = directionSelect.value;
  const groups = state.groups.filter(g => g.active && g.direction === direction);

  groupSelect.innerHTML = groups.map(g =>
    '<option value="' + g.id + '"' + (Number(selectedGroupId) === g.id ? ' selected' : '') + '>' +
    g.name + '</option>'
  ).join('');
}

function saveEnrollment(childId, existingDirection) {
  const c = byId(state.children, childId);
  const direction = existingDirection || document.querySelector('#ef-dir').value;
  const groupId = Number(document.querySelector('#ef-group').value);
  const rawPrice = document.querySelector('#ef-price').value;
  const individualPrice = rawPrice === '' ? null : Number(rawPrice);

  let enrollment = c.enrollments.find(e => e.direction === direction);

  if (enrollment) {
    enrollment.groupId = groupId;
    enrollment.individualPrice = individualPrice;
  } else {
    c.enrollments.push({
      direction,
      groupId,
      individualPrice,
      balance: 0
    });
  }

  state.modal = null;
  state.page = 'child';
  render();
}

child = function() {
  const c = byId(state.children, state.selectedChild);
  if (!c) return children();

  let directionsHtml = c.enrollments.map(e => {
    const g = byId(state.groups, e.groupId);
    return '<div style="border-top:1px solid var(--line);padding:14px 0">' +
      '<div style="display:flex;justify-content:space-between;gap:12px">' +
        '<div><b>' + e.direction + '</b><div class="muted">' + (g ? g.name : 'Без группы') + '</div></div>' +
        '<div style="text-align:right"><div class="money ' + (e.balance < 0 ? 'negative' : e.balance > 0 ? 'positive' : '') + '">' +
          e.balance + ' занятий</div>' +
          '<div class="muted mini">' + money(effectivePrice(e)) + ' / занятие</div>' +
          (e.individualPrice != null ? '<div class="badge purple" style="margin-top:5px">Индивидуальная цена</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button class="btn soft" onclick="paymentForm(' + c.id + ',\'' + e.direction + '\')">+ Оплата</button>' +
        '<button class="btn" onclick="enrollmentForm(' + c.id + ',\'' + e.direction + '\')">Изменить</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const paymentsHtml = state.payments.filter(p => p.childId === c.id).map(p =>
    '<div class="kpi-line"><div><b>' + p.direction + '</b><div class="muted mini">' +
    p.date + ' · ' + p.method + '</div></div><div class="money positive">+' +
    p.lessons + ' · ' + money(p.amount) + '</div></div>'
  ).join('') || '<div class="empty">Оплат пока нет</div>';

  return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>' +
    pageHead(
      c.name,
      c.school + ' · ' + c.grade + ' · ' + c.parent,
      '<button class="btn" onclick="childForm(' + c.id + ')">Редактировать</button>'
    ) +
    '<div class="tabs"><button class="active">Обзор</button><button>Оплаты</button><button>Посещения</button><button>Возвраты</button></div>' +
    '<div class="split">' +
      '<div class="card pad">' +
        '<div class="section-title"><h2>Направления</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<span class="badge ' + statusBadge(c.status) + '">' + c.status + '</span>' +
          '<button class="btn soft" onclick="enrollmentForm(' + c.id + ',null)">+ Добавить направление</button>' +
        '</div></div>' +
        directionsHtml +
      '</div>' +
      '<div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div>' +
        '<div class="info-list">' +
          '<div class="info-line"><span>Дата рождения</span><b>' + c.birth + '</b></div>' +
          '<div class="info-line"><span>Смена</span><b>' + c.shift + '</b></div>' +
          '<div class="info-line"><span>Родитель</span><b>' + c.parent + '</b></div>' +
          '<div class="info-line"><span>Телефон</span><b>' + c.phone + '</b></div>' +
          '<div class="info-line"><span>Примечание</span><span style="text-align:right">' + (c.note || '—') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-2" style="margin-top:16px">' +
      '<div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="navTo(\'payments\')">Все</button></div>' +
        paymentsHtml +
      '</div>' +
      '<div class="card pad"><div class="section-title"><h2>История посещений</h2></div>' +
        '<div class="kpi-line"><div><b>05.09 · Робототехника</b><div class="muted mini">Редукторы и передаточное отношение</div></div><span class="badge green">Был</span></div>' +
        '<div class="kpi-line"><div><b>29.08 · Робототехника</b><div class="muted mini">Зубчатые передачи</div></div><span class="badge green">Был</span></div>' +
      '</div>' +
    '</div>';
};

render();
