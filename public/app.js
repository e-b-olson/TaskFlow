// State
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let searchTimeout = null;

// API helper
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

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
  loadLists();
}

// Tabs
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));

  event.target.classList.add("active");
  document.getElementById(`${tab}-tab`).classList.remove("hidden");

  if (tab === "tasks") loadTasks();
  if (tab === "lists") loadLists();
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
    if (id && taskDetail && !taskDetail.classList.contains("hidden")) {
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

    const content = document.getElementById("list-detail-content");
    content.innerHTML = `
      <div class="list-detail-header">
        <h2>${escapeHtml(list.name)}</h2>
        <button class="btn-icon" onclick="editListModal(${list.id})" aria-label="Edit list" title="Edit list"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg></button>
      </div>
      ${list.description ? `<p class="list-description">${escapeHtml(list.description)}</p>` : ""}
      ${list.tasks.length === 0
        ? '<p style="color: var(--text-muted);">No tasks in this list yet. Click "Edit List" to add tasks.</p>'
        : list.tasks.map((task) => `
          <div class="list-task-item">
            <div class="task-info">
              <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
              <span>${escapeHtml(task.title)}</span>
              <span class="badge badge-priority-${task.priority}">${task.priority}</span>
              ${task.time_estimate_minutes ? `<span style="color: var(--text-muted); font-size: 0.8rem;">⏱ ${task.time_estimate_minutes}min</span>` : ""}
            </div>
            ${taskActionButtons(task, list.id)}
          </div>
        `).join("")}
    `;
  } catch (err) {
    alert(err.message);
  }
}

function taskActionButtons(task, listId) {
  if (task.status === "PENDING") {
    return `<button class="btn-primary btn-small" onclick="startTask(${task.id}, ${listId})">Start</button>`;
  }
  if (task.status === "IN_PROGRESS") {
    return `
      <div style="display: flex; gap: 0.4rem;">
        <button class="btn-secondary btn-small" onclick="stopTask(${task.id}, ${listId})">Stop</button>
        <button class="btn-primary btn-small" onclick="completeTask(${task.id}, ${listId})">Complete</button>
      </div>
    `;
  }
  // COMPLETE — no action buttons
  return "";
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

// Fetch all user tasks for the selector
async function fetchAllTasks() {
  try {
    allTasksCache = await api("/tasks?sort_by=title&sort_order=asc");
  } catch (err) {
    allTasksCache = [];
  }
}

// Render the task selector checkboxes
function renderTaskSelector(selectedTaskIds = []) {
  const container = document.getElementById("list-task-selector");
  const searchVal = (document.getElementById("list-task-search").value || "").toLowerCase();

  const filtered = allTasksCache.filter((t) =>
    t.title.toLowerCase().includes(searchVal) ||
    (t.description || "").toLowerCase().includes(searchVal)
  );

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
        <span class="badge badge-priority-${task.priority}">${task.priority}</span>
        <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
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
}

// Show list modal for editing an existing list
async function editListModal(listId) {
  try {
    const list = await api(`/lists/${listId}`);
    await fetchAllTasks();

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
    await fetchAllTasks();
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
