import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

interface Answer { _id: string; userName?: string; role: 'buyer' | 'vendor' | 'admin'; text: string; }
interface Question { _id: string; userName?: string; text: string; answers: Answer[]; createdAt: string; }
type Role = 'buyer' | 'vendor' | 'admin' | null;

/** Product Q&A: anyone signed-in can ask; buyers (if allowed) / vendor / admin answer; vendor/admin moderate. */
@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (faqEnabled()) {
      <div class="card faq">
        <h3>Questions &amp; Answers @if (questions().length) { <span class="muted">({{ questions().length }})</span> }</h3>

        @if (auth.isLoggedIn()) {
          <div class="ask">
            <textarea class="input" rows="2" [(ngModel)]="askText" placeholder="Ask a question about this product…"></textarea>
            <button class="btn btn-primary btn-sm" [disabled]="submitting() || askText.trim().length < 3" (click)="ask()">Ask question</button>
          </div>
        } @else {
          <p class="muted"><a routerLink="/login">Sign in</a> to ask a question.</p>
        }

        @for (q of questions(); track q._id) {
          <div class="qa">
            <div class="q">
              <span class="mark qm">Q</span>
              <div class="qbody"><b>{{ q.text }}</b> <span class="muted small">— {{ q.userName || 'Customer' }}</span></div>
              @if (canModerate()) { <button class="del" title="Delete question" (click)="deleteQuestion(q._id)">🗑</button> }
            </div>

            @for (a of q.answers; track a._id) {
              <div class="a">
                <span class="mark am">A</span>
                <div class="abody">
                  <span class="rb" [class]="a.role">{{ roleLabel(a.role) }}</span>
                  {{ a.text }} <span class="muted small">— {{ a.userName || 'User' }}</span>
                </div>
                @if (canModerate()) { <button class="del" title="Delete answer" (click)="deleteAnswer(q._id, a._id)">✕</button> }
              </div>
            }

            @if (canReply()) {
              @if (replyingTo() === q._id) {
                <div class="reply">
                  <input class="input" [(ngModel)]="replyText" placeholder="Write an answer…" />
                  <button class="btn btn-sm btn-primary" [disabled]="!replyText.trim()" (click)="sendReply(q._id)">Send</button>
                  <button class="btn btn-sm btn-ghost" (click)="replyingTo.set(null)">Cancel</button>
                </div>
              } @else {
                <button class="replybtn" (click)="startReply(q._id)">↳ Answer this</button>
              }
            }
          </div>
        } @empty { <p class="muted none">No questions yet — be the first to ask!</p> }
      </div>
    }
  `,
  styles: [
    `
      .faq { margin-top: 20px; }
      .ask { display: grid; gap: 8px; margin: 10px 0 18px; }
      .qa { padding: 14px 0; border-top: 1px solid var(--border); }
      .q, .a { display: flex; align-items: flex-start; gap: 10px; }
      .a { margin: 8px 0 0 8px; }
      .mark { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-weight: 800; font-size: 0.78rem; flex: none; }
      .qm { background: var(--ink); color: #fff; }
      .am { background: #e7f8ee; color: #15803d; }
      .qbody, .abody { flex: 1; font-size: 0.92rem; line-height: 1.4; }
      .rb { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; margin-right: 6px; vertical-align: middle; }
      .rb.vendor { background: #fff0e6; color: var(--brand-700); }
      .rb.admin { background: #eef2ff; color: #4f46e5; }
      .rb.buyer { background: var(--surface-2); color: var(--text-muted); }
      .del { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.9rem; }
      .del:hover { color: var(--danger); }
      .replybtn { background: none; border: none; color: var(--brand-700); font-weight: 600; font-size: 0.82rem; cursor: pointer; margin: 8px 0 0 32px; padding: 0; }
      .reply { display: flex; gap: 8px; margin: 8px 0 0 32px; }
      .reply .input { flex: 1; }
      .small { font-size: 0.78rem; } .none { padding: 8px 0; }
    `,
  ],
})
export class FaqComponent implements OnInit {
  @Input() productId = '';
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  questions = signal<Question[]>([]);
  faqEnabled = signal(true);
  private myRole = signal<Role>(null);
  askText = '';
  replyText = '';
  replyingTo = signal<string | null>(null);
  submitting = signal(false);

  canReply = () => this.myRole() !== null;
  canModerate = () => this.myRole() === 'admin' || this.myRole() === 'vendor';
  roleLabel = (r: string) => (r === 'vendor' ? 'Seller' : r === 'admin' ? 'Admin' : 'Buyer');

  ngOnInit(): void {
    this.load();
    if (this.auth.isLoggedIn()) {
      this.api.get<{ role: Role }>(`/faq/product/${this.productId}/can-answer`).subscribe({ next: (r) => this.myRole.set(r.role), error: () => {} });
    }
  }
  load(): void {
    this.api.get<{ faqEnabled: boolean; questions: Question[] }>(`/faq/product/${this.productId}`).subscribe({
      next: (r) => { this.faqEnabled.set(r.faqEnabled); this.questions.set(r.questions); },
    });
  }

  ask(): void {
    if (this.askText.trim().length < 3) return;
    this.submitting.set(true);
    this.api.post(`/faq/product/${this.productId}/question`, { text: this.askText.trim() }).subscribe({
      next: () => { this.askText = ''; this.submitting.set(false); this.load(); },
      error: () => this.submitting.set(false),
    });
  }
  startReply(qid: string): void { this.replyingTo.set(qid); this.replyText = ''; }
  sendReply(qid: string): void {
    if (!this.replyText.trim()) return;
    this.api.post(`/faq/question/${qid}/answer`, { text: this.replyText.trim() }).subscribe({
      next: () => { this.replyText = ''; this.replyingTo.set(null); this.load(); },
    });
  }
  deleteQuestion(qid: string): void {
    if (!confirm('Delete this question and its answers?')) return;
    this.api.delete(`/faq/question/${qid}`).subscribe({ next: () => this.load() });
  }
  deleteAnswer(qid: string, aid: string): void {
    this.api.delete(`/faq/question/${qid}/answer/${aid}`).subscribe({ next: () => this.load() });
  }
}
