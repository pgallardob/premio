import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const repository = process.env.GITHUB_REPOSITORY ?? 'pgallardob/premio';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');

function token() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const credentials = spawnSync('git', ['credential', 'fill'], {
    input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`, encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    windowsHide: true,
  });
  const password = credentials.stdout?.split(/\r?\n/).find((line) => line.startsWith('password='))?.slice(9);
  if (credentials.status !== 0 || !password) throw new Error('No GitHub credential is available. Sign in using Git Credential Manager before publishing.');
  return password;
}

const credential = token();
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${credential}`,
      'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${data?.message ?? 'request failed'}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const command = process.argv[2] ?? 'inspect';
if (command === 'inspect') {
  const repo = await api('');
  let pages;
  try { pages = await api('/pages'); } catch (error) { if (error.status !== 404) throw error; }
  console.log(JSON.stringify({ repository: repo.full_name, visibility: repo.visibility, defaultBranch: repo.default_branch,
    permissions: repo.permissions, pages: pages ? { url: pages.html_url, status: pages.status, buildType: pages.build_type, source: pages.source } : null }, null, 2));
} else if (command === 'enable') {
  let existing;
  try { existing = await api('/pages'); } catch (error) { if (error.status !== 404) throw error; }
  const pages = await api('/pages', { method: existing ? 'PUT' : 'POST', body: { build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } } });
  console.log(JSON.stringify({ url: pages?.html_url, source: pages?.source, configured: true }, null, 2));
} else if (command === 'build') {
  console.log(JSON.stringify(await api('/pages/builds', { method: 'POST' }), null, 2));
} else if (command === 'wait') {
  let previous;
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const pages = await api('/pages');
    if (pages.status !== previous) { console.log(`Pages: ${pages.status ?? 'pending'}`); previous = pages.status; }
    if (pages.status === 'built') { console.log(JSON.stringify({ url: pages.html_url, source: pages.source, status: pages.status }, null, 2)); break; }
    if (pages.status === 'errored') throw new Error('GitHub Pages reports a failed build. Inspect the repository Pages build.');
    if (attempt === 47) throw new Error('GitHub Pages is still pending; publication is not yet verified.');
    await delay(5000);
  }
} else throw new Error('Use inspect, enable, build or wait.');
