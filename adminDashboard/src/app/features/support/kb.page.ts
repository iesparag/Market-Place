import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface KbDoc {
  _id: string;
  title: string;
  body: string;
  category: 'policy' | 'faq' | 'howto' | 'other';
  storeId?: string;
  tags: string[];
  active: boolean;
  updatedAt: string;
}

/** Policy/FAQ/how-to docs the support bot grounds its answers in. Platform-wide
 * (no store) or vendor-scoped. See docs/10-SUPPORT-AI.md §4. */
@Component({
  selector: 'app-kb',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header class="head">
      <div><h1>Knowledge Base</h1><p class="muted">Policy, FAQ and how-to content the support bot answers from</p></div>
      <button class="btn btn-primary btn-sm" (click)="openCreate()">+ New doc</button>
    </header>

    <div class="toolbar">
      <select class="input" [(ngModel)]="categoryFilter" (ngModelChange)="load()">
        <option value="">All categories</option>
        <option value="policy">Policy</option>
        <option value="faq">FAQ</option>
        <option value="howto">How-to</option>
        <option value="other">Other</option>
      </select>
      <span class="count muted">{{ docs().length }} doc(s)</span>
    </div>

    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>Title</th><th>Category</th><th>Scope</th><th>Active</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          @for (d of docs(); track d._id) {
            <tr>
              <td><b>{{ d.title }}</b></td>
              <td><span class="badge">{{ d.category }}</span></td>
              <td class="muted tiny">{{ d.storeId ? 'This vendor' : 'Platform-wide' }}</td>
              <td><span class="badge" [class.badge-success]="d.active" [class.badge-warning]="!d.active">{{ d.active ? 'active' : 'off' }}</span></td>
              <td class="muted tiny">{{ d.updatedAt | date: 'short' }}</td>
              <td class="actions">
                <button class="btn btn-ghost btn-sm" (click)="openEdit(d)">Edit</button>
                <button class="btn btn-ghost btn-sm del" (click)="remove(d)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="pad muted">No docs yet — add your return policy, shipping FAQ, etc.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editing()) {
      <div class="backdrop" (click)="editing.set(null)"></div>
      <div class="modal card">
        <h3>{{ draft._id ? 'Edit doc' : 'New doc' }}</h3>
        <label class="label">Title</label>
        <input class="input" [(ngModel)]="draft.title" />
        <label class="label">Category</label>
        <select class="input" [(ngModel)]="draft.category">
          <option value="faq">FAQ</option>
          <option value="policy">Policy</option>
          <option value="howto">How-to</option>
          <option value="other">Other</option>
        </select>
        <label class="label">Body</label>
        <textarea class="input" rows="8" [(ngModel)]="draft.body" placeholder="Plain text — this is what the bot reads."></textarea>
        <label class="check"><input type="checkbox" [(ngModel)]="draft.active" /><span>Active (bot can use this doc)</span></label>
        @if (saveError()) { <div class="err">{{ saveError() }}</div> }
        <div class="mactions">
          <button class="btn btn-ghost" (click)="editing.set(null)">Cancel</button>
          <button class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .toolbar .input { max-width: 200px; }
      .count { white-space: nowrap; }
      .tiny { font-size: 0.78rem; }
      .pad { padding: 16px; }
      .actions { white-space: nowrap; display: flex; gap: 6px; }
      .del:hover { color: var(--danger); }
      .label { margin-top: 10px; }
      .check { display: flex; align-items: center; gap: 8px; margin-top: 12px; cursor: pointer; }
      .check input { width: auto; }
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 40; }
      .modal { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(520px, 92vw); max-height: 86vh; overflow-y: auto; }
      .mactions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
      .err { color: var(--danger); font-size: 0.85rem; margin-top: 10px; }
    `,
  ],
})
export class KbPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  docs = signal<KbDoc[]>([]);
  categoryFilter = '';
  editing = signal<KbDoc | 'new' | null>(null);
  draft: Partial<KbDoc> = {};
  saving = signal(false);
  saveError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.categoryFilter) params['category'] = this.categoryFilter;
    this.api.get<KbDoc[]>('/support/kb', params).subscribe({
      next: (rows) => this.docs.set(rows),
      error: (e) => this.notify.push('Could not load KB docs', e?.message, 'warning'),
    });
  }

  openCreate(): void {
    this.draft = { title: '', body: '', category: 'faq', active: true };
    this.saveError.set(null);
    this.editing.set('new');
  }
  openEdit(d: KbDoc): void {
    this.draft = { ...d };
    this.saveError.set(null);
    this.editing.set(d);
  }

  save(): void {
    if (!this.draft.title?.trim() || !this.draft.body?.trim()) {
      this.saveError.set('Title and body are required.');
      return;
    }
    this.saving.set(true);
    const body = { title: this.draft.title, body: this.draft.body, category: this.draft.category, active: this.draft.active };
    const req = this.draft._id
      ? this.api.put<KbDoc>(`/support/kb/${this.draft._id}`, body)
      : this.api.post<KbDoc>('/support/kb', body);
    req.subscribe({
      next: () => { this.saving.set(false); this.editing.set(null); this.notify.push('Saved', undefined, 'success'); this.load(); },
      error: (e) => { this.saving.set(false); this.saveError.set(e?.message ?? 'Could not save'); },
    });
  }

  remove(d: KbDoc): void {
    if (!confirm(`Delete "${d.title}"?`)) return;
    this.api.delete(`/support/kb/${d._id}`).subscribe({
      next: () => { this.notify.push('Deleted', d.title, 'success'); this.load(); },
      error: (e) => this.notify.push('Delete failed', e?.message, 'warning'),
    });
  }
}
