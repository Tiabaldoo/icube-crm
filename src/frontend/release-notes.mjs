const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export async function showReleaseNote(api, profile, document = globalThis.document) {
  if (!profile.roles?.some((role) => ['director', 'partner', 'teacher'].includes(role))) return;
  const note = await api.request('/releases/current');
  if (!note || document.querySelector('[data-release-notice]')) return;
  const root = document.createElement('div'); root.className = 'release-notice'; root.dataset.releaseNotice = note.version;
  const compact = () => { root.innerHTML = `<article class="card pad"><h3>Обновление ${esc(note.version)}</h3><div class="modal-actions"><button class="btn primary" data-release-open>Посмотреть</button><button class="btn" data-release-dismiss>Закрыть</button></div></article>`; };
  compact(); document.body.append(root);
  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-release-open]')) root.innerHTML = `<article class="card pad"><h3>${esc(note.title)}</h3>${note.sections.map((section) => `<h4>${esc(section.title)}</h4><p>${esc(section.body)}</p>`).join('')}<div class="modal-actions"><button class="btn primary" data-release-dismiss>Понятно</button></div></article>`;
    const dismiss = event.target.closest('[data-release-dismiss]');
    if (dismiss) {
      dismiss.disabled = true;
      try { await api.request(`/releases/${encodeURIComponent(note.version)}/dismiss`, { method: 'POST', body: {} }); root.remove(); }
      catch (error) { dismiss.disabled = false; globalThis.alert?.(error.message || 'Не удалось сохранить просмотр обновления. Повторите попытку.'); }
    }
  });
}
