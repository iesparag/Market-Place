import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';

export interface Notif {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

/** Per-user notification centre: REST history + live socket pushes → bell UI. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly socket = inject(SocketService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly items = signal<Notif[]>([]);
  readonly unread = computed(() => this.items().filter((n) => !n.read).length);

  constructor() {
    // Connect + load history when the user becomes logged in; clear on logout.
    effect(
      () => {
        if (this.auth.isLoggedIn()) {
          this.socket.connect();
          this.load();
        } else {
          this.items.set([]);
        }
      },
      { allowSignalWrites: true },
    );

    // Prepend live pushes as they arrive.
    effect(
      () => {
        const n = this.socket.lastNotification();
        if (!n) return;
        this.items.update((list) =>
          list.some((x) => x._id === n.id)
            ? list
            : [{ _id: n.id, type: 'order', title: n.title, body: n.body, link: '', read: false, createdAt: n.at }, ...list],
        );
      },
      { allowSignalWrites: true },
    );
  }

  load(): void {
    if (!this.browser) return;
    this.api.get<Notif[]>('/notifications').subscribe({ next: (n) => this.items.set(n) });
  }

  markRead(id: string): void {
    this.items.update((l) => l.map((n) => (n._id === id ? { ...n, read: true } : n)));
    this.api.post(`/notifications/${id}/read`, {}).subscribe({ error: () => {} });
  }

  markAll(): void {
    if (!this.unread()) return;
    this.items.update((l) => l.map((n) => ({ ...n, read: true })));
    this.api.post('/notifications/read-all', {}).subscribe({ error: () => {} });
  }
}
