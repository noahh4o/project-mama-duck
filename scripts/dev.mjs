import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const host = process.env.DEV_HOST || '127.0.0.1';
const port = Number(process.env.DEV_PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Set DEV_PORT to a whole number between 1 and 65535.');
  process.exit(1);
}
const files = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
  ['/assets/handOpen.png', 'assets/handOpen.png'],
  ['/assets/handHit.png', 'assets/handHit.png'],
  ['/assets/handSleep.png', 'assets/handSleep.png'],
  ['/assets/handGrab.png', 'assets/handGrab.png'],
  ['/assets/duckling.png', 'assets/duckling.png'],
  ['/assets/target.png', 'assets/target.png'],
  ...['00', '01', '02', '03', '04', '05', '06', '07','08','09','10','11','12'].map((module) => [`/assets/stamina-${module}.png`, `assets/stamina-${module}.png`]),
  ['/assets/pixelify-sans.woff2', 'assets/pixelify-sans.woff2'],
  ...['arena', 'art', 'audio', 'enemies', 'events', 'game', 'tutorial', 'classic-input'].map((module) => [`/${module}.mjs`, `${module}.mjs`]),
  ...['hands', 'tracker', 'gestures', 'advanced', 'horns', 'input-adapter'].map((module) => [`/hands/${module}.mjs`, `hands/${module}.mjs`]),

]);
const contentTypes = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  png: 'image/png',
  woff2: 'font/woff2',
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const pathname = request.url.split('?')[0];
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(pathname === '/favicon.ico' ? 204 : 404).end();
    return;
  }

  try {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    response.writeHead(200, {
      'Content-Type': contentTypes[file.split('.').at(-1)],
      'Content-Length': content.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error(`Unable to read ${file}:`, error.message);
    response.writeHead(500).end();
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is in use. Pick another DEV_PORT in .env.`
    : error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const address = host.includes(':') ? `[${host}]` : host;
  console.log(`Motherduck is running at http://${address}:${port}/`);
});
