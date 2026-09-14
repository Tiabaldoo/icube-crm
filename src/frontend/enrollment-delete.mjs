import { ApiClient, ApiError } from '../data/api-client.mjs';

const legacy = window.icubeLegacy;
const api = new ApiClient();

function fail(error) {
  window.alert(error instanceof ApiError ? error.message : 'Не удалось удалить направление ребёнка');
  console.error(error);
}

async function deleteEnrollment(childId, enrollmentId, direction) {
  if (!window.confirm(`Удалить направление «${direction}»? Это действие нельзя отменить.`)) return;
  try {
    await api.delete('enrollments', enrollmentId);
    legacy.state.selectedChild = Number(childId);
    legacy.state.modal = null;
    legacy.state.childTab = 'overview';
    legacy.state.page = 'child';
    if (window.icubeApi?.reload) await window.icubeApi.reload();
    else legacy.render();
  } catch (error) { fail(error); }
}

const originalManageDirectionForm = window.manageDirectionForm;
if (typeof originalManageDirectionForm === 'function') {
  window.manageDirectionForm = function (childId, oldDirection) {
    const result = originalManageDirectionForm.apply(this, arguments);
    const child = legacy.state.children.find((item) => item.id === Number(childId));
    const enrollment = child?.enrollments.find((item) => item.direction === oldDirection);
    if (!enrollment?.id) return result;
    queueMicrotask(() => {
      const actions = document.querySelector('.modal-actions');
      if (!actions || actions.querySelector('[data-delete-enrollment]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn danger';
      button.dataset.deleteEnrollment = String(enrollment.id);
      button.textContent = 'Удалить направление';
      button.addEventListener('click', () => deleteEnrollment(childId, enrollment.id, oldDirection));
      actions.prepend(button);
    });
    return result;
  };
}
