import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { matchesSearch } from '../../shared/search';

interface Answer { _id: string; userName?: string; role: string; text: string; }
interface Question { _id: string; productTitle: string; userName?: string; text: string; answers: Answer[]; createdAt: string; }

/** Vendor/admin answer customer questions on their products + delete inappropriate ones. */
@Component({
  selector: 'app-admin-questions',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  template: `
    <header class="head">
      <div><h1>Customer Questions</h1><p class="muted">Answer buyers & moderate the product Q&A</p></div>
      <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
    </header>

    <div class="toolbar">
      <input class="input search" [(ngModel)]="search" placeholder="Search by product, customer or question text…" />
      <span class="count muted">{{ filtered().length }} of {{ questions().length }}</span>
    </div>

    @for (q of filtered(); track q._id) {
      <div class="card qa">
        <div class="top">
          <div>
            <span class="prod">{{ q.productTitle }}</span>
            <div class="qtext"><b>Q:</b> {{ q.text }} <span class="muted small">— {{ q.userName || 'Customer' }} · {{ q.createdAt | slice: 0:10 }}</span></div>
          </div>
          <button class="btn btn-ghost btn-sm del" (click)="deleteQuestion(q)">🗑 Delete</button>
        </div>

        @for (a of q.answers; track a._id) {
          <div class="ans">
            <span class="rb" [class]="a.role">{{ a.role }}</span>
            {{ a.text }} <span class="muted small">— {{ a.userName }}</span>
            <button class="btn btn-ghost btn-sm x" (click)="deleteAnswer(q, a)">✕</button>
          </div>
        }

        <div class="reply">
          <input class="input" [(ngModel)]="drafts[q._id]" placeholder="Write an answer…" />
          <button class="btn btn-primary btn-sm" [disabled]="!drafts[q._id]" (click)="answer(q)">Answer</button>
        </div>
      </div>
    } @empty { <div class="card muted pad">{{ search ? 'No questions match your search.' : 'No questions yet.' }}</div> }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
      .search { flex: 1; max-width: 360px; } .count { white-space: nowrap; }
      .qa { margin-bottom: 14px; }
      .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .prod { font-size: 0.75rem; font-weight: 700; color: var(--brand-700); text-transform: uppercase; letter-spacing: 0.04em; }
      .qtext { margin-top: 4px; }
      .small { font-size: 0.78rem; }
      .ans { margin: 10px 0 0 12px; padding-left: 10px; border-left: 2px solid var(--border); font-size: 0.92rem; display: flex; align-items: center; gap: 8px; }
      .rb { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; }
      .rb.vendor { background: #fff0e6; color: var(--brand-700); } .rb.admin { background: #eef2ff; color: #4f46e5; } .rb.buyer { background: var(--surface-2); color: var(--text-muted); }
      .x { margin-left: auto; color: var(--danger); }
      .reply { display: flex; gap: 8px; margin-top: 12px; } .reply .input { flex: 1; }
      .del { color: var(--danger); } .pad { padding: 16px; }
    `,
  ],
})
export class QuestionsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  questions = signal<Question[]>([]);
  drafts: Record<string, string> = {};
  search = '';

  filtered(): Question[] {
    return this.questions().filter((q) => matchesSearch(this.search, q.productTitle, q.userName, q.text));
  }

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Question[]>('/faq').subscribe({ next: (q) => this.questions.set(q) }); }

  answer(q: Question): void {
    const text = this.drafts[q._id]?.trim();
    if (!text) return;
    this.api.post(`/faq/question/${q._id}/answer`, { text }).subscribe({
      next: () => { this.drafts[q._id] = ''; this.notify.push('Answer posted', q.productTitle, 'success'); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }
  deleteQuestion(q: Question): void {
    if (!confirm('Delete this question?')) return;
    this.api.delete(`/faq/question/${q._id}`).subscribe({ next: () => this.load() });
  }
  deleteAnswer(q: Question, a: Answer): void {
    this.api.delete(`/faq/question/${q._id}/answer/${a._id}`).subscribe({ next: () => this.load() });
  }
}
