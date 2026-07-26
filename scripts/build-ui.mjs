import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Building UI Frontends (Member CSR App & Admin CSR App)...');

// 1. Build Member CSR App
console.log('\n📦 Building Member App (frontend/app)...');
execSync('npx vite build --config frontend/app/vite.config.ts', {
  cwd: rootDir,
  stdio: 'inherit',
});

// 2. Build Admin CSR App
console.log('\n📦 Building Admin App (frontend/admin)...');
execSync('npx vite build --config frontend/admin/vite.config.ts', {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log('\n✅ UI Frontend builds completed successfully!');
