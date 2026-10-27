import { resolve } from 'node:path';
import { createApplication } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const { port, host, publicUrl } = config;
  const version = process.versions.node.split('.').map(Number);
  if (config.production && (version[0] < 24 || (version[0] === 24 && (version[1] < 22 || (version[1] === 22 && version[2] < 1))))) throw new Error('Producción requiere Node.js 24.22.1 LTS o una versión compatible más reciente.');
  const app = await createApplication(config);
  app.server.on('error', async (error) => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
    await app.close();
    process.exitCode = 1;
  });
  app.server.listen(port, host, () => {
    console.log(`\nLos Olivos · Premio\nCliente: ${publicUrl}\nAdministración: ${publicUrl}/admin.html\nDatos: ${resolve(process.env.DATA_DIR ?? './data')}\n`);
    console.log('Protección de 24 horas obligatoria. La campaña requiere inventario y activación del local.');
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const forceClose = setTimeout(() => app.server.closeAllConnections(), 8000);
    forceClose.unref();
    await app.close();
    clearTimeout(forceClose);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
