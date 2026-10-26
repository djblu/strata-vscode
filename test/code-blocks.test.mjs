import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import renderer from '../src/code-blocks.cjs';
test('code blocks highlight, label and copy literal commands without executing markup',()=>{
 const dom=new JSDOM('<div id="body"></div>');const body=dom.window.document.getElementById('body');let copied;
 const command="sed -n 's/^STRATA_API_KEY=//p' /mnt/ai-models/strata-q8/server.env";
 renderer.render(body,'Run **this**:\n```bash\n'+command+'\n```\nUse `terminal`.',text=>copied=text);
 assert.equal(body.querySelector('.code-header span').textContent,'Bash');
 assert.ok(body.querySelector('.hljs-string'));
 assert.equal(body.querySelector('pre code').textContent,command);
 body.querySelector('button').click();assert.equal(copied,command);
 assert.equal(body.querySelector('strong').textContent,'this');
 renderer.render(body,'<img src=x onerror=alert(1)>\n```html\n<script>alert(1)</script>\n```',()=>{});
 assert.equal(body.querySelector('script'),null);assert.equal(body.querySelector('img'),null);
 assert.equal(body.querySelector('pre code').textContent,'<script>alert(1)</script>');
});
test('unknown languages and incomplete fences remain copyable literal text',()=>{
 const dom=new JSDOM('<div></div>');const body=dom.window.document.querySelector('div');let copied;
 renderer.render(body,'~~~unknown\nline 1\n  line 2',text=>copied=text);
 body.querySelector('button').click();assert.equal(copied,'line 1\n  line 2');
 assert.equal(body.querySelector('pre code').textContent,copied);
});
test('markdown and bare links open destinations while code and unsafe links stay inert',()=>{
 const dom=new JSDOM('<div></div>');const body=dom.window.document.querySelector('div');let opened;
 renderer.render(body,'[Repository](https://github.com/djblu/strata-vscode) and https://example.com/test. `https://code.test` [bad](javascript:alert(1))',()=>{},url=>opened=url);
 const links=body.querySelectorAll('a');assert.equal(links.length,2);assert.equal(links[0].textContent,'Repository');
 links[0].click();assert.equal(opened,'https://github.com/djblu/strata-vscode');assert.equal(links[1].href,'https://example.com/test');
});
test('plain text listings retain spacing and copy exactly',()=>{
 const dom=new JSDOM('<div></div>'),body=dom.window.document.querySelector('div');let copied;
 const listing='ai/\n  nested/\nfile.txt | literal pipe';
 for(const label of ['','text','plaintext','txt']){
  renderer.render(body,'```'+label+'\n'+listing+'\n```',text=>copied=text);
  assert.equal(body.querySelector('.code-header span').textContent,'Plain text');
  body.querySelector('button').click();assert.equal(copied,listing);assert.equal(body.querySelector('table'),null);
 }
});
test('Markdown tables support streaming, inline formatting, alignment and escaped pipes safely',()=>{
 const dom=new JSDOM('<div></div>'),body=dom.window.document.querySelector('div');let opened;
 const text='**Files**\n| Name | Size | Note |\n| :--- | ---: | :---: |\n| **file.txt** | 12 KB | `a|b` |\n| [Docs](https://example.com) | 2 KB | a\\|b |\n\nAfter table';
 renderer.render(body,text,()=>{},url=>opened=url);
 assert.equal(body.querySelectorAll('thead th').length,3);assert.equal(body.querySelectorAll('tbody tr').length,2);
 assert.equal(body.querySelector('tbody strong').textContent,'file.txt');assert.equal(body.querySelector('tbody code').textContent,'a|b');
 assert.equal(body.querySelector('tbody tr:last-child td:last-child').textContent,'a|b');
 assert.equal(body.querySelectorAll('th')[1].style.textAlign,'right');
 body.querySelector('a').click();assert.equal(opened,'https://example.com/');
 assert.match(body.textContent,/After table/);
 renderer.render(body,'| Name | Value |\n| --- | --- |\n| <img src=x onerror=alert(1)> | partial',()=>{});
 assert.equal(body.querySelector('img'),null);assert.equal(body.querySelector('td:last-child').textContent,'partial');
 renderer.render(body,'Run a | b\nthen continue',()=>{});assert.equal(body.querySelector('table'),null);
 renderer.render(body,'| Name | Value |\n| --',()=>{});assert.equal(body.querySelector('table'),null);
});
test('lists render as bullets with nested items, inline formatting and literal code preserved',()=>{
 const dom=new JSDOM('<div class="content"></div>'),body=dom.window.document.querySelector('div');
 renderer.render(body,'Changes:\n- **First** item\n  - Nested `code`\n- Second item\n\n1. Third item\n2. Fourth <script>literal</script>\n\n```text\n- not a list\n```',()=>{});
 assert.equal(body.querySelectorAll('li').length,5);assert.equal(body.querySelector('li strong').textContent,'First');assert.equal(body.querySelector('li ul li code').textContent,'code');assert.equal(body.querySelector('script'),null);assert.equal(body.querySelector('pre code').textContent,'- not a list');
 renderer.render(body,'- First\n- Second',()=>{});assert.equal(body.querySelectorAll('li').length,2);dom.window.close();
});

test('prose boundary newlines do not add blank spacing around activity while paragraphs and code remain intact',()=>{
 const dom=new JSDOM('<div></div>'),body=dom.window.document.querySelector('div');
 renderer.render(body,'\n\nFirst paragraph.\n\nSecond paragraph.\n\n',()=>{});assert.equal(body.querySelector('.prose').textContent,'First paragraph.\n\nSecond paragraph.');
 renderer.render(body,'\n\n```text\n\nkeep blank line\n```\n\n',()=>{});assert.equal(body.querySelectorAll('.prose').length,0);assert.equal(body.querySelector('pre code').textContent,'\nkeep blank line');dom.window.close();
});
