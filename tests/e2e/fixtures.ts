import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXTENSION_PATH = resolve('dist');

interface Origins {
  site: string;
  ads: string;
}

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  origins: Origins;
}

const page = (adsOrigin: string): string => `<!doctype html><html><body>
<div class="ad-banner first">AD</div>
<div id="wrap-ad"><span class="ad-inner">inner ad</span></div>
<div id="content">content</div>
<script src="${adsOrigin}/ad.js"></script>
<script>window.adsEnabled = true;</script>
<script>setTimeout(function () {
  var d = document.createElement('div');
  d.className = 'ad-banner late';
  d.textContent = 'late ad';
  document.body.appendChild(d);
}, 300);</script>
</body></html>`;

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'adblock-e2e-'));
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--host-resolver-rules=MAP *.test 127.0.0.1',
      ],
    });
    await use(context);
    await context.close();
    await rm(dir, { recursive: true, force: true });
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  origins: async ({}, use) => {
    const server = createServer((req, res) => {
      const port = (server.address() as AddressInfo).port;
      if (req.url === '/ad.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end('window.adLoaded = true;');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(page(`http://partner.test:${port}`));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as AddressInfo).port;
    await use({ site: `http://site.test:${port}`, ads: `http://partner.test:${port}` });
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  },
});

export async function updateSettings(
  context: BrowserContext,
  extensionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((p) => chrome.runtime.sendMessage({ type: 'updateSettings', patch: p }), patch);
  await page.close();
}
