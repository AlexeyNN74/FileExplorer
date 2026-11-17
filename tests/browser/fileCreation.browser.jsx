import React from 'react';
import { createRoot } from 'react-dom/client';
import FileSystemProvider, { useFileSystem } from '../../src/providers/FileSystemProvider';
import CreateFileButton from '../../src/components/explorer/CreateFileButton';

const paths = [];
let mode = 'denied';
let calls = 0;
let refreshes = 0;
window.__invoke = async (command, args) => {
    if (command === 'create_directory') {
        calls++;
        if (args.folderPathAbs !== '/Users/mac/Downloads' || args.folderName !== 'New Folder') throw Error('wrong invoke arguments');
        if (mode === 'denied') throw JSON.stringify({ code: 500, custom_message: 'Permission denied: Downloads' });
        paths.push({ name: args.folderName, path: args.folderPathAbs + '/' + args.folderName });
        return null;
    }
    if (command === 'open_directory') {
        refreshes++;
        if (mode === 'refresh-failed') throw Error('Cannot reload directory');
        return JSON.stringify({ directories: paths.slice(), files: [] });
    }
    if (command === 'get_system_volumes_information_as_json') return '[]';
    throw Error('Unexpected command: ' + command);
};
function Probe() {
    const { currentDirData } = useFileSystem();
    return <output id="listing">{JSON.stringify(currentDirData)}</output>;
}
const wait = async predicate => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw Error('Timed out: ' + predicate.toString());
};
const check = (condition, message) => { if (!condition) throw Error(message); };
const open = async () => { document.dispatchEvent(new CustomEvent('create-folder')); await wait(() => document.querySelector('[role=dialog]')); };
const clickCreate = () => [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === 'Create').click();
async function run() {
    createRoot(document.getElementById('root')).render(<FileSystemProvider><CreateFileButton /><Probe /></FileSystemProvider>);
    await wait(() => document.querySelector('#listing')?.textContent.includes('directories'));
    await open(); clickCreate();
    await wait(() => document.querySelector('[role=alert]'));
    check(document.querySelector('#item-name').value === 'New Folder', 'name lost after failure');
    check(document.querySelector('[role=dialog]').textContent.includes('/Users/mac/Downloads'), 'context lost');
    check(document.querySelector('[role=alert]').textContent.includes('Permission denied'), 'missing readable error');
    check(paths.length === 0, 'false filesystem success');
    const before = refreshes;
    mode = 'success'; clickCreate(); clickCreate();
    await wait(() => !document.querySelector('[role=dialog]'));
    check(paths.length === 1 && calls === 2, 'duplicate submit or missing creation');
    check(refreshes > before && document.querySelector('#listing').textContent.includes('New Folder'), 'list not refreshed');
    await open(); mode = 'refresh-failed'; clickCreate();
    await wait(() => document.querySelector('[role=alert]'));
    check(document.querySelector('[role=alert]').textContent.includes('was created'), 'refresh error reports false complete success');
    check(document.querySelector('#item-name').value === 'New Folder', 'name lost on refresh error');
    document.getElementById('result').textContent = 'PASS: denial keeps dialog/name/context; confirmed success refreshes list and closes; duplicate submit blocked; refresh failure stays visible.';
}
run().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
