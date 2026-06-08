import { handler as browseFolder } from './browse-folder.js';
import { handler as deleteSession } from './delete-session.js';
import { handler as getProjects } from './get-projects.js';
import { handler as getRecentSessions } from './get-recent-sessions.js';
import { handler as getSessions } from './get-sessions.js';
import { handler as loadOlderMessages } from './load-older-messages.js';
import { handler as newProject } from './new-project.js';
import {
  listHandler as rcList,
  startHandler as rcStart,
  stopHandler as rcStop,
} from './rc.js';
import { handler as selectProject } from './select-project.js';
import { handler as selectSession } from './select-session.js';
import { handler as searchSessions } from './session-search.js';

export const handlers = {
  get_projects: getProjects,
  select_project: selectProject,
  browse_folder: browseFolder,
  get_sessions: getSessions,
  get_recent_sessions: getRecentSessions,
  select_session: selectSession,
  load_older_messages: loadOlderMessages,
  delete_session: deleteSession,
  // RC session management
  'rc:list': rcList,
  'rc:start': rcStart,
  'rc:stop': rcStop,
  // Cross-session search
  'search:sessions': searchSessions,
  // Project creation
  'project:create': newProject,
};
