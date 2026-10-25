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
