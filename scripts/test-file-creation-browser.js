import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

let server;
const directory = mkdtempSync(path.join(tmpdir(), 'explr-creation-'));
try {
    const stubs = {
        HistoryProvider: `const value = {currentPath:'/Users/mac/Downloads', navigateTo:()=>{}}; export const useHistory=()=>value;`,
        SettingsProvider: `const value={settings:{show_hidden_files_and_folders:true}}; export const useSettings=()=>value;`,
        SftpProvider: `const value={isSftpPath:()=>false}; export const useSftp=()=>value;`,
        core: `export const invoke=(...args)=>window.__invoke(...args);`,
    };
    await build({ entryPoints: ['tests/browser/fileCreation.browser.jsx'], outfile: path.join(directory, 'test.js'), bundle: true, format: 'iife', target: 'safari13', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'boundary-stubs', setup(builder) {
        builder.onResolve({ filter: /(?:HistoryProvider|SettingsProvider|SftpProvider)$|^@tauri-apps\/api\/core$/ }, args => ({ path: args.path.split('/').pop(), namespace: 'boundary' }));
        if (process.argv.includes('--baseline')) builder.onLoad({ filter: /(?:FileSystemProvider|CreateFileButton)\.jsx$/ }, args => ({ contents: execFileSync('git', ['show', '4f647fd:' + path.relative(process.cwd(), args.path)], { encoding: 'utf8' }), loader: 'jsx', resolveDir: path.dirname(args.path) }));
        builder.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }] });
    writeFileSync(path.join(directory, 'index.html'), '<!doctype html><div id="root"></div><pre id="result">RUNNING</pre><script src="test.js"></script>');
    server = createServer((request, response) => {
        const name = request.url === '/test.js' ? 'test.js' : 'index.html';
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
        response.end(readFileSync(path.join(directory, name)));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    // Real React, provider, modal and Chromium DOM; only IPC/settings/history/SFTP boundaries are simulated.
    const browser = spawn(process.env.CHROMIUM_BIN || 'chromium', ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${directory}/profile`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const browserErrors = [];
    let buffer = '';
    let sequence = 0;
    const pending = new Map();
    browser.stdio[4].on('data', chunk => {
        buffer += chunk.toString();
        let end;
        while ((end = buffer.indexOf('\0')) >= 0) {
            const response = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (response.method === 'Runtime.exceptionThrown') browserErrors.push(JSON.stringify(response.params.exceptionDetails).slice(0, 2000));
            const entry = pending.get(response.id);
            if (entry) { pending.delete(response.id); response.error ? entry.reject(Error(JSON.stringify(response.error))) : entry.resolve(response.result); }
        }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject });
        browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    let result;
    const timeout = setTimeout(() => { browser.kill(); }, 25000);
    browser.on('exit', () => { for (const entry of pending.values()) entry.reject(Error('Browser exited before test completion')); pending.clear(); });
    try {
        const { targetId } = await send('Target.createTarget', { url });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        await send('Page.enable', {}, sessionId);
        await send('Runtime.enable', {}, sessionId);
        await send('Page.navigate', { url }, sessionId);
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            const response = await send('Runtime.evaluate', { expression: "document.getElementById('result')?.textContent", returnByValue: true }, sessionId);
            result = response.result?.value;
            if (result && result !== 'RUNNING') break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!result || result === 'RUNNING') {
            const debug = await send('Runtime.evaluate', { expression: 'location.href + " " + document.documentElement.outerHTML', returnByValue: true }, sessionId);
            result = 'FAIL: ' + JSON.stringify({ debug, browserErrors }).slice(0, 5000);
        }
    } finally { clearTimeout(timeout); browser.kill(); browser.stdio[3].destroy(); browser.stdio[4].destroy(); }

    assert.ok(result?.startsWith('PASS:'), result || 'Browser test did not finish');
    console.log(result);
} catch (error) {
    const message = String(error.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error title=Creation browser regression::${message}`);
    process.exitCode = 1;
} finally { if (server) server.close(); rmSync(directory, { recursive: true, force: true }); }
