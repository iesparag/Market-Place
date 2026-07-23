import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { downloadCsv } from '../../shared/csv';

interface AuditRow { _id: string; at: string; actor: string; action: string; targetType?: string; targetId?: string; }

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [DatePipe],
  template: `
    <header class="head">
      <div><h1>Audit log</h1><p class="muted">Sensitive actions across the platform</p></div>
      <button class="btn btn-sm" (click)="exportCsv()">⬇ Export CSV</button>
    </header>
    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td class="muted">{{ r.at | date: 'short' }}</td>
              <td>{{ r.actor }}</td>
              <td><span class="badge">{{ r.action }}</span></td>
              <td class="muted">{{ r.targetType }} {{ r.targetId ? '#' + r.targetId.slice(-6) : '' }}</td>
            </tr>
          } @empty { <tr><td colspan="4" class="pad muted">No audit entries yet.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [`.head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; } .pad { padding: 16px; }`],
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  rows = signal<AuditRow[]>([]);

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
