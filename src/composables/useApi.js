import { computed, reactive, readonly, ref } from 'vue';

// ── Global state (module-level singleton) ───────────────────────────────────
const sessions = ref([]);
const selectedProject = ref(null);
const recentSessions = ref([]);
// Folder list for the sidebar — cheap (stat-only) metadata, no session contents.
const projects = ref([]);
const projectsReady = ref(false);
// Per-project session cache (lazy-loaded when a sidebar group is expanded).
// slug -> { sessions: [], loading: bool, loaded: bool }
const projectSessions = reactive({});
const folderContents = ref([]);
const currentFolder = ref(null);
const currentVersion = ref(null);
const updateAvailable = ref(null);
const rootPath = ref(null);
const homePath = ref(null);
const liveSessions = ref([]);
const searchResults = ref([]);
const searchTruncated = ref(false);
const searchLoading = ref(false);

const liveBySessionId = computed(() => {
  const map = {};
  for (const s of liveSessions.value) map[s.sessionId] = s;
  return map;
});

let rcPollTimer = null;
let searchController = null;
let recentSessionsDebounceTimer = null;

// ── Core fetch helper ───────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`/api/v2${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...rest,
  });
  if (res.status === 401) {
    if (window.location.pathname !== '/auth') {
      window.location.href = '/auth';
    }
    throw new Error('Unauthenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── RC polling ──────────────────────────────────────────────────────────────
function startRcPolling() {
  stopRcPolling();
  rcPollTimer = setInterval(() => {
    if (!document.hidden) listRcSessions();
  }, 10000);
}

function stopRcPolling() {
  if (rcPollTimer) {
    clearInterval(rcPollTimer);
    rcPollTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && rcPollTimer) listRcSessions();
});

// ── Global actions ──────────────────────────────────────────────────────────
async function loadInfo() {
  try {
    const data = await apiFetch('/info');
    if (data.version) currentVersion.value = data.version;
    if (data.rootPath) rootPath.value = data.rootPath;
    if (data.homePath) homePath.value = data.homePath;
    if (data.updateAvailable?.latestVersion) {
      const key = `dismissed-update:${data.updateAvailable.latestVersion}`;
      if (localStorage.getItem(key) !== 'true') {
        updateAvailable.value = data.updateAvailable;
      }
    }
  } catch (err) {
    console.error('[useApi] loadInfo failed:', err.message);
  } finally {
    startRcPolling();
  }
}

async function selectProject(slug) {
  try {
    const data = await apiFetch(
      `/projects/${encodeURIComponent(slug)}/sessions`,
    );
    sessions.value = data.sessions;
    selectedProject.value = data.project;
  } catch (err) {
    console.error('[useApi] selectProject failed:', err.message);
  }
}

// Folder list for the sidebar — sorted by recent activity, no session contents.
async function getProjects() {
  try {
    const data = await apiFetch('/projects');
    projects.value = data.projects;
  } catch (err) {
    console.error('[useApi] getProjects failed:', err.message);
  } finally {
    projectsReady.value = true;
  }
}

// Lazily load a single project's session list (on sidebar group expand).
// Cached per slug; concurrent/duplicate calls are coalesced. Pass
// { force: true } to bypass the cache (e.g. after starting a new session).
async function loadProjectSessions(slug, { force = false } = {}) {
  const existing = projectSessions[slug];
  if (!force && (existing?.loaded || existing?.loading)) return;
  projectSessions[slug] = {
    sessions: existing?.sessions ?? [],
    loading: true,
    loaded: existing?.loaded ?? false,
  };
  try {
    const data = await apiFetch(
      `/projects/${encodeURIComponent(slug)}/sessions`,
    );
    projectSessions[slug] = {
      sessions: data.sessions ?? [],
      loading: false,
      loaded: true,
    };
  } catch (err) {
    console.error('[useApi] loadProjectSessions failed:', err.message);
    projectSessions[slug] = {
      sessions: existing?.sessions ?? [],
      loading: false,
      loaded: existing?.loaded ?? false,
    };
  }
}

function getRecentSessionsImmediate() {
  if (recentSessionsDebounceTimer) clearTimeout(recentSessionsDebounceTimer);
  recentSessionsDebounceTimer = setTimeout(async () => {
    recentSessionsDebounceTimer = null;
    try {
      const data = await apiFetch('/sessions/recent?limit=200');
      recentSessions.value = data.sessions;
    } catch (err) {
      console.error('[useApi] getRecentSessions failed:', err.message);
    }
  }, 50);
}

async function browseFolder(path) {
  try {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    const data = await apiFetch(`/fs/browse${params}`);
    folderContents.value = data.contents;
    currentFolder.value = data.path;
  } catch (err) {
    console.error('[useApi] browseFolder failed:', err.message);
  }
}

async function listRcSessions() {
  try {
    const data = await apiFetch('/rc/sessions');
    liveSessions.value = data.sessions;
  } catch (err) {
    console.error('[useApi] listRcSessions failed:', err.message);
  }
}

async function searchSessions(query, opts = {}) {
  if (searchController) searchController.abort();
  searchController = new AbortController();
  searchLoading.value = true;
  searchResults.value = [];
  try {
    const params = new URLSearchParams({ q: query });
    if (opts.projectSlug) params.set('projectSlug', opts.projectSlug);
    if (opts.limit) params.set('limit', String(opts.limit));
    const data = await apiFetch(`/sessions/search?${params}`, {
      signal: searchController.signal,
    });
    searchResults.value = data.items || [];
    searchTruncated.value = data.truncated || false;
    searchLoading.value = false;
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[useApi] search failed:', err.message);
    searchLoading.value = false;
  }
}

function clearSearch() {
  if (searchController) {
    searchController.abort();
    searchController = null;
  }
  searchResults.value = [];
  searchTruncated.value = false;
  searchLoading.value = false;
}

async function createProject(parentPath, name) {
  return apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify({ parentPath, name }),
  });
}

async function startRcSession(opts) {
  const data = await apiFetch('/rc/sessions', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  listRcSessions();
  getRecentSessionsImmediate();
  // Refresh the affected project's folder metadata + cached session list.
  // Force-refresh if the group has ever been opened (entry exists), so a
  // session started mid-load still appears.
  if (opts.projectSlug) {
    getProjects();
    if (projectSessions[opts.projectSlug]) {
      loadProjectSessions(opts.projectSlug, { force: true });
    }
  }
  return data;
}

async function stopRcSession(opts) {
  const endpoint = opts.sessionId
    ? `/rc/sessions/by-session/${encodeURIComponent(opts.sessionId)}`
    : `/rc/sessions/${opts.pid}`;
  const data = await apiFetch(endpoint, { method: 'DELETE' });
  listRcSessions();
  return data;
}

function startNewRcSession(projectSlug) {
  return startRcSession({ projectSlug });
}

async function deleteSession(projectSlug, sessionId) {
  await apiFetch(
    `/projects/${encodeURIComponent(projectSlug)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);
  recentSessions.value = recentSessions.value.filter(
    (s) => s.sessionId !== sessionId,
  );
  // Drop from the lazy per-project cache and decrement the folder's count.
  const cached = projectSessions[projectSlug];
  if (cached) {
    cached.sessions = cached.sessions.filter((s) => s.sessionId !== sessionId);
  }
  const proj = projects.value.find((p) => p.slug === projectSlug);
  if (proj && proj.sessionCount > 0) proj.sessionCount -= 1;
}

function dismissUpdate(version) {
  localStorage.setItem(`dismissed-update:${version}`, 'true');
  updateAvailable.value = null;
}

// ── Global singleton export ─────────────────────────────────────────────────
export function useApi() {
  return {
    sessions: readonly(sessions),
    selectedProject: readonly(selectedProject),
    recentSessions: readonly(recentSessions),
    projects: readonly(projects),
    projectsReady: readonly(projectsReady),
    projectSessions: readonly(projectSessions),
    folderContents: readonly(folderContents),
    currentFolder: readonly(currentFolder),
    currentVersion: readonly(currentVersion),
    updateAvailable: readonly(updateAvailable),
    rootPath: readonly(rootPath),
    homePath: readonly(homePath),
    liveSessions: readonly(liveSessions),
    searchResults: readonly(searchResults),
    searchTruncated: readonly(searchTruncated),
    searchLoading: readonly(searchLoading),
    liveBySessionId,
    loadInfo,
    selectProject,
    getProjects,
    loadProjectSessions,
    getRecentSessionsImmediate,
    browseFolder,
    listRcSessions,
    searchSessions,
    clearSearch,
    createProject,
    startRcSession,
    stopRcSession,
    startNewRcSession,
    deleteSession,
    dismissUpdate,
  };
}

// ── Per-ChatView instance ───────────────────────────────────────────────────
export function useChatApi() {
  const messages = ref([]);
  const currentProject = ref(null);
  const currentSession = ref(null);
  const sessionTitle = computed(() => {
    const sid = currentSession.value;
    if (!sid) return null;
    // Prefer the per-project lazy cache (loaded for the current project),
    // then fall back to recent sessions (populated by the palette).
    const slug = currentProject.value?.slug;
    const cached = slug ? projectSessions[slug]?.sessions : null;
    return (
      cached?.find((s) => s.sessionId === sid)?.title ??
      recentSessions.value.find((s) => s.sessionId === sid)?.title ??
      null
    );
  });
  const hasOlderMessages = ref(false);
  const summaryCount = ref(0);
  const contextReady = ref(false);
  const loadingOlderMessages = ref(false);
  const totalTurns = ref(0);
  const loadedTurns = ref(0);
  const messagesOffset = ref(0);

  function _getProjectInfo(projectSlug) {
    if (selectedProject.value?.slug === projectSlug)
      return selectedProject.value;
    // The folder list is loaded cheaply on app start — use it for name/path.
    const project = projects.value.find((p) => p.slug === projectSlug);
    if (project)
      return { slug: projectSlug, name: project.name, path: project.path };
    const recent = recentSessions.value.find(
      (s) => s.projectSlug === projectSlug,
    );
    if (recent)
      return {
        slug: projectSlug,
        name: recent.projectName,
        path: recent.projectPath,
      };
    return { slug: projectSlug, name: projectSlug.replace(/^-/, ''), path: '' };
  }

  async function selectSession(projectSlug, sessionId) {
    currentSession.value = sessionId;
    messages.value = [];
    hasOlderMessages.value = false;
    summaryCount.value = 0;
    contextReady.value = false;
    currentProject.value = _getProjectInfo(projectSlug);
    // Warm the per-project cache so the title resolves even on a cold
    // deep-link (independent of the sidebar being mounted).
    loadProjectSessions(projectSlug);

    try {
      const data = await apiFetch(
        `/projects/${encodeURIComponent(projectSlug)}/sessions/${encodeURIComponent(sessionId)}`,
      );
      if (currentSession.value !== sessionId) return;
      messages.value = data.messages || [];
      hasOlderMessages.value = data.hasOlderMessages || false;
      summaryCount.value = data.summaryCount || 0;
      totalTurns.value = data.totalTurns || 0;
      loadedTurns.value = data.loadedTurns || 0;
      messagesOffset.value = data.offset || 0;
      contextReady.value = true;
    } catch (err) {
      if (currentSession.value !== sessionId) return;
      console.error('[useChatApi] selectSession failed:', err.message);
      contextReady.value = true;
    }
  }

  async function loadFullHistory() {
    if (!currentSession.value || !currentProject.value) return;
    const sessionId = currentSession.value;
    const projectSlug = currentProject.value.slug;
    messages.value = [];
    contextReady.value = false;
    try {
      const data = await apiFetch(
        `/projects/${encodeURIComponent(projectSlug)}/sessions/${encodeURIComponent(sessionId)}?fullHistory=true`,
      );
      if (currentSession.value !== sessionId) return;
      messages.value = data.messages || [];
      hasOlderMessages.value = data.hasOlderMessages || false;
      totalTurns.value = data.totalTurns || 0;
      loadedTurns.value = data.loadedTurns || 0;
      messagesOffset.value = data.offset || 0;
      contextReady.value = true;
    } catch (err) {
      if (currentSession.value !== sessionId) return;
      console.error('[useChatApi] loadFullHistory failed:', err.message);
      contextReady.value = true;
    }
  }

  async function loadOlderMessages(turnLimit = 5) {
    if (
      !currentSession.value ||
      !currentProject.value ||
      loadingOlderMessages.value
    )
      return;
    loadingOlderMessages.value = true;
    const sessionId = currentSession.value;
    const projectSlug = currentProject.value.slug;
    try {
      const params = new URLSearchParams({
        offset: String(messagesOffset.value),
        turnLimit: String(turnLimit),
      });
      const data = await apiFetch(
        `/projects/${encodeURIComponent(projectSlug)}/sessions/${encodeURIComponent(sessionId)}/older?${params}`,
      );
      if (currentSession.value !== sessionId) return;
      messages.value = [...data.messages, ...messages.value];
      hasOlderMessages.value = data.hasOlderMessages || false;
      totalTurns.value = data.totalTurns || totalTurns.value;
      loadedTurns.value = (data.loadedTurns || 0) + (loadedTurns.value || 0);
      messagesOffset.value = data.offset || 0;
    } catch (err) {
      console.error('[useChatApi] loadOlderMessages failed:', err.message);
    } finally {
      if (currentSession.value === sessionId)
        loadingOlderMessages.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
  }

  return {
    messages: readonly(messages),
    currentProject: readonly(currentProject),
    currentSession: readonly(currentSession),
    sessionTitle,
    hasOlderMessages: readonly(hasOlderMessages),
    summaryCount: readonly(summaryCount),
    contextReady: readonly(contextReady),
    loadingOlderMessages: readonly(loadingOlderMessages),
    totalTurns: readonly(totalTurns),
    loadedTurns: readonly(loadedTurns),
    selectSession,
    loadFullHistory,
    loadOlderMessages,
    clearMessages,
  };
}
