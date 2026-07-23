import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: 'info' | 'success' | 'warning';
}

/** Lightweight toast store. Realtime events + actions push here; the shell renders them. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  push(title: string, body?: string, kind: Toast['kind'] = 'info'): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, title, body, kind }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
