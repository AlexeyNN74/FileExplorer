import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTauriDependencies } from '../scripts/check-tauri-dependencies.js';

function fixture() {
    const dependencies = { '@tauri-apps/api': '2.5.0', '@tauri-apps/plugin-dialog': '2.2.2' };
    const devDependencies = { '@tauri-apps/cli': '2.12.5' };
    const installed = { ...dependencies, ...devDependencies };
    const crates = [['tauri', '2.5.1'], ['tauri-build', '2.2.0'], ['tauri-plugin-dialog', '2.2.2'], ['tauri-plugin-shell', '2.2.1']];
    return {
        manifest: { dependencies, devDependencies }, installed,
        npmLock: { packages: { '': { dependencies: { ...dependencies }, devDependencies: { ...devDependencies } }, ...Object.fromEntries(Object.entries(installed).map(([name, version]) => [`node_modules/${name}`, { version }])) } },
        metadata: {
            packages: [{ id: 'app', manifest_path: '/project/src-tauri/Cargo.toml', dependencies: crates.map(([name, version]) => ({ name, req: `=${version}` })) }, ...crates.map(([name, version]) => ({ id: name, name, version }))],
            resolve: { nodes: [{ id: 'app', deps: crates.map(([name]) => ({ pkg: name })) }] },
        },
    };
}

test('matches major/minor, allows different patch and independent CLI/build and Rust-only shell', () => {
    assert.deepEqual(validateTauriDependencies(fixture()), []);
});
test('rejects the reported dialog mismatch and core API drift', () => {
    const input = fixture();
    input.installed['@tauri-apps/plugin-dialog'] = '2.8.4';
    input.installed['@tauri-apps/api'] = '2.12.5';
    const errors = validateTauriDependencies(input).join('\n');
    assert.match(errors, /tauri-plugin-dialog 2.2.2 vs @tauri-apps\/plugin-dialog 2.8.4/);
    assert.match(errors, /tauri 2.5.1 vs @tauri-apps\/api 2.12.5/);
});
test('rejects prerelease manifest fallback, broad Rust ranges and npm lock drift', () => {
    const input = fixture();
    input.metadata.packages[0].dependencies.find(dep => dep.name === 'tauri-plugin-shell').req = '^2.0.0-rc';
    input.npmLock.packages['node_modules/@tauri-apps/plugin-dialog'].version = '2.8.4';
    const errors = validateTauriDependencies(input).join('\n');
    assert.match(errors, /tauri-plugin-shell: pin/);
    assert.match(errors, /package-lock.json does not match/);
});
test('rejects an orphan npm plugin and unpinned npm requirements', () => {
    const input = fixture();
    input.manifest.dependencies['@tauri-apps/plugin-opener'] = '^2';
    input.installed['@tauri-apps/plugin-opener'] = '2.7.3';
    assert.match(validateTauriDependencies(input).join('\n'), /no direct Rust dependency tauri-plugin-opener/);
    assert.match(validateTauriDependencies(input).join('\n'), /exact stable manifest version/);
});
