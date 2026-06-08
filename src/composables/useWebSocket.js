import { computed, onUnmounted, readonly, ref } from 'vue';

// ============================================
// GLOBAL STATE (shared across all components)
// Used for: project list, session list, folder browser, RC manager
// ============================================

const globalConnected = ref(false);
const globalConnectionState = ref('disconnected'); // 'connected' | 'connecting' | 'disconnected'
const sessions = ref([]);
const selectedProject = ref(null); // { slug, name, path } from project_selected
const recentSessions = ref([]);
const folderContents = ref([]);
const currentFolder = ref(null);

// Version info
const currentVersion = ref(null);
const updateAvailable = ref(null); // { currentVersion, latestVersion, updateUrl }

// Root path restriction (if --root is set on server)
const rootPath = ref(null);
// Home path — topmost browsable directory (rootPath if set, otherwise server home)
const homePath = ref(null);
// True once the first recent_sessions response is received
const sessionsReady = ref(false);

// RC manager state
const liveSessions = ref([]); // from rc:list:result
const searchResults = ref([]); // from search:sessions:result
const searchTruncated = ref(false);
const searchLoading = ref(false);

// Shared sessionId → live entry lookup (single rebuild per rc:list:result)
const liveBySessionId = computed(() => {
  const map = {};
  for (const s of liveSessions.value) map[s.sessionId] = s;
  return map;
});

let globalWs = null;
let globalReconnectTimeout = null;

// Poll rc:list every 10s while connected so live status (rcActive, URL,
// busy/idle, stop button) stays current without manual refresh. Skipped
// while the tab is hidden.
let rcPollTimer = null;

function startRcPolling() {
  stopRcPolling();
  rcPollTimer = setInterval(() => {
    if (!document.hidden) {
      sendGlobal({ type: 'rc:list' });
    }
  }, 10000);
}

function stopRcPolling() {
  if (rcPollTimer) {
    clearInterval(rcPollTimer);
    rcPollTimer = null;
  }
}

// Refresh immediately when the tab regains visibility (instead of waiting
// up to 10s for the next poll tick)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && rcPollTimer) {
    sendGlobal({ type: 'rc:list' });
  }
});

// Global message listeners for components
const globalMessageListeners = [];

// Callbacks to run when connection is established
let onConnectCallbacks = [];

function connectGlobal(onConnect) {
  // Register callback if provided
  if (onConnect) {
    onConnectCallbacks.push(onConnect);
  }

  // If already connected, run callback immediately
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    if (onConnect) onConnect();
    return;
  }

  // If already connecting, just wait for callback
  if (globalWs && globalWs.readyState === WebSocket.CONNECTING) {
    return;
  }

  // Clear any pending reconnect
  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  globalConnectionState.value = 'connecting';
  globalWs = new WebSocket(wsUrl);

  globalWs.onopen = () => {
    globalConnected.value = true;
    globalConnectionState.value = 'connected';
    startRcPolling();
    // Run all pending callbacks
    const callbacks = onConnectCallbacks;
    onConnectCallbacks = [];
    for (const cb of callbacks) {
      cb();
    }
  };

  globalWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleGlobalMessage(msg);
  };

  globalWs.onclose = () => {
    globalConnected.value = false;
    globalConnectionState.value = 'disconnected';
    globalWs = null;
    stopRcPolling();
    globalReconnectTimeout = setTimeout(connectGlobal, 3000);
  };

  globalWs.onerror = () => {
    globalConnected.value = false;
    globalConnectionState.value = 'disconnected';
  };
}

// Add a global message listener
function addGlobalMessageListener(callback) {
  globalMessageListeners.push(callback);
  // Return unsubscribe function
  return () => {
    const index = globalMessageListeners.indexOf(callback);
    if (index > -1) {
      globalMessageListeners.splice(index, 1);
    }
  };
}

function handleGlobalMessage(msg) {
  switch (msg.type) {
    case 'connected':
      if (msg.version) {
        currentVersion.value = msg.version;
      }
      if (msg.rootPath) {
        rootPath.value = msg.rootPath;
      }
      if (msg.homePath) {
        homePath.value = msg.homePath;
      }
      break;

    case 'update_available':
      // Check if already dismissed for this version
      if (msg.latestVersion) {
        const dismissedKey = `dismissed-update:${msg.latestVersion}`;
        if (localStorage.getItem(dismissedKey) !== 'true') {
          updateAvailable.value = {
            currentVersion: msg.currentVersion,
            latestVersion: msg.latestVersion,
            updateUrl: msg.updateUrl,
          };
        }
      }
      break;

    case 'upgrade_started':
    case 'upgrade_installing':
    case 'restart_started':
      // These are informational - Sidebar handles the UI state
      console.log(msg.type, msg.message);
      break;

    case 'upgrade_success':
      // Clear update badge on successful upgrade
      updateAvailable.value = null;
      console.log(msg.type, msg.message);
      break;

    case 'upgrade_error':
    case 'restart_error':
      // Show error in console (Sidebar handles UI)
      console.error(msg.type, msg.message);
      break;

    case 'project_selected':
      sessions.value = msg.sessions;
      selectedProject.value = msg.project || { slug: msg.path };
      break;

    case 'sessions_list':
      sessions.value = msg.sessions;
      break;

    case 'recent_sessions':
      recentSessions.value = msg.sessions;
      sessionsReady.value = true;
      break;

    case 'folder_contents':
      folderContents.value = msg.contents;
      currentFolder.value = msg.path;
      break;

    case 'session_deleted':
      // Remove session from lists
      if (msg.sessionId) {
        sessions.value = sessions.value.filter(
          (s) => s.sessionId !== msg.sessionId,
        );
        recentSessions.value = recentSessions.value.filter(
          (s) => s.sessionId !== msg.sessionId,
        );
      }
      break;

    case 'rc:list:result':
      liveSessions.value = msg.sessions || [];
      break;

    case 'rc:start:result':
      // Refresh live sessions and recents — a new session may have appeared
      sendGlobal({ type: 'rc:list' });
      getRecentSessionsImmediate();
      break;

    case 'rc:stop:result':
      // Refresh live sessions list after any RC change
      sendGlobal({ type: 'rc:list' });
      break;

    case 'search:sessions:result':
      searchResults.value = msg.items || [];
      searchTruncated.value = msg.truncated || false;
      searchLoading.value = false;
      break;
  }
  // Call all registered message listeners
  for (const listener of globalMessageListeners) {
    listener(msg);
  }
}

function sendGlobal(message) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(message));
  }
}

/**
 * Send a message and wait for a specific response type
 * @param {object} message - Message to send
 * @param {string} responseType - Expected response message type
 * @param {number} timeout - Timeout in ms (default 30000)
 * @returns {Promise<object>} Response message
 */
function sendAndWaitGlobal(message, responseType, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    let timeoutId;

    const messageHandler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === responseType) {
          clearTimeout(timeoutId);
          globalWs.removeEventListener('message', messageHandler);
          resolve(msg);
        }
      } catch {
        // Ignore parse errors
      }
    };

    timeoutId = setTimeout(() => {
      globalWs.removeEventListener('message', messageHandler);
      reject(new Error(`Timeout waiting for ${responseType}`));
    }, timeout);

    globalWs.addEventListener('message', messageHandler);
    globalWs.send(JSON.stringify(message));
  });
}

// ── RC operations ───────────────────────────────────────────
// rc:start/rc:stop results carry no request correlation id, so concurrent
// sendAndWait calls could latch onto each other's responses. Serialize all
// RC operations through a promise chain so responses can't cross.
let rcOpChain = Promise.resolve();
function runRcOp(fn) {
  const run = rcOpChain.then(fn, fn);
  rcOpChain = run.catch(() => {});
  return run;
}

/**
 * Start (or resume) an RC session. Serialized; resolves with the
 * rc:start:result message ({ status, pid?, sessionId?, message? }).
 */
function startRcSession(opts, timeout = 10000) {
  return runRcOp(() =>
    sendAndWaitGlobal(
      { type: 'rc:start', ...opts },
      'rc:start:result',
      timeout,
    ),
  );
}

/**
 * Stop an RC session by sessionId or pid. Serialized; resolves with the
 * rc:stop:result message ({ status, pid? }).
 */
function stopRcSession(opts, timeout = 5000) {
  return runRcOp(() =>
    sendAndWaitGlobal({ type: 'rc:stop', ...opts }, 'rc:stop:result', timeout),
  );
}

/**
 * Spawn a brand-new RC session for a project and return its result.
 * Shared by Sidebar and SessionsView "new session" buttons.
 */
function startNewRcSession(projectSlug) {
  return startRcSession({ projectSlug });
}

function selectProjectGlobal(slug) {
  sendGlobal({ type: 'select_project', path: slug });
}

// Debounce timer shared by the recent-sessions fetch variants
let recentSessionsDebounceTimer = null;

// Fetch recent sessions (debounced 50ms to coalesce duplicate calls from
// Sidebar + view components). Limit 200 so the sidebar's project grouping
// and the palette's local filter both see deep history, not just the top 50.
function getRecentSessionsImmediate() {
  if (recentSessionsDebounceTimer) {
    clearTimeout(recentSessionsDebounceTimer);
  }
  recentSessionsDebounceTimer = setTimeout(() => {
    recentSessionsDebounceTimer = null;
    sendGlobal({ type: 'get_recent_sessions', limit: 200 });
  }, 50);
}

function browseFolder(path) {
  sendGlobal({ type: 'browse_folder', path });
}

function deleteSessionGlobal(sessionId) {
  sendGlobal({ type: 'delete_session', sessionId });
}

function dismissUpdate(version) {
  localStorage.setItem(`dismissed-update:${version}`, 'true');
  updateAvailable.value = null;
}

function disconnectGlobal() {
  stopRcPolling();
  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }
  if (globalWs) {
    globalWs.close();
    globalWs = null;
  }
}

/**
 * Global WebSocket composable
 * Shared singleton state: projects, sessions, RC sessions, search, folders
 */
export function useWebSocket() {
  return {
    // State (readonly)
    connected: readonly(globalConnected),
    connectionState: readonly(globalConnectionState),
    sessions: readonly(sessions),
    selectedProject: readonly(selectedProject),
    recentSessions: readonly(recentSessions),
    sessionsReady: readonly(sessionsReady),
    folderContents: readonly(folderContents),
    currentFolder: readonly(currentFolder),
    currentVersion: readonly(currentVersion),
    updateAvailable: readonly(updateAvailable),
    rootPath: readonly(rootPath),
    homePath: readonly(homePath),

    // RC manager
    liveSessions: readonly(liveSessions),
    searchResults: readonly(searchResults),
    searchTruncated: readonly(searchTruncated),
    searchLoading: readonly(searchLoading),

    // Connection
    connect: connectGlobal,
    disconnect: disconnectGlobal,

    // Actions
    selectProject: selectProjectGlobal,
    getRecentSessionsImmediate,
    browseFolder,
    deleteSession: deleteSessionGlobal,
    dismissUpdate,

    // RC manager
    liveBySessionId,
    listRcSessions() {
      sendGlobal({ type: 'rc:list' });
    },
    startRcSession,
    stopRcSession,
    startNewRcSession,
    searchSessions(query, opts = {}) {
      searchLoading.value = true;
      searchResults.value = [];
      sendGlobal({ type: 'search:sessions', query, ...opts });
    },
    clearSearch() {
      searchResults.value = [];
      searchTruncated.value = false;
      searchLoading.value = false;
    },
    createProject(parentPath, name) {
      sendGlobal({ type: 'project:create', parentPath, name });
    },

    // Direct send
    send: sendGlobal,
    sendAndWait: sendAndWaitGlobal,

    // Message listeners
    onMessage: addGlobalMessageListener,
  };
}

// ============================================
// SCOPED STATE (per ChatView instance)
// Each chat tab gets its own WebSocket + state
// ============================================

/**
 * Create a scoped WebSocket connection for a chat session
 * Each call creates a new independent connection with its own state
 */
export function useChatWebSocket() {
  // Per-instance state
  const connected = ref(false);
  const connectionState = ref('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  const messages = ref([]);
  const currentProject = ref(null);
  const currentSession = ref(null);
  // Derived from global recentSessions — no separate WS round-trip needed
  const _sessionTitle = computed(
    () =>
      recentSessions.value.find((s) => s.sessionId === currentSession.value)
        ?.title ?? null,
  );
  const hasOlderMessages = ref(false);
  const summaryCount = ref(0);
  const sessionActiveElsewhere = ref(false); // True if session is open in another tab
  const messagesOffset = ref(0); // Current offset for pagination (internal)
  const loadingOlderMessages = ref(false); // Loading state for "Load older" button
  const totalTurns = ref(0); // Total turn count
  const loadedTurns = ref(0); // Currently loaded turn count
  // Track if server-side context is ready (project selected and acknowledged)
  // This prevents sending prompts before server has our context after reconnect
  const contextReady = ref(false);

  let ws = null;
  let reconnectTimeout = null;
  const messageHandlers = new Set();

  function _connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    connectionState.value = 'connecting';
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected.value = true;
      connectionState.value = 'connected';
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
      for (const handler of messageHandlers) {
        handler(msg);
      }
    };

    ws.onclose = () => {
      connected.value = false;
      connectionState.value = 'disconnected';
      // Server context is lost on disconnect - need to re-select project on reconnect
      contextReady.value = false;
      // Only reconnect if ws reference still exists (not explicitly disconnected)
      const shouldReconnect = ws !== null;
      ws = null;
      if (shouldReconnect) {
        reconnectTimeout = setTimeout(_connect, 3000);
      }
    };

    ws.onerror = () => {
      connected.value = false;
      connectionState.value = 'disconnected';
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'connected':
        break;

      case 'project_selected':
        currentProject.value = msg.project || { slug: msg.path };
        // Server has acknowledged our project selection
        // But don't set contextReady yet - wait for session selection too
        break;

      case 'session_selected':
        console.log(
          '[useChatWebSocket] Received session_selected:',
          `sessionId=${msg.sessionId}`,
          `currentSession=${currentSession.value}`,
          `hasHistory=${msg.hasHistory}`,
          `projectPath=${msg.projectPath}`,
        );
        // Handle new session flow first (both null)
        if (msg.sessionId === null && currentSession.value === null) {
          // Both null - new session flow - no history to wait for
          contextReady.value = true;
          console.log(
            '[useChatWebSocket] New session flow - contextReady set to true',
          );
        } else if (msg.sessionId === currentSession.value) {
          // Session match - update state
          sessionActiveElsewhere.value = msg.isActiveElsewhere || false;
          // Don't clear messages here - selectSession() already did it
          // Clearing again creates a race window for cross-session messages
          // For brand new sessions with no history, set contextReady immediately
          // For existing sessions, wait for session_history to load
          if (msg.hasHistory === false) {
            // Brand new session with no history - ready immediately
            contextReady.value = true;
            console.log(
              '[useChatWebSocket] No history - contextReady set to true',
            );
          } else {
            console.log('[useChatWebSocket] Waiting for session_history...');
          }
          // Otherwise, don't set contextReady yet - wait for session_history to load first
        } else {
          // Session mismatch - this shouldn't happen but log it
          console.warn(
            `[useChatWebSocket] session_selected mismatch. Expected: ${currentSession.value}, Got: ${msg.sessionId}`,
          );
          // Don't set contextReady to true - wait for correct session
        }
        break;

      case 'session_active_elsewhere':
        sessionActiveElsewhere.value = msg.isActiveElsewhere;
        break;

      case 'session_history':
        // Only accept history if it matches current session (prevents race condition)
        console.log(
          '[useChatWebSocket] Received session_history:',
          `sessionId=${msg.sessionId}`,
          `currentSession=${currentSession.value}`,
          `messages=${msg.messages?.length || 0}`,
        );
        if (!msg.sessionId || msg.sessionId === currentSession.value) {
          messages.value = msg.messages || [];
          hasOlderMessages.value = msg.hasOlderMessages || false;
          summaryCount.value = msg.summaryCount || 0;
          totalTurns.value = msg.totalTurns || 0;
          loadedTurns.value = msg.loadedTurns || 0;
          messagesOffset.value = msg.offset || 0;
          // History loaded - NOW context is fully ready
          // This ensures: history loads → then typing indicator (if running) → then UI is interactive
          contextReady.value = true;
          console.log('[useChatWebSocket] contextReady set to true');
        } else {
          console.warn(
            `[useChatWebSocket] Ignoring session_history for different session. History sessionId: ${msg.sessionId}, Current sessionId: ${currentSession.value}`,
          );
        }
        break;

      case 'older_messages':
        // Prepend older messages to the beginning of the array
        if (msg.sessionId === currentSession.value) {
          messages.value = [...msg.messages, ...messages.value];
          hasOlderMessages.value = msg.hasOlderMessages || false;
          totalTurns.value = msg.totalTurns || totalTurns.value;
          loadedTurns.value = (msg.loadedTurns || 0) + (loadedTurns.value || 0);
          messagesOffset.value = msg.offset || 0;
          loadingOlderMessages.value = false;
        }
        break;

      case 'session_info':
        // Only accept session_info for the expected session. Without this guard,
        // a prompt started in session B (where ws was the originating client) can
        // send session_info(B) after the user has SPA-navigated to session A,
        // overwriting currentSession back to B and re-opening the bleed path.
        // Exception: currentSession is null (new-session bootstrap) — accept any ID.
        if (!currentSession.value || msg.sessionId === currentSession.value) {
          currentSession.value = msg.sessionId;
          contextReady.value = true;
        }
        break;

      // Streaming messages - only append if they belong to the current session.
      //
      // Filter logic:
      //   !msg.sessionId  → null-sessionId user echo (new session, pre-init). Only
      //                     reaches this client via direct send() from sendAndBroadcast,
      //                     never via broadcastToSession, so no cross-session leak risk.
      //   msg.sessionId === currentSession.value → matching session, accept normally.
      //   otherwise → mismatch, warn and reject (bleed guard).
      //
      // The old `!currentSession.value` fallback was the bleed source; this uses
      // `!msg.sessionId` instead — a message-side check, not a client-state check.
      // Safe because null-sessionId only comes from truly new sessions that haven't
      // been assigned an ID yet; the server-side watcher gate prevents other sessions'
      // null-sessionId messages from reaching this ws.
      case 'user':
      case 'text':
      case 'tool_use':
      case 'tool_result':
      case 'result':
        if (!msg.sessionId || msg.sessionId === currentSession.value) {
          messages.value.push(msg);
        } else {
          console.warn(
            `[useChatWebSocket] Ignoring message for different session. Message sessionId: ${msg.sessionId}, Current sessionId: ${currentSession.value}, Message type: ${msg.type}`,
          );
        }
        break;

      // Error messages: session-scoped errors are filtered like streaming messages;
      // errors without a sessionId are direct send() calls (e.g. "no project selected")
      // and must always pass through to avoid silent failures.
      case 'error':
        if (!msg.sessionId || msg.sessionId === currentSession.value) {
          messages.value.push(msg);
        } else {
          console.warn(
            `[useChatWebSocket] Ignoring error for different session. Message sessionId: ${msg.sessionId}, Current sessionId: ${currentSession.value}`,
          );
        }
        break;
    }
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function _disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (ws) {
      const socket = ws;
      ws = null; // Set to null before close to prevent reconnect in onclose
      socket.close();
    }
  }

  // Actions
  function _selectProject(slug) {
    send({ type: 'select_project', path: slug });
  }

  function _selectSession(sessionId, options = {}) {
    // Set currentSession IMMEDIATELY to prevent race condition
    // where streaming messages from other sessions arrive before server responds
    currentSession.value = sessionId;
    messages.value = [];
    hasOlderMessages.value = false;
    summaryCount.value = 0;
    // Reset contextReady until server acknowledges session selection
    contextReady.value = false;
    send({ type: 'select_session', sessionId, ...options });
  }

  function loadFullHistory() {
    if (currentSession.value) {
      messages.value = [];
      send({
        type: 'select_session',
        sessionId: currentSession.value,
        fullHistory: true,
      });
    }
  }

  function loadOlderMessages(turnLimit = 5) {
    if (currentSession.value && !loadingOlderMessages.value) {
      loadingOlderMessages.value = true;
      // Use current messagesOffset as starting point for loading older turns
      send({
        type: 'load_older_messages',
        sessionId: currentSession.value,
        offset: messagesOffset.value,
        turnLimit,
      });
    }
  }

  function onMessage(handler) {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  }

  function clearMessages() {
    messages.value = [];
  }

  function sendAndWait(message, responseType, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for ${responseType}`));
      }, timeout);

      const handler = (msg) => {
        if (msg.type === responseType) {
          cleanup();
          resolve(msg);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        messageHandlers.delete(handler);
      };

      messageHandlers.add(handler);
      send(message);
    });
  }

  // Auto-cleanup on unmount
  onUnmounted(() => {
    _disconnect();
  });

  return {
    // State (readonly)
    connected: readonly(connected),
    connectionState: readonly(connectionState),
    contextReady: readonly(contextReady),
    messages: readonly(messages),
    currentProject: readonly(currentProject),
    currentSession: readonly(currentSession),
    sessionTitle: readonly(_sessionTitle),
    hasOlderMessages: readonly(hasOlderMessages),
    summaryCount: readonly(summaryCount),
    sessionActiveElsewhere: readonly(sessionActiveElsewhere),
    loadingOlderMessages: readonly(loadingOlderMessages),
    totalTurns: readonly(totalTurns),
    loadedTurns: readonly(loadedTurns),

    // Connection
    connect: _connect,
    disconnect: _disconnect,

    // Actions
    selectProject: _selectProject,
    selectSession: _selectSession,
    loadFullHistory,
    loadOlderMessages,
    onMessage,
    clearMessages,

    // Direct send
    send,
    sendAndWait,
  };
}
