import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const names = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const knownSecrets = [process.env.ADMIN_PASSWORD_HASH, process.env.DEVICE_SECRET, process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter((value) => value?.length >= 16);
if (process.env.NEON_CONFIG_DIR) {
  const { join } = await import('node:path');
  const environment = await readFile(join(process.env.NEON_CONFIG_DIR, 'premio-deployment.env'), 'utf8');
  for (const line of environment.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0 && /PASSWORD|SECRET|TOKEN/.test(line.slice(0, index))) knownSecrets.push(line.slice(index + 1));
  }
  knownSecrets.push((await readFile(join(process.env.NEON_CONFIG_DIR, 'premio-admin-password.txt'), 'utf8')).trim());
  try {
    const test = JSON.parse(await readFile(join(process.env.NEON_CONFIG_DIR, 'test-winner.json'), 'utf8'));
    if (test.token) knownSecrets.push(test.token);
    if (test.url) knownSecrets.push(test.url);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
try {
  const local = await readFile('ellocal.txt', 'utf8');
  const password = local.match(/Contraseña local:\s*(\S+)/u)?.[1];
  if (password) knownSecrets.push(password);
} catch (error) { if (error.code !== 'ENOENT') throw error; }

for (const name of names) {
  const normalized = name.replaceAll('\\', '/');
  assert(!/^(node_modules|artifacts|backups|release|dist-pages)\//.test(normalized), `Private/generated directory staged: ${name}`);
  assert(normalized !== 'ellocal.txt', 'Local credential note must not be staged');
  assert(!/^\.env(?:\.|$)/.test(normalized) || ['.env.example', '.env.production.example'].includes(normalized), `Secret environment staged: ${name}`);
  assert(!normalized.startsWith('data/') || normalized === 'data/.gitkeep', `Live data staged: ${name}`);
  const bytes = execFileSync('git', ['show', `:${name}`], { maxBuffer: 32 * 1024 * 1024 });
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  assert(!/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(text), `Possible GitHub token staged in ${name}`);
  assert(!knownSecrets.some((secret) => text.includes(secret)), `A local credential value is staged in ${name}`);
}
console.log(`Publication safety check passed for ${names.length} staged files; no secret values were printed.`);
