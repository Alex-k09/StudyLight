import { supabase } from "./supabase.js";

const STORAGE_KEY = "focuslight-board";

const sessionStatusEl = document.getElementById("sessionStatus");
const loginLink = document.getElementById("loginLink");
const settingsLink = document.getElementById("settingsLink");
const statsEl = document.getElementById("stats");
const groupsEl = document.getElementById("groups");
const appMessage = document.getElementById("appMessage");
const dataLoading = document.getElementById("dataLoading");
const subjectInput = document.getElementById("newSubject");
const addSubjectBtn = document.getElementById("addSubjectBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

const state = { user: null, subjects: [], guestSubjects: loadGuestSubjects() };
const uiState = { openSubjects: {} };
let messageTimer;
let hideTimer;

init();

function init() {
  bindHandlers();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      handleSession(session.user);
    } else {
      switchToGuest();
    }
  });
  ensureSession();
}

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (user) {
    handleSession(user);
  } else {
    switchToGuest();
  }
}

function bindHandlers() {
  addSubjectBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    createSubject();
  });

  subjectInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createSubject();
    }
  });

  groupsEl?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const subjectId = target.dataset.subjectId;
    const topicId = target.dataset.topicId;
    const action = target.dataset.action;
    if (action === "toggle-subject") toggleSubject(subjectId);
    if (action === "delete-subject") deleteSubject(subjectId);
    if (action === "add-topic") addTopic(subjectId);
    if (action === "delete-topic") deleteTopic(subjectId, topicId);
    if (action === "set-status") updateTopicStatus(subjectId, topicId, target.dataset.status);
  });

  groupsEl?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const subjectId = target.dataset.subjectId;
    const topicId = target.dataset.topicId;
    if (target.classList.contains("subject-input")) {
      updateSubjectName(subjectId, target.value);
    } else if (target.classList.contains("topic-name")) {
      updateTopicName(subjectId, topicId, target.value);
    }
  });

  exportBtn?.addEventListener("click", handleExport);
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handleImport(file);
    event.target.value = "";
  });

  loginLink?.addEventListener("click", async (event) => {
    if (state.user) {
      event.preventDefault();
      await supabase.auth.signOut();
    }
  });
}

function switchToGuest() {
  state.user = null;
  state.subjects = cloneSubjects(state.guestSubjects);
  setDataLoading(false);
  updateSessionUI();
  renderAll();
}

function handleSession(user) {
  state.user = user;
  updateSessionUI();
  fetchSubjects();
}

function updateSessionUI() {
  if (state.user) {
    sessionStatusEl.textContent = `Signed in as ${state.user.email}`;
    settingsLink?.classList.remove("is-hidden");
    loginLink.textContent = "Sign out";
    loginLink.setAttribute("href", "#");
  } else {
    sessionStatusEl.textContent = "Guest mode - not signed in";
    settingsLink?.classList.add("is-hidden");
    loginLink.textContent = "Log in / Sign up";
    loginLink.setAttribute("href", "login.html");
  }
}

async function fetchSubjects() {
  if (!state.user) return;
  setDataLoading(true, "Loading your study data…");
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, created_at, topics (id, name, status, notes, created_at)")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: true })
    .order("created_at", { ascending: true, foreignTable: "topics" });

  setDataLoading(false);

  if (error) {
    console.error(error);
    setAppMessage(error.message || "Could not load subjects.", "error");
    return;
  }

  const subjects = (data || []).map((subject) => ({ ...subject, topics: subject.topics || [] }));
  state.subjects = subjects;
  subjects.forEach((subject) => {
    if (uiState.openSubjects[subject.id] === undefined) uiState.openSubjects[subject.id] = true;
  });
  renderAll();
}

function createSubject() {
  const name = subjectInput.value.trim();
  if (!name) {
    setAppMessage("Give the subject a name first.", "error");
    return;
  }

  if (!state.user) {
    const subject = { id: generateId(), name, topics: [] };
    state.subjects.push(subject);
    uiState.openSubjects[subject.id] = true;
    subjectInput.value = "";
    persistGuest();
    renderAll();
    return;
  }

  addSubjectBtn?.setAttribute("aria-busy", "true");
  supabase
    .from("subjects")
    .insert({ name, user_id: state.user.id })
    .select("id, name, created_at")
    .single()
    .then(({ data, error }) => {
      addSubjectBtn?.removeAttribute("aria-busy");
      if (error) {
        console.error(error);
        setAppMessage(error.message || "Could not add subject.", "error");
        return;
      }
      const subject = { ...data, topics: [] };
      state.subjects.push(subject);
      uiState.openSubjects[subject.id] = true;
      subjectInput.value = "";
      renderAll();
    });
}

function deleteSubject(subjectId) {
  if (!subjectId) return;
  if (!confirm("Delete this subject and its topics?")) return;

  if (!state.user) {
    state.subjects = state.subjects.filter((subject) => subject.id !== subjectId);
    delete uiState.openSubjects[subjectId];
    persistGuest();
    renderAll();
    return;
  }

  supabase
    .from("subjects")
    .delete()
    .eq("id", subjectId)
    .eq("user_id", state.user.id)
    .then(({ error }) => {
      if (error) {
        console.error(error);
        setAppMessage(error.message || "Could not delete subject.", "error");
        return;
      }
      state.subjects = state.subjects.filter((subject) => subject.id !== subjectId);
      delete uiState.openSubjects[subjectId];
      renderAll();
    });
}

function addTopic(subjectId) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;

  if (!state.user) {
    const topic = { id: generateId(), name: "", status: "red" };
    subject.topics.push(topic);
    uiState.openSubjects[subjectId] = true;
    persistGuest();
    renderAll();
    return;
  }

  supabase
    .from("topics")
    .insert({ subject_id: subjectId, user_id: state.user.id, name: "", status: "red" })
    .select("id, name, status, created_at")
    .single()
    .then(({ data, error }) => {
      if (error) {
        console.error(error);
        setAppMessage(error.message || "Could not add topic.", "error");
        return;
      }
      subject.topics.push(data);
      uiState.openSubjects[subjectId] = true;
      renderAll();
    });
}

function deleteTopic(subjectId, topicId) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;

  if (!state.user) {
    subject.topics = subject.topics.filter((topic) => topic.id !== topicId);
    persistGuest();
    renderAll();
    return;
  }

  supabase
    .from("topics")
    .delete()
    .eq("id", topicId)
    .eq("subject_id", subjectId)
    .eq("user_id", state.user.id)
    .then(({ error }) => {
      if (error) {
        console.error(error);
        setAppMessage(error.message || "Could not delete topic.", "error");
        return;
      }
      subject.topics = subject.topics.filter((topic) => topic.id !== topicId);
      renderAll();
    });
}

function updateTopicStatus(subjectId, topicId, status) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics.find((t) => t.id === topicId);
  if (!topic || topic.status === status) return;
  const previous = topic.status;
  topic.status = status;
  renderAll();

  if (!state.user) {
    persistGuest();
    return;
  }

  supabase
    .from("topics")
    .update({ status })
    .eq("id", topicId)
    .eq("subject_id", subjectId)
    .eq("user_id", state.user.id)
    .then(({ error }) => {
      if (error) {
        console.error(error);
        topic.status = previous;
        renderAll();
        setAppMessage(error.message || "Could not update topic.", "error");
      }
    });
}

function updateSubjectName(subjectId, value) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  const trimmed = value.trim();
  if (!trimmed) {
    setAppMessage("Subject name cannot be empty.", "error");
    renderAll();
    return;
  }
  const previous = subject.name;
  subject.name = trimmed;
  renderAll();

  if (!state.user) {
    persistGuest();
    return;
  }

  supabase
    .from("subjects")
    .update({ name: trimmed })
    .eq("id", subjectId)
    .eq("user_id", state.user.id)
    .then(({ error }) => {
      if (error) {
        subject.name = previous;
        renderAll();
        setAppMessage(error.message || "Could not rename subject.", "error");
      }
    });
}

function updateTopicName(subjectId, topicId, value) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics.find((t) => t.id === topicId);
  if (!topic) return;
  const trimmed = value.trimStart();
  const previous = topic.name;
  topic.name = trimmed;
  renderAll();

  if (!state.user) {
    persistGuest();
    return;
  }

  supabase
    .from("topics")
    .update({ name: trimmed })
    .eq("id", topicId)
    .eq("subject_id", subjectId)
    .eq("user_id", state.user.id)
    .then(({ error }) => {
      if (error) {
        topic.name = previous;
        renderAll();
        setAppMessage(error.message || "Could not rename topic.", "error");
      }
    });
}

function toggleSubject(subjectId) {
  uiState.openSubjects[subjectId] = !uiState.openSubjects[subjectId];
  renderGroups();
}

function countsForTopics(topics) {
  return {
    red: topics.filter((t) => t.status === "red").length,
    amber: topics.filter((t) => t.status === "amber").length,
    green: topics.filter((t) => t.status === "green").length,
  };
}

function renderAll() {
  renderStats();
  renderGroups();
}

function renderStats() {
  const allTopics = state.subjects.flatMap((s) => s.topics || []);
  const counts = countsForTopics(allTopics);
  if (!allTopics.length && !state.subjects.length) {
    statsEl.innerHTML = "";
    return;
  }
  statsEl.innerHTML = `
    <span class="tag"><span class="dot red"></span>${counts.red} red</span>
    <span class="tag"><span class="dot amber"></span>${counts.amber} amber</span>
    <span class="tag"><span class="dot green"></span>${counts.green} green</span>
    <span class="tag">${state.subjects.length} subjects</span>
    <span class="tag">${allTopics.length} topics</span>
  `;
}

function renderGroups() {
  if (!state.subjects.length) {
    groupsEl.innerHTML = '<div class="empty">No subjects yet. Add one above.</div>';
    return;
  }
  groupsEl.innerHTML = state.subjects
    .map((subject) => {
      const open = uiState.openSubjects[subject.id] ?? true;
      const counts = countsForTopics(subject.topics || []);
      const caret = open ? "&#9662;" : "&#9656;";
      return `
        <div class="group" data-subject-id="${subject.id}">
          <div class="group-head">
            <div class="group-left">
              <button class="chev" data-action="toggle-subject" data-subject-id="${subject.id}">${caret}</button>
              <input class="subject-input" type="text" value="${escapeHtml(subject.name)}" data-subject-id="${subject.id}" />
              <span class="count-mini">${subject.topics.length} topics &middot; ${counts.red} red &middot; ${counts.amber} amber &middot; ${counts.green} green</span>
            </div>
            <div class="group-actions">
              <button data-action="add-topic" data-subject-id="${subject.id}">Add topic</button>
              <button class="icon-btn" data-action="delete-subject" data-subject-id="${subject.id}" title="Delete subject">&#128465;</button>
            </div>
          </div>
          <div class="topics ${open ? "" : "is-collapsed"}">
            ${renderTopics(subject)}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTopics(subject) {
  if (!subject.topics.length) {
    return '<div class="empty" style="margin:16px;">No topics in this subject yet.</div>';
  }
  return subject.topics
    .map(
      (topic) => `
      <div class="topic" data-topic-id="${topic.id}">
        <input class="topic-name" type="text" value="${escapeHtml(topic.name || "")}" placeholder="Topic name" data-subject-id="${subject.id}" data-topic-id="${topic.id}" />
        <div class="slider">
          ${renderLight(subject.id, topic.id, topic.status, "red")}
          ${renderLight(subject.id, topic.id, topic.status, "amber")}
          ${renderLight(subject.id, topic.id, topic.status, "green")}
        </div>
        <button class="icon-btn" data-action="delete-topic" data-subject-id="${subject.id}" data-topic-id="${topic.id}" title="Delete topic">&#128465;</button>
      </div>
    `
    )
    .join("");
}

function renderLight(subjectId, topicId, current, status) {
  const active = current === status ? "active" : "";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `
    <button class="light ${active}" data-action="set-status" data-status="${status}" data-subject-id="${subjectId}" data-topic-id="${topicId}" title="${label}">
      <span class="dot ${status}"></span>
    </button>
  `;
}

function handleExport() {
  const payload = JSON.stringify(state.subjects, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "study-traffic-lights-backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleImport(file) {
  if (!state.user) {
    setAppMessage("Sign in to import a backup into your account.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Invalid backup");
      await importBackupForAccount(parsed);
      setAppMessage("Backup imported.", "info");
    } catch (error) {
      console.error(error);
      setAppMessage(error.message || "That file could not be imported.", "error");
    }
  };
  reader.onerror = () => setAppMessage("That file could not be imported.", "error");
  reader.readAsText(file);
}

function setDataLoading(visible, message = "") {
  if (!dataLoading) return;
  dataLoading.textContent = message;
  dataLoading.classList.toggle("hidden", !visible);
}

function setAppMessage(message, type = "info") {
  if (!appMessage) return;
  if (messageTimer) clearTimeout(messageTimer);
  if (hideTimer) clearTimeout(hideTimer);
  appMessage.textContent = message;
  appMessage.dataset.state = type;
  appMessage.classList.remove("hidden", "visible");
  void appMessage.offsetWidth;
  appMessage.classList.add("visible");
  messageTimer = setTimeout(() => {
    appMessage.classList.remove("visible");
    hideTimer = setTimeout(() => appMessage.classList.add("hidden"), 200);
  }, 3500);
}

function persistGuest() {
  state.guestSubjects = cloneSubjects(state.subjects);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.guestSubjects));
  } catch (error) {
    console.warn("Could not save guest data", error);
  }
}

function loadGuestSubjects() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn("Could not read guest data", error);
    return [];
  }
}

function cloneSubjects(subjects) {
  return (subjects || []).map((subject) => ({
    ...subject,
    topics: (subject.topics || []).map((topic) => ({ ...topic })),
  }));
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function generateId() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

async function importBackupForAccount(rawSubjects) {
  if (!state.user) return;
  setDataLoading(true, "Importing backup…");
  const normalized = normalizeBackupSubjects(rawSubjects);
  try {
    const { error: deleteError } = await supabase.from("subjects").delete().eq("user_id", state.user.id);
    if (deleteError) throw deleteError;

    for (const subject of normalized) {
      const { data: insertedSubject, error: subjectError } = await supabase
        .from("subjects")
        .insert({ name: subject.name || "Imported subject", user_id: state.user.id })
        .select("id")
        .single();
      if (subjectError) throw subjectError;

      if (subject.topics.length) {
        const topicRows = subject.topics.map((topic) => ({
          subject_id: insertedSubject.id,
          user_id: state.user.id,
          name: topic.name,
          status: topic.status,
          notes: topic.notes,
        }));
        const { error: topicsError } = await supabase.from("topics").insert(topicRows);
        if (topicsError) throw topicsError;
      }
    }

    await fetchSubjects();
  } finally {
    setDataLoading(false);
  }
}

function normalizeBackupSubjects(rawSubjects) {
  const allowedStatuses = new Set(["red", "amber", "green"]);
  return (rawSubjects || [])
    .filter((subject) => subject && typeof subject === "object")
    .map((subject, index) => {
      const name =
        typeof subject.name === "string" && subject.name.trim()
          ? subject.name.trim()
          : `Imported subject ${index + 1}`;
      const topics = Array.isArray(subject.topics)
        ? subject.topics
            .filter((topic) => topic && typeof topic === "object")
            .map((topic) => ({
              name: typeof topic.name === "string" ? topic.name.trim() : "",
              status: allowedStatuses.has(topic.status) ? topic.status : "red",
              notes: typeof topic.notes === "string" ? topic.notes : "",
            }))
        : [];
      return { name, topics };
    });
}
