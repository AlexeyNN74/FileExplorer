import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const stableVersion = /^\d+\.\d+\.\d+$/;
const releaseLine = version => version.split('.').slice(0, 2).join('.');

// Validate resolved versions, not ranges: Tauri CLI requires matching major/minor
// for core and for each installed JS/Rust plugin pair. CLI/build crate releases
// have independent version numbers. Rust-only plugins need no JS package.
export function validateTauriDependencies({ manifest, npmLock, installed, metadata }) {
    const errors = [];
    const npmDependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const app = metadata.packages.find(pkg => pkg.manifest_path.endsWith('/src-tauri/Cargo.toml') || pkg.manifest_path.endsWith('\\src-tauri\\Cargo.toml'));
    const node = app && metadata.resolve.nodes.find(node => node.id === app.id);
    if (!app || !node) return ['Cargo metadata does not contain the Tauri application and its resolved dependencies'];
    const rust = new Map(node.deps.map(dep => metadata.packages.find(pkg => pkg.id === dep.pkg)).filter(Boolean).map(pkg => [pkg.name, pkg.version]));

    for (const dependency of app.dependencies.filter(dep => dep.name === 'tauri' || dep.name === 'tauri-build' || dep.name.startsWith('tauri-plugin-'))) {
        const version = rust.get(dependency.name);
        if (!version || dependency.req !== `=${version}` || !stableVersion.test(version)) {
            errors.push(`${dependency.name}: pin the manifest to its resolved stable version (currently ${dependency.req}, resolved ${version})`);
        }
    }
    for (const [name, requirement] of Object.entries(npmDependencies).filter(([name]) => name.startsWith('@tauri-apps/'))) {
        const version = installed[name];
        if (!stableVersion.test(requirement) || requirement !== version) errors.push(`${name}: exact stable manifest version ${requirement} does not match installed ${version}`);
        const section = name in (manifest.dependencies || {}) ? 'dependencies' : 'devDependencies';
        if (npmLock.packages?.['']?.[section]?.[name] !== requirement || npmLock.packages?.[`node_modules/${name}`]?.version !== version) {
            errors.push(`${name}: package-lock.json does not match the manifest and installed package; run npm install`);
        }
        if (name === '@tauri-apps/cli') continue;
        const crate = name === '@tauri-apps/api' ? 'tauri' : name.replace('@tauri-apps/plugin-', 'tauri-plugin-');
        const rustVersion = rust.get(crate);
        if (!rustVersion) errors.push(`${name}: no direct Rust dependency ${crate}; remove unused JS plugins or register their Rust counterpart`);
        else if (!version || releaseLine(rustVersion) !== releaseLine(version)) errors.push(`${crate} ${rustVersion} vs ${name} ${version}: major/minor releases differ`);
    }
    if (!npmDependencies['@tauri-apps/api']) errors.push('Missing @tauri-apps/api');
    return errors;
}

function main() {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    const manifest = read('package.json');
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => name.startsWith('@tauri-apps/'));
    const installed = Object.fromEntries(names.map(name => [name, read(`node_modules/${name}/package.json`).version]));
    const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--offline', '--format-version', '1'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
    const errors = validateTauriDependencies({ manifest, npmLock: read('package-lock.json'), installed, metadata });
    if (errors.length) throw new Error(`Tauri dependency consistency check failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
    console.log('Tauri dependency consistency OK (locked Rust + installed npm + manifests).');
    for (const name of names) console.log(`  ${name}: ${installed[name]}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
