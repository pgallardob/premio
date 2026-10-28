import { access, cp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import QRCode from 'qrcode';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist-pages');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const siteUrl = new URL(process.env.PAGES_SITE_URL ?? 'https://pgallardob.github.io/premio/');
if (siteUrl.protocol !== 'https:' || siteUrl.search || siteUrl.hash || siteUrl.username || siteUrl.password) throw new Error('PAGES_SITE_URL must be a public HTTPS site URL.');
if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';
const base = siteUrl.pathname;
const prefix = (path) => `${base}${path.replace(/^\//, '')}`;
const api = process.env.PAGES_API_URL ? new URL(process.env.PAGES_API_URL) : null;
if (api && (api.protocol !== 'https:' || api.pathname !== '/' || api.username || api.password || api.search || api.hash)) throw new Error('PAGES_API_URL must be a credential-free HTTPS origin.');

let exists = false;
try { await access(output); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (exists) {
  let marker;
  try { marker = JSON.parse(await readFile(join(output, '.pages-build.json'), 'utf8')); }
  catch { throw new Error('Build output exists without a valid ownership marker; no files were removed.'); }
  if (marker.project !== 'los-olivos-premio') throw new Error('Unknown build directory; no files were removed.');
  await rm(output, { recursive: true });
}
await mkdir(output, { recursive: true });
await writeFile(join(output, '.pages-build.json'), JSON.stringify({ project: 'los-olivos-premio', site: siteUrl.href, backendAvailable: Boolean(api) }));

const pages = ['index.html', 'admin.html', 'cupon.html', 'cartel.html', 'instalar.html', 'offline.html', 'manifest.webmanifest', 'sw.js'];
for (const file of pages) await copyFile(join(root, file), join(output, file));
for (const directory of ['assets', 'img']) await cp(join(root, directory), join(output, directory), { recursive: true });
await mkdir(join(output, 'vendor', 'licenses'), { recursive: true });
await copyFile(join(root, 'node_modules/@picocss/pico/css/pico.min.css'), join(output, 'vendor/pico.min.css'));
for (const family of ['manrope', 'syne']) {
  for (const weight of [400, 500, 600, 700, 800]) await copyFile(join(root, `node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`), join(output, `vendor/${family}-${weight}.woff2`));
  await copyFile(join(root, `node_modules/@fontsource/${family}/LICENSE`), join(output, `vendor/licenses/${family}-OFL.txt`));
}
await copyFile(join(root, 'node_modules/@picocss/pico/LICENSE.md'), join(output, 'vendor/licenses/pico-MIT.txt'));

function relocate(text, script = false) {
  return text.replace(/(["'`])(\/(?!\/)[^"'`\r\n]*)\1/g, (_, quote, path) => `${quote}${script && path.startsWith('/api/') ? path : prefix(path)}${quote}`)
    .replaceAll('${location.origin}/', `\${location.origin}${base}`);
}
async function transform(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await transform(file);
    else if (['.html', '.css', '.js', '.webmanifest'].includes(extname(file))) {
      let text = relocate(await readFile(file, 'utf8'), extname(file) === '.js');
      if (extname(file) === '.js') {
        text = text.replace(/(from\s+)(['"])(\.{1,2}\/[^'"\r\n]+\.js)\2/g, `$1$2$3?v=${version}$2`);
      }
      if (extname(file) === '.html') {
        text = text.replace(/((?:src|href)="[^"\r\n]+\.(?:js|css))"/g, `$1?v=${version}"`);
        const remote = api ? ` ${api.origin}` : '';
        const policy = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:${remote}; font-src 'self'; connect-src 'self'${remote}; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'`;
        text = text.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
      }
      if (entry.name === 'sw.js') text = text.replaceAll('olivos-public-', 'olivos-premio-pages-');
      if (entry.name === 'cartel.html') text = text.replaceAll(prefix('/api/campaign/qr'), prefix('/assets/images/campaign-qr.png'));
      await writeFile(file, text);
    }
  }
}
await transform(output);

const catalog = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
const campaign = {
  active: false, availableStock: 0, publicUrl: siteUrl.href.replace(/\/$/, ''), promotionContact: '',
  rules: { interval: 20, expiryDays: 5, cooldownEnabled: true, cooldownHours: 24, dailyCodeEnabled: false },
  prizes: catalog.map(({ initialStock, ...prize }) => ({ ...prize, image: prefix(prize.image), stock: 0 })),
};
const configuration = { backendAvailable: Boolean(api), apiBaseUrl: api?.origin ?? '', bearerTransport: Boolean(api), adminRefreshMs: 15_000, staticCampaign: campaign,
  backendNotice: 'GitHub Pages aloja esta web, pero todavía no tiene un servidor de premios conectado. No se registran participaciones ni se permiten canjes.' };
await writeFile(join(output, 'assets/js/deployment.js'), `export const deployment = Object.freeze(${JSON.stringify(configuration, null, 2)});\n`);
await writeFile(join(output, 'assets/images/campaign-qr.png'), await QRCode.toBuffer(siteUrl.href, { width: 512, margin: 2, errorCorrectionLevel: 'M' }));
await writeFile(join(output, '.nojekyll'), '');
console.log(JSON.stringify({ directory: output, site: siteUrl.href, backendAvailable: Boolean(api), apiBaseUrl: api?.origin ?? null, scope: base }, null, 2));
