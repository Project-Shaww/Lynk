import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get target triple
const rustcOutput = execSync('rustc -vV').toString();
const targetTriple = rustcOutput.split('\n').find(line => line.startsWith('host: ')).replace('host: ', '').trim();

console.log(`Building sidecar for target: ${targetTriple}`);

// Build service
execSync('cargo build --release', { 
  stdio: 'inherit',
  cwd: path.resolve('..', 'service')
});

// Copy binary
const ext = process.platform === 'win32' ? '.exe' : '';
const source = path.resolve('..', 'service', 'target', 'release', `lynk_service${ext}`);
const destDir = path.resolve('src-tauri', 'binaries');
const dest = path.resolve(destDir, `lynk_service-${targetTriple}${ext}`);

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(source, dest);
console.log(`Copied sidecar to ${dest}`);
