const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export async function openReleaseNote(api, legacy) {
  const note = await api.request('/releases/current');
  if (!note) return false;
  legacy.state.modal = `<h3>${esc(note.title)}</h3><div class="release-detail">${note.sections.map((section) => `<h4>${esc(section.title)}</h4><p>${esc(section.body)}</p>`).join('')}</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Понятно</button></div>`;
  legacy.render();
  return true;
}
