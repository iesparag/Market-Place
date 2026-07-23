import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './main.server';

/** Angular SSR express server. Serves prerendered/SSR HTML + static assets. */
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = readFileSync(join(serverDistFolder, 'index.server.html'), 'utf-8');
  const commonEngine = new CommonEngine();

  // Static assets (files with an extension) only — routes fall through to SSR.
  server.get('*.*', express.static(browserDistFolder, { maxAge: '1y' }));

  server.get('**', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;
    commonEngine
      .render({
        bootstrap,
        document: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        inlineCriticalCss: false,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  app().listen(port, () => console.log(`SSR server listening on http://localhost:${port}`));
}

run();
