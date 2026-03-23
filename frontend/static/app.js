/* ═══════════════════════════════════════════════════════════════
   SecureTask — Frontend App
   ═══════════════════════════════════════════════════════════════ */

// ─── Auth Guard ──────────────────────────────────────────────────
const token = sessionStorage.getItem('jwt_token');
if (!token) window.location.href = 'login.html';

const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
document.getElementById('user-name').textContent = currentUser.name || 'User';

// ─── State ───────────────────────────────────────────────────────
let projects      = [];
let tasks         = [];
let currentProject = null;
let chart         = null;
let typingTimer   = null;

const COLUMNS = [
  { id: 'backlog',  label: 'Backlog',      dot: 'backlog'  },
  { id: 'todo',     label: 'To Do',        dot: 'todo'     },
  { id: 'progress', label: 'In Progress',  dot: 'progress' },
  { id: 'done',     label: 'Done',         dot: 'done'     },
];

// ─── API Helper ───────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { logout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ─── Toast ───────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Auth ─────────────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// ─── Projects ────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const data = await api('GET', '/api/projects');
    projects = data.projects || [];
    renderProjectSelect();
    if (projects.length) selectProject(projects[0].id);
  } catch (e) {
    toast('Failed to load projects', 'error');
  }
}

function renderProjectSelect() {
  const sel = document.getElementById('project-select');
  if (!projects.length) {
    sel.innerHTML = '<option value="">No projects — create one</option>';
    return;
  }
  sel.innerHTML = projects.map(p =>
    `<option value="${p.id}">${escHtml(p.name)}</option>`
  ).join('');
}

function onProjectChange() {
  const id = parseInt(document.getElementById('project-select').value);
  if (id) selectProject(id);
}

function selectProject(id) {
  currentProject = projects.find(p => p.id === id) || null;
  if (!currentProject) return;
  document.getElementById('project-select').value = id;
  document.getElementById('board-title').textContent = currentProject.name;
  document.getElementById('new-task-btn').style.display = '';
  loadTasks();
  socketJoinProject(id);
}

function openNewProjectModal() {
  document.getElementById('new-project-name').value = '';
  document.getElementById('project-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-project-name').focus(), 80);
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('open');
}

async function createProject() {
  const name = document.getElementById('new-project-name').value.trim();
  if (!name) return;
  try {
    const data = await api('POST', '/api/projects', { name });
    projects.push(data.project);
    renderProjectSelect();
    selectProject(data.project.id);
    closeProjectModal();
    toast('Project created');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Tasks ───────────────────────────────────────────────────────
async function loadTasks() {
  if (!currentProject) return;
  renderBoard(null); // show skeletons
  try {
    const data = await api('GET', `/api/tasks?project_id=${currentProject.id}`);
    tasks = data.tasks || [];
    renderBoard(tasks);
    updateStats();
  } catch (e) {
    toast('Failed to load tasks', 'error');
  }
}

// ─── Board Render ─────────────────────────────────────────────────
function renderBoard(taskList) {
  const board = document.getElementById('board');
  board.innerHTML = COLUMNS.map(col => `
    <div class="column" id="col-${col.id}">
      <div class="col-header">
        <div class="col-title">
          <div class="col-dot ${col.dot}"></div>
          ${col.label}
        </div>
        <span class="col-count" id="col-count-${col.id}">0</span>
      </div>
      <div class="typing-indicator" id="typing-${col.id}"></div>
      <div class="cards" id="cards-${col.id}">
        ${taskList === null ? skeletonCards() : ''}
      </div>
    </div>
  `).join('');

  if (taskList) {
    COLUMNS.forEach(col => {
      const colTasks = taskList.filter(t => t.status === col.id);
      document.getElementById(`col-count-${col.id}`).textContent = colTasks.length;
      const container = document.getElementById(`cards-${col.id}`);
      if (!colTasks.length) {
        container.innerHTML = `<div class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12h6M12 9v6"/></svg>
          <div>No tasks here</div>
        </div>`;
      } else {
        container.innerHTML = colTasks.map(taskCard).join('');
      }
    });
  }
}

function skeletonCards() {
  return Array(2).fill(0).map(() => `
    <div class="card" style="pointer-events:none">
      <div class="skeleton" style="height:14px;width:70%;margin-bottom:8px"></div>
      <div class="skeleton" style="height:11px;width:90%;margin-bottom:4px"></div>
      <div class="skeleton" style="height:11px;width:60%"></div>
    </div>
  `).join('');
}

function taskCard(task) {
  const priority = task.priority || 'medium';
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const dueLabel = task.due_date ? formatDate(task.due_date) : '';
  const initials = task.assignee_name
    ? task.assignee_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  return `
    <div class="card" onclick="openEditTaskModal(${task.id})">
      <div class="card-title">${escHtml(task.title)}</div>
      ${task.description ? `<div class="card-desc">${escHtml(task.description)}</div>` : ''}
      <div class="card-meta">
        <span class="priority-chip priority-${priority}">${priority}</span>
        ${dueLabel ? `<span class="due-chip ${isOverdue ? 'overdue' : ''}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          ${dueLabel}
        </span>` : ''}
        ${initials ? `<div class="card-assignee" title="${escHtml(task.assignee_name)}">${initials}</div>` : ''}
      </div>
    </div>
  `;
}

// ─── Stats / Chart ────────────────────────────────────────────────
function updateStats() {
  const counts = { backlog: 0, todo: 0, progress: 0, done: 0 };
  tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  document.getElementById('cnt-backlog').textContent  = counts.backlog;
  document.getElementById('cnt-todo').textContent     = counts.todo;
  document.getElementById('cnt-progress').textContent = counts.progress;
  document.getElementById('cnt-done').textContent     = counts.done;

  const vals = [counts.backlog, counts.todo, counts.progress, counts.done];

  if (!chart) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Backlog', 'To Do', 'In Progress', 'Done'],
        datasets: [{
          data: vals,
          backgroundColor: ['#6b7094', '#5b6af0', '#f5a623', '#3ecf8e'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: '70%',
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` },
        }},
        animation: { duration: 500 },
      },
    });
  } else {
    chart.data.datasets[0].data = vals;
    chart.update();
  }
}

// ─── Task Modal ───────────────────────────────────────────────────
function openNewTaskModal() {
  document.getElementById('modal-task-id').value    = '';
  document.getElementById('modal-title').value      = '';
  document.getElementById('modal-desc').value       = '';
  document.getElementById('modal-priority').value   = 'medium';
  document.getElementById('modal-status').value     = 'backlog';
  document.getElementById('modal-due').value        = '';
  document.getElementById('modal-title-text').textContent = 'New Task';
  document.getElementById('modal-save-btn').textContent   = 'Create Task';
  document.getElementById('modal-delete-btn').style.display = 'none';
  document.getElementById('task-modal').classList.add('open');
  setTimeout(() => document.getElementById('modal-title').focus(), 80);
}

function openEditTaskModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  document.getElementById('modal-task-id').value    = task.id;
  document.getElementById('modal-title').value      = task.title;
  document.getElementById('modal-desc').value       = task.description || '';
  document.getElementById('modal-priority').value   = task.priority || 'medium';
  document.getElementById('modal-status').value     = task.status;
  document.getElementById('modal-due').value        = task.due_date ? task.due_date.slice(0, 10) : '';
  document.getElementById('modal-title-text').textContent = 'Edit Task';
  document.getElementById('modal-save-btn').textContent   = 'Save Changes';
  document.getElementById('modal-delete-btn').style.display = '';
  document.getElementById('task-modal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
}

async function saveTask() {
  const taskId = document.getElementById('modal-task-id').value;
  const payload = {
    title:       document.getElementById('modal-title').value.trim(),
    description: document.getElementById('modal-desc').value.trim(),
    priority:    document.getElementById('modal-priority').value,
    status:      document.getElementById('modal-status').value,
    due_date:    document.getElementById('modal-due').value || null,
    project_id:  currentProject?.id,
  };
  if (!payload.title) {
    document.getElementById('modal-title').focus();
    return;
  }
  try {
    if (taskId) {
      const data = await api('PATCH', `/api/tasks/${taskId}`, payload);
      const idx  = tasks.findIndex(t => t.id === parseInt(taskId));
      if (idx !== -1) tasks[idx] = data.task;
      toast('Task updated');
    } else {
      const data = await api('POST', '/api/tasks', payload);
      tasks.push(data.task);
      toast('Task created');
    }
    renderBoard(tasks);
    updateStats();
    closeTaskModal();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteCurrentTask() {
  const taskId = document.getElementById('modal-task-id').value;
  if (!taskId || !confirm('Delete this task?')) return;
  try {
    await api('DELETE', `/api/tasks/${taskId}`);
    tasks = tasks.filter(t => t.id !== parseInt(taskId));
    renderBoard(tasks);
    updateStats();
    closeTaskModal();
    toast('Task deleted');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Typing Indicator ─────────────────────────────────────────────
function notifyTyping() {
  if (!socket || !currentProject) return;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('user_typing', { task_id: document.getElementById('modal-task-id').value || null });
  }, 400);
}

function showTyping(col, userName) {
  const el = document.getElementById(`typing-${col}`);
  if (!el) return;
  el.innerHTML = `${escHtml(userName)} is editing…
    <span class="typing-dots"><span></span><span></span><span></span></span>`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.innerHTML = ''; }, 3000);
}

// ─── WebSocket ────────────────────────────────────────────────────
let socket = null;

function initSocket() {
  socket = io({ auth: { token }, transports: ['websocket'] });

  socket.on('connect', () => {
    setSocketStatus(true);
    if (currentProject) socketJoinProject(currentProject.id);
  });

  socket.on('disconnect', () => setSocketStatus(false));

  socket.on('task_created', ({ task }) => {
    if (task.project_id !== currentProject?.id) return;
    tasks.push(task);
    renderBoard(tasks);
    updateStats();
    toast(`New task: ${task.title}`);
  });

  socket.on('task_updated', ({ task }) => {
    if (task.project_id !== currentProject?.id) return;
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) tasks[idx] = task; else tasks.push(task);
    renderBoard(tasks);
    updateStats();
  });

  socket.on('task_deleted', ({ task_id }) => {
    tasks = tasks.filter(t => t.id !== task_id);
    renderBoard(tasks);
    updateStats();
  });

  socket.on('user_typing', ({ user_name, task_id }) => {
    if (user_name === currentUser.name) return;
    // Show in whichever column the task belongs to
    const task = tasks.find(t => t.id === task_id);
    const col  = task ? task.status : 'todo';
    showTyping(col, user_name);
  });

  socket.on('user_online', ({ name }) => {
    toast(`${name} joined`);
  });
}

function socketJoinProject(projectId) {
  if (socket?.connected) {
    socket.emit('join_project', { project_id: projectId, token });
  }
}

function setSocketStatus(connected) {
  const dot  = document.getElementById('socket-dot');
  const text = document.getElementById('socket-status');
  dot.style.background = connected ? 'var(--success)' : 'var(--muted)';
  text.lastChild.textContent = connected ? ' Connected' : ' Disconnected';
}

// ─── Close modals on backdrop click ──────────────────────────────
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.classList.remove('open');
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(el => el.classList.remove('open'));
  }
});

// ─── Helpers ──────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

// ─── Boot ─────────────────────────────────────────────────────────
loadProjects();
initSocket();
