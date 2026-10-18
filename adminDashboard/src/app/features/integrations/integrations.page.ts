import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface IntegrationInfo {
  key: string;
  name: string;
  category: string;
  status: 'live' | 'fallback' | 'not_configured';
  detail: string;
}

/** What's actually live vs running on a fallback/mock in this environment —
 * configuration presence (env vars), not a connectivity probe. See
 * backend/src/modules/integrations/integrations.module.ts for how each is decided. */
@Component({
  selector: 'app-integrations',
  standalone: true,
  template: `
    <header class="head">
      <div><h1>Integrations</h1><p class="muted">Third-party services this backend talks to — live, on a fallback, or not set up</p></div>
      <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
    </header>

    @for (cat of categories(); track cat) {
      <h3 class="section">{{ cat }}</h3>
      <div class="grid">
        @for (i of byCategory(cat); track i.key) {
          <div class="card row">
            <div class="info">
              <div class="name">{{ i.name }}</div>
              <div class="muted small">{{ i.detail }}</div>
            </div>
            <span class="badge" [class.badge-success]="i.status === 'live'" [class.badge-warning]="i.status === 'fallback'" [class.badge-danger]="i.status === 'not_configured'">
              {{ statusLabel(i.status) }}
            </span>
          </div>
        }
      </div>
    }
    @if (!rows().length) { <p class="muted pad">Could not load integration status.</p> }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .section { margin: 20px 0 10px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
      .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .name { font-weight: 700; }
      .small { font-size: 0.8rem; margin-top: 2px; }
      .pad { padding: 16px; }
    `,
  ],
})
export class IntegrationsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  rows = signal<IntegrationInfo[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<IntegrationInfo[]>('/integrations').subscribe({
      next: (rows) => this.rows.set(rows),
      error: (e) => this.notify.push('Could not load integrations', e?.message, 'warning'),
    });
  }

  categories(): string[] {
    return [...new Set(this.rows().map((r) => r.category))];
  }
  byCategory(cat: string): IntegrationInfo[] {
    return this.rows().filter((r) => r.category === cat);
  }
  statusLabel(s: IntegrationInfo['status']): string {
    return { live: 'Live', fallback: 'Fallback / mock', not_configured: 'Not configured' }[s];
  }
}
