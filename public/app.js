// Derive base path from the script's own src attribute
// The server replaces __BASE_PATH__ with the actual prefix (e.g. "/taskflow" or "")
const BASE_PATH = document.currentScript
  ? new URL(document.currentScript.src).pathname.replace(/\/app\.js$/, '')
  : '';

// State
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let searchTimeout = null;

// API helper
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_PATH}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    handleLogout();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }

  if (res.status === 204) return null;
  return res.json();
}

// Hamburger Menu
function toggleHamburgerMenu() {
  const dropdown = document.getElementById("hamburger-dropdown");
  const btn = document.querySelector(".hamburger-btn");
  const isOpen = !dropdown.classList.contains("hidden");

  if (isOpen) {
    closeHamburgerMenu();
  } else {
    dropdown.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
}

function closeHamburgerMenu() {
  const dropdown = document.getElementById("hamburger-dropdown");
  const btn = document.querySelector(".hamburger-btn");
  dropdown.classList.add("hidden");
  btn.setAttribute("aria-expanded", "false");
}

// Close hamburger menu when clicking outside
document.addEventListener("click", function (e) {
  const menu = document.querySelector(".hamburger-menu");
  if (menu && !menu.contains(e.target)) {
    closeHamburgerMenu();
  }
});

// Auth
function showRegister() {
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("register-form").classList.remove("hidden");
  document.getElementById("auth-error").classList.add("hidden");
}

function showLogin() {
  document.getElementById("register-form").classList.add("hidden");
  document.getElementById("login-form").classList.remove("hidden");
  document.getElementById("auth-error").classList.add("hidden");
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function handleLogin() {
  const login = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  if (!login || !password) {
    showAuthError("Please fill in all fields");
    return;
  }

  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    token = data.token;
    username = data.username;
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    showApp();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleRegister() {
  const regUsername = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  if (!regUsername || !email || !password) {
    showAuthError("Please fill in all fields");
    return;
  }

  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: regUsername, email, password }),
    });
    token = data.token;
    username = data.username;
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    showApp();
  } catch (err) {
    showAuthError(err.message);
  }
}

function handleLogout() {
  token = null;
  username = null;
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("main-section").classList.add("hidden");
}

function showApp() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("main-section").classList.remove("hidden");
  document.getElementById("user-greeting").textContent = `Hi, ${username}`;
  // Default to Lists tab
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));
  document.getElementById("lists-tab").classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.textContent.includes("My Lists")) t.classList.add("active");
  });
  loadLists();
  loadHome();
}

// Tabs
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));

  event.target.classList.add("active");
  document.getElementById(`${tab}-tab`).classList.remove("hidden");

  if (tab === "home") loadHome();
  if (tab === "tasks") {
    // Reset task detail view if open
    document.querySelector("#tasks-tab .toolbar").classList.remove("hidden");
    document.getElementById("tasks-list").classList.remove("hidden");
    document.getElementById("task-detail").classList.add("hidden");
    loadTasks();
  }
  if (tab === "lists") loadLists();
}

// Home / Landing Page
async function loadHome() {
  loadTopTask();
  loadRecentList();
  loadActivityGrid();
}

async function loadTopTask() {
  const container = document.getElementById("home-top-task-content");
  try {
    const task = await api("/dashboard/top-task");
    if (!task) {
      container.innerHTML = '<p class="text-muted">No pending tasks. You\'re all caught up!</p>';
      return;
    }
    const startBtn = task.status === "PENDING"
      ? `<button class="btn-primary btn-small" onclick="event.stopPropagation(); startHomeTask(${task.id})">Start</button>`
      : task.status === "IN_PROGRESS"
        ? `<span class="badge badge-status-IN_PROGRESS">In Progress</span>`
        : "";

    container.innerHTML = `
      <div class="task-card priority-${task.priority} home-task-card" onclick="viewTask(${task.id}); switchToTab('tasks')" style="cursor: pointer;">
        <div class="home-task-main">
          <span class="badge badge-priority-${task.priority} home-task-priority">${task.priority}</span>
          <span class="home-task-title">${escapeHtml(task.title)}</span>
          <span class="home-task-meta">
            <span class="badge badge-effort home-task-effort">${task.effort} effort</span>
            ${task.time_estimate_minutes ? `<span class="home-task-time">⏱ ${task.time_estimate_minutes} min</span>` : ""}
          </span>
          <div class="home-task-action">
            ${startBtn}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<p class="text-muted">Could not load top task.</p>';
  }
}

async function startHomeTask(taskId) {
  try {
    await api(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    loadTopTask();
  } catch (err) {
    alert(err.message);
  }
}

async function loadRecentList() {
  const container = document.getElementById("home-recent-list-content");
  try {
    const list = await api("/dashboard/recent-list");
    if (!list) {
      container.innerHTML = '<p class="text-muted">No lists yet. Create one to get started!</p>';
      return;
    }
    container.innerHTML = `
      <div class="list-card" onclick="navigateToList(${list.id})" style="cursor: pointer;">
        <h3>${escapeHtml(list.name)}</h3>
        ${list.description ? `<p class="list-meta">${escapeHtml(list.description)}</p>` : ""}
        <p class="list-meta">Last activity ${formatDate(list.last_activity)}</p>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<p class="text-muted">Could not load recent list.</p>';
  }
}

function navigateToList(listId) {
  // Switch to lists tab and open the list
  switchToTab("lists");
  viewList(listId);
}

function switchToTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));

  // Find the matching tab button
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => {
    if (t.textContent.toLowerCase().includes(tab === "home" ? "home" : tab === "lists" ? "list" : tab === "tasks" ? "task" : "smart")) {
      t.classList.add("active");
    }
  });

  document.getElementById(`${tab}-tab`).classList.remove("hidden");
}

async function loadActivityGrid() {
  const container = document.getElementById("home-activity-content");
  try {
    const activity = await api("/dashboard/activity");
    renderActivityGrid(container, activity);
  } catch (err) {
    container.innerHTML = '<p class="text-muted">Could not load activity data.</p>';
  }
}

function renderActivityGrid(container, activity) {
  const today = new Date();
  const weeks = 52;
  const totalDays = weeks * 7;

  // Find max count for color scaling
  const counts = Object.values(activity);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  // Calculate the start date (go back totalDays from today, align to Sunday)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);
  // Align to the previous Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  // Build grid data
  const days = [];
  const current = new Date(startDate);
  while (current <= today) {
    const dateStr = current.toISOString().split("T")[0];
    const count = activity[dateStr] || 0;
    days.push({ date: dateStr, count, dayOfWeek: current.getDay() });
    current.setDate(current.getDate() + 1);
  }

  // Group by weeks
  const weekColumns = [];
  let currentWeek = [];
  for (const day of days) {
    if (day.dayOfWeek === 0 && currentWeek.length > 0) {
      weekColumns.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  }
  if (currentWeek.length > 0) weekColumns.push(currentWeek);

  // Month labels
  const monthLabels = [];
  let lastMonth = -1;
  for (let i = 0; i < weekColumns.length; i++) {
    const firstDayOfWeek = new Date(weekColumns[i][0].date);
    const month = firstDayOfWeek.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ index: i, label: firstDayOfWeek.toLocaleDateString(undefined, { month: "short" }) });
      lastMonth = month;
    }
  }

  // Day labels
  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  // Render
  let html = '<div class="activity-grid-wrapper">';

  // Grid with month labels positioned above week columns
  html += '<div class="activity-grid">';

  // Day labels
  html += '<div class="activity-day-labels">';
  for (const label of dayLabels) {
    html += `<div class="activity-day-label">${label}</div>`;
  }
  html += '</div>';

  // Weeks area with month labels
  const gridWidth = weekColumns.length * 14; // 12px cell + 2px gap per column
  html += `<div class="activity-weeks-container" style="min-width: ${gridWidth}px;">`;

  // Month labels row (each positioned at its week column offset)
  html += `<div class="activity-months" style="width: ${gridWidth}px;">`;
  for (const ml of monthLabels) {
    html += `<span class="activity-month-label" style="left: ${ml.index * 14}px;">${ml.label}</span>`;
  }
  html += '</div>';

  // Week columns
  html += '<div class="activity-weeks">';
  for (const week of weekColumns) {
    html += '<div class="activity-week">';
    // Pad with empty cells if week doesn't start on Sunday
    for (let i = 0; i < week[0].dayOfWeek; i++) {
      html += '<div class="activity-cell activity-empty"></div>';
    }
    for (const day of week) {
      const level = getActivityLevel(day.count, maxCount);
      const title = `${day.date}: ${day.count} task${day.count !== 1 ? "s" : ""} completed`;
      html += `<div class="activity-cell activity-level-${level}" title="${title}"></div>`;
    }
    html += '</div>';
  }
  html += '</div>'; // activity-weeks

  html += '</div>'; // activity-weeks-container
  html += '</div>'; // activity-grid

  // Legend
  html += '<div class="activity-legend">';
  html += '<span class="text-muted">Less</span>';
  for (let i = 0; i <= 4; i++) {
    html += `<div class="activity-cell activity-level-${i}"></div>`;
  }
  html += '<span class="text-muted">More</span>';
  html += '</div>';

  html += '</div>'; // activity-grid-wrapper

  container.innerHTML = html;
}

function getActivityLevel(count, maxCount) {
  if (count === 0) return 0;
  if (maxCount === 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

// Tasks
async function loadTasks() {
  const status = document.getElementById("filter-status").value;
  const priority = document.getElementById("filter-priority").value;
  const effort = document.getElementById("filter-effort").value;
  const sort_by = document.getElementById("sort-by").value;
  const sort_order = document.getElementById("sort-order").value;
  const search = document.getElementById("search-input").value.trim();

  let query = `?sort_by=${sort_by}&sort_order=${sort_order}`;
  if (status) query += `&status=${status}`;
  if (priority) query += `&priority=${priority}`;
  if (effort) query += `&effort=${effort}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;

  try {
    const tasks = await api(`/tasks${query}`);
    renderTasks(tasks);
  } catch (err) {
    console.error("Failed to load tasks:", err);
  }
}

function renderTasks(tasks) {
  const container = document.getElementById("tasks-list");

  if (tasks.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">No tasks found. Create one to get started!</p>';
    return;
  }

  container.innerHTML = tasks.map((task) => `
    <div class="task-card priority-${task.priority}" onclick="viewTask(${task.id})" style="cursor: pointer;">
      <h3>${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
      <div class="task-meta">
        <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
        <span class="badge badge-priority-${task.priority}">${task.priority}</span>
        <span class="badge badge-effort">${task.effort} effort</span>
      </div>
      <div class="task-details">
        ${task.time_estimate_minutes ? `⏱ ${task.time_estimate_minutes} min` : ""}
        ${task.deadline ? ` 📅 ${formatDate(task.deadline)}` : ""}
        ${task.cost ? ` 💰 $${task.cost}` : ""}
      </div>
      ${task.materials ? `<div class="task-details">🛠 ${escapeHtml(task.materials)}</div>` : ""}
    </div>
  `).join("");
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadTasks, 300);
}

// Task Detail View
async function viewTask(id) {
  try {
    const task = await api(`/tasks/${id}`);

    document.querySelector("#tasks-tab .toolbar").classList.add("hidden");
    document.getElementById("tasks-list").classList.add("hidden");
    document.getElementById("task-detail").classList.remove("hidden");

    const content = document.getElementById("task-detail-content");
    content.innerHTML = `
      <div class="task-detail-card priority-${task.priority}">
        <h2>${escapeHtml(task.title)}</h2>
        ${task.description ? `<p class="task-detail-description">${escapeHtml(task.description)}</p>` : ""}
        <div class="task-meta" style="margin: 1rem 0;">
          <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          <span class="badge badge-effort">${task.effort} effort</span>
        </div>
        <div class="task-detail-info">
          ${task.time_estimate_minutes ? `<div>⏱ <strong>Time Estimate:</strong> ${task.time_estimate_minutes} min</div>` : ""}
          ${task.deadline ? `<div>📅 <strong>Deadline:</strong> ${formatDate(task.deadline)}</div>` : ""}
          ${task.cost ? `<div>💰 <strong>Cost:</strong> $${task.cost}</div>` : ""}
          ${task.materials ? `<div>🛠 <strong>Materials:</strong> ${escapeHtml(task.materials)}</div>` : ""}
        </div>
        <div class="task-detail-actions">
          <button class="btn-primary" onclick="editTask(${task.id})">Edit</button>
          <button class="btn-secondary" onclick="cloneTask(${task.id})">Clone</button>
          <button class="btn-secondary" onclick="showAddToList(${task.id})">Add to List</button>
          <button class="btn-danger" onclick="deleteTask(${task.id})">Delete</button>
        </div>
      </div>
    `;
  } catch (err) {
    alert(err.message);
  }
}

function closeTaskDetail() {
  document.querySelector("#tasks-tab .toolbar").classList.remove("hidden");
  document.getElementById("tasks-list").classList.remove("hidden");
  document.getElementById("task-detail").classList.add("hidden");
  loadTasks();
}

// Task Modal
function showTaskModal(taskData = null) {
  document.getElementById("task-modal").classList.remove("hidden");
  document.querySelector("#task-modal .modal-content").scrollTop = 0;
  document.getElementById("task-modal-title").textContent = taskData ? "Edit Task" : "New Task";
  document.getElementById("task-edit-id").value = taskData ? taskData.id : "";
  document.getElementById("task-title").value = taskData ? taskData.title : "";
  document.getElementById("task-description").value = taskData ? taskData.description || "" : "";
  document.getElementById("task-status").value = taskData ? taskData.status : "PENDING";
  document.getElementById("task-priority").value = taskData ? taskData.priority : "MEDIUM";
  document.getElementById("task-effort").value = taskData ? taskData.effort : "MEDIUM";
  document.getElementById("task-deadline").value = taskData && taskData.deadline ? taskData.deadline.slice(0, 16) : "";
  document.getElementById("task-estimate").value = taskData ? taskData.time_estimate_minutes || "" : "";
  document.getElementById("task-cost").value = taskData ? taskData.cost || "" : "";
  document.getElementById("task-materials").value = taskData ? taskData.materials || "" : "";
}

function closeTaskModal() {
  document.getElementById("task-modal").classList.add("hidden");
}

async function saveTask() {
  const id = document.getElementById("task-edit-id").value;
  const data = {
    title: document.getElementById("task-title").value.trim(),
    description: document.getElementById("task-description").value.trim() || null,
    status: document.getElementById("task-status").value,
    priority: document.getElementById("task-priority").value,
    effort: document.getElementById("task-effort").value,
    deadline: document.getElementById("task-deadline").value || null,
    time_estimate_minutes: parseInt(document.getElementById("task-estimate").value) || null,
    cost: parseFloat(document.getElementById("task-cost").value) || null,
    materials: document.getElementById("task-materials").value.trim() || null,
  };

  if (!data.title) {
    alert("Title is required");
    return;
  }

  try {
    if (id) {
      await api(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) });
    } else {
      await api("/tasks", { method: "POST", body: JSON.stringify(data) });
    }
    closeTaskModal();

    // If task detail is visible, refresh it; otherwise reload the task list
    const taskDetail = document.getElementById("task-detail");
    const listTaskDetail = document.getElementById("list-task-detail");
    if (id && listTaskDetail && !listTaskDetail.classList.contains("hidden")) {
      viewTaskFromList(id, currentListId);
    } else if (id && taskDetail && !taskDetail.classList.contains("hidden")) {
      viewTask(id);
    } else {
      loadTasks();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function editTask(id) {
  try {
    const task = await api(`/tasks/${id}`);
    showTaskModal(task);
  } catch (err) {
    alert(err.message);
  }
}

async function cloneTask(id) {
  try {
    await api(`/tasks/${id}/clone`, { method: "POST" });
    closeTaskDetail();
    loadTasks();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTask(id) {
  if (!confirm("Delete this task? This will also remove it from any lists.")) return;
  try {
    await api(`/tasks/${id}`, { method: "DELETE" });
    closeTaskDetail();
    loadTasks();
  } catch (err) {
    alert(err.message);
  }
}

// Lists
let allTasksCache = []; // cached tasks for the selector

async function loadLists() {
  document.getElementById("list-detail").classList.add("hidden");
  document.getElementById("lists-container").classList.remove("hidden");

  try {
    const lists = await api("/lists");
    renderLists(lists);
  } catch (err) {
    console.error("Failed to load lists:", err);
  }
}

function renderLists(lists) {
  const container = document.getElementById("lists-container");

  if (lists.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">No lists yet. Create one or use the Smart Builder!</p>';
    return;
  }

  container.innerHTML = `<div class="lists-grid">${lists.map((list) => `
    <div class="list-card" onclick="viewList(${list.id})">
      <h3>${escapeHtml(list.name)}</h3>
      ${list.description ? `<p class="list-meta">${escapeHtml(list.description)}</p>` : ""}
      <p class="list-meta">Created ${formatDate(list.created_at)}</p>
    </div>
  `).join("")}</div>`;
}

async function viewList(id) {
  try {
    const list = await api(`/lists/${id}`);
    document.getElementById("lists-container").classList.add("hidden");
    document.getElementById("list-detail").classList.remove("hidden");

    // Sort tasks: non-complete first (by priority, then position), then complete
    const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sortedTasks = [...list.tasks].sort((a, b) => {
      const aComplete = a.status === "COMPLETE" ? 1 : 0;
      const bComplete = b.status === "COMPLETE" ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;

      if (aComplete) {
        // Both complete: sort by completed_at (or created_at as fallback)
        const aDate = a.completed_at || a.created_at || "";
        const bDate = b.completed_at || b.created_at || "";
        return aDate.localeCompare(bDate);
      }

      // Both not complete: sort by priority first, then by position
      const priDiff = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
      if (priDiff !== 0) return priDiff;
      return (a.position ?? 999) - (b.position ?? 999);
    });

    const content = document.getElementById("list-detail-content");
    content.innerHTML = `
      <div class="list-detail-header">
        <h2>${escapeHtml(list.name)}</h2>
        <button class="btn-icon" onclick="editListModal(${list.id})" aria-label="Edit list" title="Edit list"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg></button>
      </div>
      ${list.description ? `<p class="list-description">${escapeHtml(list.description)}</p>` : ""}
      ${sortedTasks.length === 0
        ? '<p style="color: var(--text-muted);">No tasks in this list yet. Click "Edit List" to add tasks.</p>'
        : `<div id="list-tasks-sortable" data-list-id="${list.id}">${sortedTasks.map((task) => `
          <div class="list-task-item" draggable="true" data-task-id="${task.id}">
            <span class="drag-handle" aria-label="Drag to reorder">⠿</span>
            <div class="task-info" onclick="viewTaskFromList(${task.id}, ${list.id})" style="cursor: pointer; flex: 1;">
              <span class="badge badge-priority-${task.priority}">${task.priority}</span>
              <span>${escapeHtml(task.title)}</span>
              ${task.time_estimate_minutes ? `<span style="color: var(--text-muted); font-size: 0.8rem;">⏱ ${task.time_estimate_minutes}min</span>` : ""}
            </div>
            ${taskActionButtons(task, list.id)}
          </div>
        `).join("")}</div>`}
    `;

    // Initialize drag-and-drop if there are tasks
    if (sortedTasks.length > 0) {
      initListDragAndDrop(list.id);
    }
  } catch (err) {
    alert(err.message);
  }
}

// Drag-and-drop reordering for list tasks
function initListDragAndDrop(listId) {
  const container = document.getElementById("list-tasks-sortable");
  if (!container) return;

  let draggedEl = null;

  // --- Desktop drag events ---
  container.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".list-task-item");
    if (!item) return;
    draggedEl = item;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  container.addEventListener("dragend", (e) => {
    if (draggedEl) {
      draggedEl.classList.remove("dragging");
      draggedEl = null;
    }
    container.querySelectorAll(".list-task-item").forEach((el) => el.classList.remove("drag-over"));
    saveListOrder(listId);
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".list-task-item");
    if (!target || target === draggedEl) return;

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    container.querySelectorAll(".list-task-item").forEach((el) => el.classList.remove("drag-over"));
    target.classList.add("drag-over");

    if (e.clientY < midY) {
      container.insertBefore(draggedEl, target);
    } else {
      container.insertBefore(draggedEl, target.nextSibling);
    }
  });

  // --- Touch events for mobile ---
  let touchStartY = 0;
  let touchCurrentY = 0;
  let touchStarted = false;
  let longPressTimer = null;

  container.addEventListener("touchstart", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const item = handle.closest(".list-task-item");
    if (!item) return;

    // Start a long-press timer (150ms) to distinguish drag from scroll
    touchStartY = e.touches[0].clientY;
    touchCurrentY = touchStartY;

    longPressTimer = setTimeout(() => {
      touchStarted = true;
      draggedEl = item;
      item.classList.add("dragging");
      document.body.style.overflow = "hidden";
    }, 150);
  }, { passive: false });

  container.addEventListener("touchmove", (e) => {
    if (!touchStarted || !draggedEl) {
      // If we haven't committed to dragging yet, cancel if moved too far
      if (longPressTimer) {
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        if (dy > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
      return;
    }

    e.preventDefault();
    touchCurrentY = e.touches[0].clientY;

    const target = document.elementFromPoint(e.touches[0].clientX, touchCurrentY);
    const targetItem = target ? target.closest(".list-task-item") : null;

    container.querySelectorAll(".list-task-item").forEach((el) => el.classList.remove("drag-over"));

    if (targetItem && targetItem !== draggedEl) {
      targetItem.classList.add("drag-over");
      const rect = targetItem.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (touchCurrentY < midY) {
        container.insertBefore(draggedEl, targetItem);
      } else {
        container.insertBefore(draggedEl, targetItem.nextSibling);
      }
    }
  }, { passive: false });

  container.addEventListener("touchend", (e) => {
    clearTimeout(longPressTimer);
    longPressTimer = null;

    if (touchStarted && draggedEl) {
      draggedEl.classList.remove("dragging");
      container.querySelectorAll(".list-task-item").forEach((el) => el.classList.remove("drag-over"));
      document.body.style.overflow = "";
      saveListOrder(listId);
      draggedEl = null;
    }
    touchStarted = false;
  });

  container.addEventListener("touchcancel", (e) => {
    clearTimeout(longPressTimer);
    longPressTimer = null;

    if (draggedEl) {
      draggedEl.classList.remove("dragging");
      container.querySelectorAll(".list-task-item").forEach((el) => el.classList.remove("drag-over"));
      document.body.style.overflow = "";
      draggedEl = null;
    }
    touchStarted = false;
  });
}

async function saveListOrder(listId) {
  const container = document.getElementById("list-tasks-sortable");
  if (!container) return;

  const taskIds = Array.from(container.querySelectorAll(".list-task-item[data-task-id]"))
    .map((el) => parseInt(el.dataset.taskId));

  try {
    await api(`/lists/${listId}/reorder`, {
      method: "PUT",
      body: JSON.stringify({ task_ids: taskIds }),
    });
  } catch (err) {
    console.error("Failed to save order:", err);
  }
}

function taskActionButtons(task, listId) {
  if (task.status === "PENDING") {
    return `<button class="btn-primary btn-small" onclick="event.stopPropagation(); startTask(${task.id}, ${listId})">Start</button>`;
  }
  if (task.status === "IN_PROGRESS") {
    return `
      <div style="display: flex; gap: 0.4rem;">
        <button class="btn-secondary btn-small" onclick="event.stopPropagation(); stopTask(${task.id}, ${listId})">Stop</button>
        <button class="btn-primary btn-small" onclick="event.stopPropagation(); completeTask(${task.id}, ${listId})">Complete</button>
      </div>
    `;
  }
  // COMPLETE — show status badge on the right
  return `<span class="badge badge-status-COMPLETE">${formatStatus(task.status)}</span>`;
}

async function startTask(taskId, listId) {
  try {
    await api(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    viewList(listId);
  } catch (err) {
    alert(err.message);
  }
}

async function stopTask(taskId, listId) {
  try {
    await api(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "PENDING" }),
    });
    viewList(listId);
  } catch (err) {
    alert(err.message);
  }
}

async function completeTask(taskId, listId) {
  try {
    await api(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "COMPLETE" }),
    });
    viewList(listId);
  } catch (err) {
    alert(err.message);
  }
}

function closeListDetail() {
  loadLists();
}

// View task detail from within a list
let currentListId = null;

async function viewTaskFromList(taskId, listId) {
  try {
    const task = await api(`/tasks/${taskId}`);
    currentListId = listId;

    document.getElementById("list-detail").classList.add("hidden");
    document.getElementById("list-task-detail").classList.remove("hidden");

    const content = document.getElementById("list-task-detail-content");
    content.innerHTML = `
      <div class="task-detail-card priority-${task.priority}">
        <h2>${escapeHtml(task.title)}</h2>
        ${task.description ? `<p class="task-detail-description">${escapeHtml(task.description)}</p>` : ""}
        <div class="task-meta" style="margin: 1rem 0;">
          <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          <span class="badge badge-effort">${task.effort} effort</span>
        </div>
        <div class="task-detail-info">
          ${task.time_estimate_minutes ? `<div>⏱ <strong>Time Estimate:</strong> ${task.time_estimate_minutes} min</div>` : ""}
          ${task.deadline ? `<div>📅 <strong>Deadline:</strong> ${formatDate(task.deadline)}</div>` : ""}
          ${task.cost ? `<div>💰 <strong>Cost:</strong> $${task.cost}</div>` : ""}
          ${task.materials ? `<div>🛠 <strong>Materials:</strong> ${escapeHtml(task.materials)}</div>` : ""}
        </div>
        <div class="task-detail-actions">
          <button class="btn-primary" onclick="editTask(${task.id})">Edit</button>
          <button class="btn-secondary" onclick="showAddToList(${task.id})">Add to List</button>
        </div>
      </div>
    `;
  } catch (err) {
    alert(err.message);
  }
}

function closeListTaskDetail() {
  document.getElementById("list-task-detail").classList.add("hidden");
  document.getElementById("list-detail").classList.remove("hidden");
  if (currentListId) {
    viewList(currentListId);
  }
}

// Fetch user tasks for the selector (exclude completed)
// When listId is provided, show only tasks assigned to that list or unassigned.
// When no listId (new list), show only tasks not assigned to any list.
async function fetchAllTasks(listId) {
  try {
    let query = "/tasks?sort_by=title&sort_order=asc";
    if (listId) {
      query += `&available_for_list=${listId}`;
    } else {
      query += "&available_for_list=0";
    }
    const all = await api(query);
    allTasksCache = all.filter((t) => t.status !== "COMPLETE");
  } catch (err) {
    allTasksCache = [];
  }
}

// Render the task selector checkboxes
function renderTaskSelector(selectedTaskIds = []) {
  const container = document.getElementById("list-task-selector");
  const searchVal = (document.getElementById("list-task-search").value || "").toLowerCase();
  const sortVal = document.getElementById("list-task-sort").value;

  let filtered = allTasksCache.filter((t) =>
    t.title.toLowerCase().includes(searchVal) ||
    (t.description || "").toLowerCase().includes(searchVal)
  );

  const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };

  switch (sortVal) {
    case "alpha":
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "priority-desc":
      filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      break;
    case "priority-asc":
      filtered.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
      break;
    case "date-added":
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case "due-date":
      filtered.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      });
      break;
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="task-selector-empty">No tasks found</div>';
    return;
  }

  const selectedSet = new Set(selectedTaskIds);

  container.innerHTML = filtered.map((task) => `
    <div class="task-selector-item">
      <input type="checkbox" id="sel-task-${task.id}" value="${task.id}" ${selectedSet.has(task.id) ? "checked" : ""}>
      <label for="sel-task-${task.id}">
        <span>${escapeHtml(task.title)}</span>
        <span class="badge badge-priority-${task.priority}" style="margin-left: auto;">${task.priority}</span>
      </label>
    </div>
  `).join("");
}

function filterListTasks() {
  // Re-render with current checked state preserved
  const checked = getSelectedTaskIds();
  renderTaskSelector(checked);
}

function getSelectedTaskIds() {
  const checkboxes = document.querySelectorAll("#list-task-selector input[type='checkbox']:checked");
  return Array.from(checkboxes).map((cb) => parseInt(cb.value));
}

// Show list modal for creating a new list
async function showListModal() {
  document.getElementById("list-modal-title").textContent = "New List";
  document.getElementById("list-edit-id").value = "";
  document.getElementById("list-name").value = "";
  document.getElementById("list-description").value = "";
  document.getElementById("list-task-search").value = "";
  document.getElementById("list-save-btn").textContent = "Create";
  document.getElementById("list-delete-btn").style.display = "none";

  await fetchAllTasks();
  renderTaskSelector([]);

  document.getElementById("list-modal").classList.remove("hidden");
  document.querySelector("#list-modal .modal-content").scrollTop = 0;
}

// Show list modal for editing an existing list
async function editListModal(listId) {
  try {
    const list = await api(`/lists/${listId}`);
    await fetchAllTasks(listId);

    document.getElementById("list-modal-title").textContent = "Edit List";
    document.getElementById("list-edit-id").value = listId;
    document.getElementById("list-name").value = list.name;
    document.getElementById("list-description").value = list.description || "";
    document.getElementById("list-task-search").value = "";
    document.getElementById("list-save-btn").textContent = "Save Changes";
    document.getElementById("list-delete-btn").style.display = "inline-block";

    const currentTaskIds = list.tasks.map((t) => t.id);
    renderTaskSelector(currentTaskIds);

    document.getElementById("list-modal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

function closeListModal() {
  document.getElementById("list-modal").classList.add("hidden");
  hideInlineTaskForm();
}

function showInlineTaskForm() {
  document.getElementById("inline-task-form").classList.remove("hidden");
  document.getElementById("inline-task-title").value = "";
  document.getElementById("inline-task-priority").value = "MEDIUM";
  document.getElementById("inline-task-effort").value = "MEDIUM";
  document.getElementById("inline-task-estimate").value = "";
  document.getElementById("inline-task-title").focus();
}

function hideInlineTaskForm() {
  document.getElementById("inline-task-form").classList.add("hidden");
}

async function saveInlineTask() {
  const title = document.getElementById("inline-task-title").value.trim();
  const priority = document.getElementById("inline-task-priority").value;
  const effort = document.getElementById("inline-task-effort").value;
  const time_estimate_minutes = parseInt(document.getElementById("inline-task-estimate").value) || null;

  if (!title) {
    alert("Task title is required");
    return;
  }

  try {
    const newTask = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ title, priority, effort, time_estimate_minutes }),
    });

    // Refresh the tasks cache and re-render with the new task checked
    const currentListEditId = document.getElementById("list-edit-id").value;
    await fetchAllTasks(currentListEditId || undefined);
    const currentlyChecked = getSelectedTaskIds();
    currentlyChecked.push(newTask.id);
    renderTaskSelector(currentlyChecked);

    hideInlineTaskForm();
  } catch (err) {
    alert(err.message);
  }
}

async function saveList() {
  const listId = document.getElementById("list-edit-id").value;
  const name = document.getElementById("list-name").value.trim();
  const description = document.getElementById("list-description").value.trim();
  const selectedTaskIds = getSelectedTaskIds();

  if (!name) {
    alert("List name is required");
    return;
  }

  try {
    if (listId) {
      // Editing: update name/description, then sync tasks
      await api(`/lists/${listId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description: description || null }),
      });

      // Get current tasks on the list to compute diff
      const current = await api(`/lists/${listId}`);
      const currentIds = new Set(current.tasks.map((t) => t.id));
      const selectedSet = new Set(selectedTaskIds);

      // Add newly selected tasks
      for (const taskId of selectedTaskIds) {
        if (!currentIds.has(taskId)) {
          await api(`/lists/${listId}/tasks`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId }),
          });
        }
      }

      // Remove deselected tasks
      for (const taskId of currentIds) {
        if (!selectedSet.has(taskId)) {
          await api(`/lists/${listId}/tasks/${taskId}`, { method: "DELETE" });
        }
      }

      closeListModal();
      viewList(listId);
    } else {
      // Creating: create list then add selected tasks
      const newList = await api("/lists", {
        method: "POST",
        body: JSON.stringify({ name, description: description || null }),
      });

      // Add selected tasks to the new list
      for (const taskId of selectedTaskIds) {
        await api(`/lists/${newList.id}/tasks`, {
          method: "POST",
          body: JSON.stringify({ task_id: taskId }),
        });
      }

      closeListModal();
      loadLists();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function deleteList(id) {
  if (!confirm("Delete this list? Tasks will not be deleted.")) return;
  try {
    await api(`/lists/${id}`, { method: "DELETE" });
    loadLists();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteListFromModal() {
  const listId = document.getElementById("list-edit-id").value;
  if (!listId) return;
  if (!confirm("Delete this list? Tasks will not be deleted.")) return;
  try {
    await api(`/lists/${listId}`, { method: "DELETE" });
    closeListModal();
    loadLists();
  } catch (err) {
    alert(err.message);
  }
}

async function removeFromList(listId, taskId) {
  try {
    await api(`/lists/${listId}/tasks/${taskId}`, { method: "DELETE" });
    viewList(listId);
  } catch (err) {
    alert(err.message);
  }
}

// Add to List
async function showAddToList(taskId) {
  try {
    const lists = await api("/lists");
    const container = document.getElementById("available-lists");

    if (lists.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted);">No lists yet. Create one first.</p>';
    } else {
      container.innerHTML = lists.map((list) => `
        <div class="available-list-item">
          <span>${escapeHtml(list.name)}</span>
          <button class="btn-primary btn-small" onclick="addTaskToList(${taskId}, ${list.id})">Add</button>
        </div>
      `).join("");
    }

    document.getElementById("add-to-list-modal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

function closeAddToListModal() {
  document.getElementById("add-to-list-modal").classList.add("hidden");
}

async function addTaskToList(taskId, listId) {
  try {
    await api(`/lists/${listId}/tasks`, { method: "POST", body: JSON.stringify({ task_id: taskId }) });
    closeAddToListModal();
  } catch (err) {
    alert(err.message);
  }
}

// Smart Builder
async function generateSmartList() {
  const available_minutes = parseInt(document.getElementById("smart-minutes").value);
  const priority_filter = document.getElementById("smart-priority").value || undefined;
  const effort_filter = document.getElementById("smart-effort").value || undefined;
  const list_name = document.getElementById("smart-name").value.trim() || undefined;

  if (!available_minutes || available_minutes <= 0) {
    alert("Please enter available time in minutes");
    return;
  }

  try {
    const result = await api("/smart-list/generate", {
      method: "POST",
      body: JSON.stringify({ available_minutes, priority_filter, effort_filter, list_name }),
    });

    const resultsDiv = document.getElementById("smart-results");
    resultsDiv.classList.remove("hidden");

    if (result.tasks.length === 0) {
      resultsDiv.innerHTML = `
        <h3>No matching tasks found</h3>
        <p style="color: var(--text-muted);">Try adjusting your filters or add more tasks with time estimates.</p>
      `;
      return;
    }

    resultsDiv.innerHTML = `
      <h3>${result.list ? "List Created!" : "Suggested Tasks"}</h3>
      <div class="smart-summary">
        📊 ${result.tasks.length} tasks selected • 
        ⏱ ${result.total_estimated_minutes} min planned • 
        ⏳ ${result.remaining_minutes} min remaining
      </div>
      ${result.tasks.map((task) => `
        <div class="list-task-item">
          <div class="task-info">
            <span class="badge badge-priority-${task.priority}">${task.priority}</span>
            <span>${escapeHtml(task.title)}</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">⏱ ${task.time_estimate_minutes || 30}min</span>
          </div>
        </div>
      `).join("")}
      ${result.list ? `<p style="margin-top: 1rem; color: var(--success);">✓ List "${escapeHtml(result.list.name)}" has been created. Check your Lists tab!</p>` : ""}
    `;
  } catch (err) {
    alert(err.message);
  }
}

// Quick Task
function showQuickTaskModal() {
  document.getElementById("quick-task-modal").classList.remove("hidden");
  document.getElementById("quick-task-title").value = "";
  document.getElementById("quick-task-priority").value = "MEDIUM";
  document.querySelector("#quick-task-modal .modal-content").scrollTop = 0;
  document.getElementById("quick-task-title").focus();
}

function closeQuickTaskModal() {
  document.getElementById("quick-task-modal").classList.add("hidden");
}

async function saveQuickTask() {
  const title = document.getElementById("quick-task-title").value.trim();
  const priority = document.getElementById("quick-task-priority").value;

  if (!title) {
    alert("Title is required");
    return;
  }

  try {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ title, priority }),
    });
    closeQuickTaskModal();
    loadTasks();
  } catch (err) {
    alert(err.message);
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatStatus(status) {
  return status.replace("_", " ");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Init
if (token && username) {
  showApp();
} else {
  document.getElementById("auth-section").classList.remove("hidden");
}
