const hljs = require('highlight.js/lib/common');
const aliases = {sh:'bash',shell:'bash',console:'bash',ps1:'powershell',pwsh:'powershell',js:'javascript',ts:'typescript',py:'python',yml:'yaml'};
hljs.registerLanguage('powershell', require('highlight.js/lib/languages/powershell'));
const {externalURL}=require('../context-state.cjs');
function inline(parent,text,document,openLink) {
  const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s]+?)\)|https?:\/\/[^\s<>]+)/g;let start=0;
  for(const match of text.matchAll(pattern)){
    parent.append(document.createTextNode(text.slice(start,match.index)));
    const value=match[0];
    if(value.startsWith('`')||value.startsWith('**')){
      const code=value.startsWith('`');const el=document.createElement(code?'code':'strong');el.textContent=value.slice(code?1:2,code?-1:-2);parent.append(el);
    }else{
      let target=match[3]||value;let suffix='';
      if(!match[3]){const trimmed=target.replace(/[.,;!?:]+$/,'');suffix=target.slice(trimmed.length);target=trimmed;while(target.endsWith(')')&&(target.match(/\)/g)||[]).length>(target.match(/\(/g)||[]).length){target=target.slice(0,-1);suffix=')'+suffix;}}
      const url=externalURL(target);
      if(url){const a=document.createElement('a');a.href=url;a.textContent=match[2]||target;a.title='Open link: '+url;a.onclick=e=>{e.preventDefault();openLink?.(url);};parent.append(a);parent.append(document.createTextNode(suffix));}
      else parent.append(document.createTextNode(value));
    }
    start=match.index+value.length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}
// Split table cells without treating escaped pipes or pipes inside inline code as columns.
function cells(line) {
  const result=[];let cell='',ticks=0;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='\\'&&line[i+1]==='|'){cell+='|';i++;continue;}
    if(c==='`'){let end=i;while(line[end]==='`')end++;const count=end-i;if(!ticks)ticks=count;else if(ticks===count)ticks=0;cell+=line.slice(i,end);i=end-1;continue;}
    if(c==='|'&&!ticks){result.push(cell.trim());cell='';}else cell+=c;
  }
  result.push(cell.trim());
  if(line.trimStart().startsWith('|'))result.shift();
  if(line.trimEnd().endsWith('|')&&!/\\\|\s*$/.test(line))result.pop();
  return result;
}
function tableHeader(line,divider){
  if(!line.includes('|')||!divider)return null;
  const header=cells(line),rules=cells(divider);
  return header.length===rules.length&&rules.every(x=>/^:?-{3,}:?$/.test(x))?{header,rules}:null;
}
function render(body,text,copy,openLink) {
  const document=body.ownerDocument;const fragment=document.createDocumentFragment();
  const lines=text.split('\n');let prose=[];
  function flush(){if(prose.length){const p=document.createElement('div');p.className='prose';inline(p,prose.join('\n'),document,openLink);fragment.append(p);prose=[];}}
  for(let i=0;i<lines.length;i++){
    const open=/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^\n]*$/.exec(lines[i]);
    if(!open){
      const bullet=/^(\s*)(?:[-+*•]|\d+[.)])\s+(.+)$/.exec(lines[i]);
      if(bullet){
        flush();const list=document.createElement('ul');list.className='markdown-list';fragment.append(list);
        const stack=[{indent:bullet[1].length,list,last:null}];
        for(;i<lines.length;i++){
          const item=/^(\s*)(?:[-+*•]|\d+[.)])\s+(.+)$/.exec(lines[i]);
          if(!item){
            if(!lines[i].trim()&&/^(\s*)(?:[-+*•]|\d+[.)])\s+/.test(lines[i+1]||''))continue;
            const top=stack.at(-1);
            if(lines[i].trim()&&/^\s+/.test(lines[i])&&!/^\s*(`{3,}|~{3,})/.test(lines[i])&&top.last){top.last.append(document.createTextNode(' '));inline(top.last,lines[i].trim(),document,openLink);continue;}
            break;
          }
          const indent=item[1].length;
          while(stack.length>1&&indent<stack.at(-1).indent)stack.pop();
          if(indent>stack.at(-1).indent&&stack.at(-1).last){const nested=document.createElement('ul');nested.className='markdown-list';stack.at(-1).last.append(nested);stack.push({indent,list:nested,last:null});}
          const li=document.createElement('li');inline(li,item[2],document,openLink);stack.at(-1).list.append(li);stack.at(-1).last=li;
        }
        i--;continue;
      }
      const table=tableHeader(lines[i],lines[i+1]);
      if(!table){prose.push(lines[i]);continue;}
      flush();const wrapper=document.createElement('div');wrapper.className='markdown-table';
      const element=document.createElement('table');const head=document.createElement('thead');const tbody=document.createElement('tbody');
      function row(values,header=false){const tr=document.createElement('tr');
        for(let column=0;column<table.header.length;column++){
          const td=document.createElement(header?'th':'td'),rule=table.rules[column];
          if(header)td.scope='col';
          td.style.textAlign=rule.startsWith(':')&&rule.endsWith(':')?'center':rule.endsWith(':')?'right':'left';
          inline(td,values[column]||'',document,openLink);tr.append(td);
        }return tr;
      }
      head.append(row(table.header,true));i+=2;
      for(;i<lines.length&&lines[i].trim()&&lines[i].includes('|')&&!/^\s*(`{3,}|~{3,})/.test(lines[i]);i++)tbody.append(row(cells(lines[i])));
      i--;element.append(head,tbody);wrapper.append(element);fragment.append(wrapper);continue;
    }
    flush();const content=[];const close=new RegExp('^ {0,3}'+open[1][0]+'{'+open[1].length+',}\\s*$');
    for(i++;i<lines.length&&!close.test(lines[i]);i++)content.push(lines[i]);
    const raw=content.join('\n');const label=open[2]||'text';const language=aliases[label.toLowerCase()]||label.toLowerCase();
    const block=document.createElement('section');block.className='code-block';
    const header=document.createElement('div');header.className='code-header';
    const name=document.createElement('span');name.textContent=['text','plaintext','txt'].includes(language)?'Plain text':label==='bash'?'Bash':label;
    const button=document.createElement('button');button.type='button';button.textContent='Copy';button.title='Copy '+name.textContent;button.setAttribute('aria-label','Copy '+name.textContent+' block');
    button.onclick=()=>copy(raw,button);
    header.append(name,button);
    const pre=document.createElement('pre');const code=document.createElement('code');
    // Highlight.js escapes source text. Unknown languages and large blocks stay plain text.
    if(raw.length<=64000&&hljs.getLanguage(language))code.innerHTML=hljs.highlight(raw,{language,ignoreIllegals:true}).value;
    else code.textContent=raw;
    pre.append(code);block.append(header,pre);fragment.append(block);
  }
  flush();body.replaceChildren(fragment);
}
module.exports={render};
