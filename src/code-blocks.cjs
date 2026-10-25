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
function render(body,text,copy,openLink) {
  const document=body.ownerDocument;const fragment=document.createDocumentFragment();
  const lines=text.split('\n');let prose=[];
  function flush(){if(prose.length){const p=document.createElement('div');p.className='prose';inline(p,prose.join('\n'),document,openLink);fragment.append(p);prose=[];}}
  for(let i=0;i<lines.length;i++){
    const open=/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^\n]*$/.exec(lines[i]);
    if(!open){prose.push(lines[i]);continue;}
    flush();const content=[];const close=new RegExp('^ {0,3}'+open[1][0]+'{'+open[1].length+',}\\s*$');
    for(i++;i<lines.length&&!close.test(lines[i]);i++)content.push(lines[i]);
    const raw=content.join('\n');const label=open[2]||'text';const language=aliases[label.toLowerCase()]||label.toLowerCase();
    const block=document.createElement('section');block.className='code-block';
    const header=document.createElement('div');header.className='code-header';
    const name=document.createElement('span');name.textContent=label==='bash'?'Bash':label;
    const button=document.createElement('button');button.type='button';button.textContent='Copy';button.title='Copy code';button.setAttribute('aria-label','Copy '+label+' code');
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
