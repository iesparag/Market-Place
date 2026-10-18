import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Handles stale dynamic import chunk errors after new deployments on Vercel.
 * When an admin has the tab open while a new version is deployed, clicking a menu
 * item tries to fetch old hashed chunks which no longer exist. This automatically
 * reloads the page to pull the latest deployment seamlessly.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    const errorMsg = error?.message || error?.toString() || '';
    if (
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('Failed to load module script')
    ) {
      const reloadKey = 'last_chunk_reload_ts';
      const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
      // Prevent infinite loops (only auto-reload if not reloaded in the last 10 seconds)
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    console.error('[GlobalErrorHandler]', error);
  }
}
