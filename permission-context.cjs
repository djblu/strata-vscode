'use strict';
const instructions={
  bypass:'Full control. The user has authorized using available tools for the requested task, including web searches, opening web pages, running commands and editing files. Proceed with those task-relevant actions without asking for permission again in your reply. Do not stop at offering to do the work. Ask only when essential information is missing or an action would exceed the user’s request. Respect explicit user constraints and tool failures; do not invent tool results.',
  manual:'Ask before actions. Use the harness approval controls when required; this turn is not in Full control. Respect tool approval decisions and explicit user constraints.',
  plan:'Read only. Inspect and explain; do not change files or run modifying commands. This turn is not in Full control.'
};
function permissionContext(message,mode){
  if(!Object.hasOwn(instructions,mode))throw Error('Invalid permission mode');
  return `[Strata VS Code permission setting for this turn]\n${instructions[mode]}\n[User request]\n${message}`;
}
module.exports={permissionContext};
