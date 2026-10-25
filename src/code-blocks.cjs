const hljs = require('highlight.js/lib/common');
const aliases = {sh:'bash',shell:'bash',console:'bash',ps1:'powershell',pwsh:'powershell',js:'javascript',ts:'typescript',py:'python',yml:'yaml'};
hljs.registerLanguage('powershell', require('highlight.js/lib/languages/powershell'));
function inline(parent,text,document) {
  const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;let start=0;
  for(const match of text.matchAll(pattern)){
    parent.append(document.createTextNode(text.slice(start,match.index)));
    const code=match[0].startsWith('`');const el=document.createElement(code?'code':'strong');
    el.textContent=match[0].slice(code?1:2,code?-1:-2);parent.append(el);start=match.index+match[0].length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}
function render(body,text,copy) {
  const document=body.ownerDocument;const fragment=document.createDocumentFragment();
  const lines=text.split('\n');let prose=[];
  function flush(){if(prose.length){const p=document.createElement('div');p.className='prose';inline(p,prose.join('\n'),document);fragment.append(p);prose=[];}}
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
