import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat();
}
const sources = [...(await Promise.all(['server', 'scripts', 'assets/js', 'tests'].map(files))).flat(), 'sw.js'];
for (const file of sources.filter((file) => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
for (const file of ['index.html', 'admin.html', 'cupon.html', 'cartel.html', 'instalar.html', 'offline.html']) {
  const html = await readFile(join(root, file), 'utf8');
  assert(!/<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i.test(html), `${file}: embedded code is not allowed`);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert(/\bsrc\s*=/.test(match[1]) && !match[2].trim(), `${file}: scripts must be external`);
  }
  assert(/<html\b[^>]*\blang="es"/.test(html), `${file}: missing document language`);
  assert(!/modo de prueba|modo de demostración/i.test(html), `${file}: obsolete public test mode copy`);
}
const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, '/');
assert.equal(manifest.prefer_related_applications, false);
for (const size of [192, 512]) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}` && item.purpose === 'any');
  assert(icon, `Missing ${size}px app icon`);
  const bytes = await readFile(join(root, icon.src.slice(1)));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}
const compose = JSON.parse(await readFile(join(root, 'compose.production.json'), 'utf8'));
assert(!compose.services.app.ports, 'Backend must not publish a direct port');
assert(compose.services.app.read_only);
assert(compose.services.app.volumes.includes('app-data:/app/data'));
assert.equal(compose.services.web.depends_on.app.condition, 'service_healthy');
assert(compose.networks.backend.internal);
assert.equal(compose.services.maintenance.network_mode, 'none');
const spec = JSON.parse(await readFile(join(root, 'docs/api.openapi.json'), 'utf8'));
assert.equal(spec.openapi, '3.1.0');
function validateReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/')) {
    const resolved = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], spec);
    assert(resolved, `Unresolved OpenAPI reference: ${value.$ref}`);
  }
  Object.values(value).forEach(validateReferences);
}
validateReferences(spec);
console.log('JavaScript syntax, external-only HTML and OpenAPI references: OK');
