import {test} from 'node:test';
import assert from 'node:assert/strict';
import {permissionContext} from '../permission-context.cjs';
test('model receives the current permission scope without changing the user request',()=>{
 const prompt='Find the latest documentation';
 const full=permissionContext(prompt,'bypass');assert.match(full,/including web searches/);assert.match(full,/without asking for permission again/);assert.ok(full.endsWith(prompt));
 assert.match(permissionContext(prompt,'manual'),/this turn is not in Full control/);
 assert.match(permissionContext(prompt,'plan'),/do not change files/);
 assert.throws(()=>permissionContext(prompt,'unknown'));
});
