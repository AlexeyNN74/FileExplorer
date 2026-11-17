import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveConfig } from 'vite';

const config = await resolveConfig({}, 'build');
assert.equal(config.build.target, 'safari13', 'Keep an explicit Catalina-era syntax target');
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const directory = path.resolve('src-tauri', tauri.build.frontendDist);
assert.equal(directory, path.resolve(config.build.outDir), 'Tauri must embed Vite output');
const html = readFileSync(path.join(directory, 'index.html'), 'utf8');
const bootstrap = html.indexOf('src="/startup-diagnostics.js"');
assert.ok(bootstrap >= 0 && bootstrap < html.indexOf('type="module"'), 'Diagnostics must precede the module graph');
const resources = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
for (const resource of resources) {
    assert.ok(!resource.includes('://'), 'Startup must not require remote HTML assets');
    assert.ok(statSync(path.join(directory, resource.replace(/^\//, ''))).isFile(), `Missing built asset: ${resource}`);
}
assert.ok(resources.some(resource => resource.endsWith('.js') && resource.includes('/assets/')));
assert.ok(resources.some(resource => resource.endsWith('.css')));
assert.equal(readFileSync(path.join(directory, 'startup-diagnostics.js'), 'utf8'), readFileSync('public/startup-diagnostics.js', 'utf8'));
console.log(`Frontend build OK: safari13, Tauri output path, bootstrap ordering, ${resources.length} local assets.`);
