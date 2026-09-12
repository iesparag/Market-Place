import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { downloadCsv } from '../../shared/csv';
import { matchesSearch } from '../../shared/search';

interface AuditRow { _id: string; at: string; actor: string; action: string; targetType?: string; targetId?: string; }

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header class="head">
      <div><h1>Audit log</h1><p class="muted">Sensitive actions across the platform</p></div>
      <button class="btn btn-sm" (click)="exportCsv()">⬇ Export CSV</button>
    </header>
    <div class="toolbar">
      <input class="input search" [(ngModel)]="q" placeholder="Search by actor, action or target…" />
      <span class="count muted">{{ filtered().length }} of {{ rows().length }}</span>
    </div>
    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>
          @for (r of filtered(); track r._id) {
            <tr>
              <td class="muted">{{ r.at | date: 'short' }}</td>
              <td>{{ r.actor }}</td>
              <td><span class="badge">{{ r.action }}</span></td>
              <td class="muted">{{ r.targetType }} {{ r.targetId ? '#' + r.targetId.slice(-6) : '' }}</td>
            </tr>
          } @empty { <tr><td colspan="4" class="pad muted">{{ q ? 'No entries match your search.' : 'No audit entries yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .search { flex: 1; max-width: 360px; } .count { white-space: nowrap; }
      .pad { padding: 16px; }
    `,
  ],
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  rows = signal<AuditRow[]>([]);
  q = '';

  filtered(): AuditRow[] {
    return this.rows().filter((r) => matchesSearch(this.q, r.actor, r.action, r.targetType, r.targetId));
  }

  ngOnInit(): void {
    this.api.get<AuditRow[]>('/audit').subscribe({ next: (r) => this.rows.set(r) });
  }

  exportCsv(): void {
    downloadCsv('audit-log.csv', this.rows(), [
      { label: 'When', value: (r) => r.at },
      { label: 'Actor', value: (r) => r.actor },
      { label: 'Action', value: (r) => r.action },
      { label: 'Target Type', value: (r) => r.targetType ?? '' },
      { label: 'Target Id', value: (r) => r.targetId ?? '' },
    ]);
  }
}
