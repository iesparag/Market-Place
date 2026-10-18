import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface TicketRow {
  _id: string;
  intent: string;
  sentiment: string;
  urgency: number;
  summary: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  storeId?: string;
  updatedAt: string;
  assigneeId?: string;
}
interface Message { _id: string; role: 'customer' | 'bot' | 'agent' | 'system'; text: string; createdAt: string; }
interface Thread { _id: string; messages: Message[]; }
interface TicketDetail { ticket: TicketRow & { suggestedReply?: string; suggestedConfidence?: number; resolution?: string }; thread: Thread; }

/** Admin/vendor support inbox — the escalated-ticket queue (bot → human handoff).
 * See docs/10-SUPPORT-AI.md's S4 phase: list/detail, filters, draft editor. */
@Component({
  selector: 'app-support-inbox',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header class="head">
      <div><h1>Support Inbox</h1><p class="muted">Escalated tickets — bot handed these to a human</p></div>
      <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
    </header>

    <div class="toolbar">
      <select class="input" [(ngModel)]="statusFilter" (ngModelChange)="load()">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
      <span class="count muted">{{ tickets().length }} ticket(s)</span>
    </div>

    <div class="layout">
      <div class="card card--flush list">
        <table class="table">
          <thead><tr><th>Urgency</th><th>Intent</th><th>Summary</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            @for (t of tickets(); track t._id) {
              <tr [class.sel]="selected()?.ticket?._id === t._id" (click)="open(t._id)">
                <td><span class="badge" [class.badge-danger]="t.urgency >= 3" [class.badge-warning]="t.urgency === 2">U{{ t.urgency }}</span></td>
                <td>{{ t.intent }}</td>
                <td class="summary">{{ t.summary || '—' }}</td>
                <td><span class="badge" [class.badge-success]="t.status === 'resolved'" [class.badge-info]="t.status === 'open'">{{ t.status }}</span></td>
                <td class="muted tiny">{{ t.updatedAt | date: 'short' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="pad muted">No tickets match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="card detail">
        @if (selected(); as d) {
          <div class="dhead">
            <span class="badge" [class.badge-success]="d.ticket.status === 'resolved'">{{ d.ticket.status }}</span>
            <select class="input statuspick" [(ngModel)]="statusPick" (ngModelChange)="updateStatus(d.ticket._id, $event)">
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div class="thread">
            @for (m of d.thread.messages; track m._id) {
              <div class="msg" [class.me]="m.role === 'agent'" [class.bot]="m.role === 'bot'">
                <span class="role tiny muted">{{ m.role }}</span>
                <div class="bubble">{{ m.text }}</div>
              </div>
            }
          </div>
          <div class="replybox">
            <textarea class="input" rows="3" [(ngModel)]="replyText" placeholder="Type a reply…"></textarea>
            <div class="replyactions">
              <button class="btn btn-ghost btn-sm" [disabled]="regenerating()" (click)="regenerate(d.ticket._id)">
                {{ regenerating() ? 'Thinking…' : '✨ Suggest reply' }}
              </button>
              <button class="btn btn-primary btn-sm" [disabled]="!replyText.trim() || sending()" (click)="send(d.ticket._id)">
                {{ sending() ? 'Sending…' : 'Send reply' }}
              </button>
            </div>
          </div>
        } @else {
          <p class="muted pad">Select a ticket to view the conversation.</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
      .head h1 { margin-bottom: 2px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .toolbar .input { max-width: 200px; }
      .count { white-space: nowrap; }
      .layout { display: grid; grid-template-columns: 1fr 1.1fr; gap: 16px; align-items: start; }
      @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
      .list tr { cursor: pointer; } .list tr.sel { background: var(--brand-50, #fff5ef); }
      .summary { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tiny { font-size: 0.75rem; } .pad { padding: 16px; }
      .detail { min-height: 300px; display: flex; flex-direction: column; }
      .dhead { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
      .statuspick { max-width: 160px; }
      .thread { flex: 1; overflow-y: auto; max-height: 420px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
      .msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 80%; }
      .msg.me { align-self: flex-end; align-items: flex-end; }
      .msg .role { margin-bottom: 2px; text-transform: uppercase; }
      .bubble { background: var(--surface-2); border-radius: var(--radius-sm); padding: 8px 12px; }
      .msg.me .bubble { background: var(--brand-600); color: #fff; }
      .msg.bot .bubble { background: var(--brand-50, #fff5ef); }
      .replybox { border-top: 1px solid var(--border); padding-top: 12px; }
      .replyactions { display: flex; justify-content: space-between; margin-top: 8px; }
    `,
  ],
})
export class SupportInboxPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  tickets = signal<TicketRow[]>([]);
  selected = signal<TicketDetail | null>(null);
  statusFilter = '';
  statusPick = 'open';
  replyText = '';
  sending = signal(false);
  regenerating = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.statusFilter) params['status'] = this.statusFilter;
    this.api.get<TicketRow[]>('/support/tickets', params).subscribe({
      next: (rows) => this.tickets.set(rows),
      error: (e) => this.notify.push('Could not load tickets', e?.message, 'warning'),
    });
  }

  open(id: string): void {
    this.replyText = '';
    this.api.get<TicketDetail>(`/support/tickets/${id}`).subscribe({
      next: (d) => { this.selected.set(d); this.statusPick = d.ticket.status; },
      error: (e) => this.notify.push('Could not load ticket', e?.message, 'warning'),
    });
  }

  send(id: string): void {
    const text = this.replyText.trim();
    if (!text) return;
    this.sending.set(true);
    this.api.post<{ ticket: TicketRow; thread: Thread }>(`/support/tickets/${id}/reply`, { text }).subscribe({
      next: (d) => {
        this.sending.set(false);
        this.replyText = '';
        this.selected.set({ ticket: d.ticket as TicketDetail['ticket'], thread: d.thread });
        this.notify.push('Reply sent', undefined, 'success');
        this.load();
      },
      error: (e) => { this.sending.set(false); this.notify.push('Could not send reply', e?.message, 'warning'); },
    });
  }

  regenerate(id: string): void {
    this.regenerating.set(true);
    this.api.post<TicketDetail['ticket']>(`/support/tickets/${id}/regenerate`, {}).subscribe({
      next: (ticket) => {
        this.regenerating.set(false);
        this.replyText = ticket.suggestedReply ?? '';
        const cur = this.selected();
        if (cur) this.selected.set({ ...cur, ticket });
      },
      error: (e) => { this.regenerating.set(false); this.notify.push('Could not generate a draft', e?.message, 'warning'); },
    });
  }

  updateStatus(id: string, status: string): void {
    this.api.post(`/support/tickets/${id}/assign`, { status }).subscribe({
      next: () => { this.notify.push('Ticket updated', undefined, 'success'); this.load(); },
      error: (e) => this.notify.push('Could not update ticket', e?.message, 'warning'),
    });
  }
}
