'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
async function workspaceReferences(root,paths){
  const base=await fs.realpath(root);const lines=[];
  for(const selected of paths){
    const real=await fs.realpath(selected);const relative=path.relative(base,real);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Choose files or folders inside the workspace');
    const stat=await fs.stat(real);
    lines.push(`${stat.isDirectory()?'Folder':'File'}: ${JSON.stringify(real)}`);
  }
  return '\nWorkspace references (read relevant contents as needed):\n'+lines.join('\n')+'\n';
}
async function gitChanges(root){
  const run=args=>exec('git',['-C',root,...args],{encoding:'utf8',maxBuffer:512000,timeout:15000});
  const staged=await run(['diff','--cached','--no-ext-diff','--no-textconv','--no-color']);
  const unstaged=await run(['diff','--no-ext-diff','--no-textconv','--no-color']);
  const text=[staged.stdout&&'Staged changes:\n'+staged.stdout,unstaged.stdout&&'Unstaged changes:\n'+unstaged.stdout].filter(Boolean).join('\n');
  if(!text)throw Error('No staged or unstaged changes. Untracked files can be added using Files and folders.');
  if(text.length>100000)throw Error('Git diff exceeds 100,000 characters. Add specific files instead.');
  return '\nGit changes snapshot (untracked file contents are not included):\n'+text+'\n';
}
module.exports={workspaceReferences,gitChanges};
