import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { SocketService } from '../../core/services/socket.service';
import { AuthFacade } from '../../store/auth/auth.facade';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

interface TicketRow {
  _id: string;
  intent: string;
  sentiment: string;
  urgency: number;
  summary: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  storeId?: string;
  orderId?: string;
  riderId?: string;
  updatedAt: string;
  assigneeId?: string;
  slaDueAt?: string;
}
interface Message { _id: string; role: 'customer' | 'bot' | 'agent' | 'system'; text: string; createdAt: string; }
interface Thread { _id: string; messages: Message[]; }
interface TicketDetail { ticket: TicketRow & { suggestedReply?: string; suggestedConfidence?: number; resolution?: string }; thread: Thread; }
interface OrderSummary {
  _id: string;
  orderNumber: string;
  amounts: { grandTotal: number };
  payment?: { method?: string; status?: string; refundedAmount?: number };
}
interface Macro { label: string; text: string; }

/** Admin/vendor support inbox — the escalated-ticket queue (bot → human handoff).
 * See docs/10-SUPPORT-AI.md's S4 phase: list/detail, filters, draft editor. */
@Component({
  selector: 'app-support-inbox',
  standalone: true,
  imports: [DatePipe, FormsModule, HasPermissionDirective],
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
      <select class="input" [(ngModel)]="channelFilter">
        <option value="">All channels</option>
        <option value="customer">🛍️ Customer</option>
        <option value="rider">🏍️ Rider</option>
      </select>
      <span class="count muted">{{ filteredTickets().length }} ticket(s)</span>
    </div>

    <div class="layout">
      <div class="card card--flush list">
        <table class="table">
          <thead><tr><th>Urgency</th><th>From</th><th>Intent</th><th>Summary</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            @for (t of filteredTickets(); track t._id) {
              <tr [class.sel]="selected()?.ticket?._id === t._id" (click)="open(t._id)">
                <td><span class="badge" [class.badge-danger]="t.urgency >= 3" [class.badge-warning]="t.urgency === 2">U{{ t.urgency }}</span></td>
                <td class="tiny">{{ t.riderId ? '🏍️ Rider' : '🛍️ Customer' }}</td>
                <td>
                  {{ t.intent }}
                  @if (isOverdue(t)) { <span class="badge badge-danger tiny">overdue</span> }
                </td>
                <td class="summary">{{ t.summary || '—' }}</td>
                <td><span class="badge" [class.badge-success]="t.status === 'resolved'" [class.badge-info]="t.status === 'open'">{{ t.status }}</span></td>
                <td class="muted tiny">{{ t.updatedAt | date: 'short' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="pad muted">No tickets match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="card detail">
        @if (selected(); as d) {
          <div class="dhead">
            <span class="badge">{{ d.ticket.riderId ? '🏍️ Rider' : '🛍️ Customer' }}</span>
            <span class="badge" [class.badge-success]="d.ticket.status === 'resolved'">{{ d.ticket.status }}</span>
            @if (isOverdue(d.ticket)) { <span class="badge badge-danger">overdue</span> }
            <select class="input statuspick" [(ngModel)]="statusPick" (ngModelChange)="updateStatus(d.ticket._id, $event)">
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button class="btn btn-ghost btn-sm" (click)="assignToMe(d.ticket._id)">
              {{ d.ticket.assigneeId === myUserId() ? '✓ Assigned to you' : 'Assign to me' }}
            </button>
          </div>
          @if (order(); as o) {
            <div class="ordercard">
              <div>
                <b>{{ o.orderNumber }}</b> · ₹{{ o.amounts.grandTotal / 100 }}
                <span class="badge" [class.badge-success]="o.payment?.status === 'paid'" [class.badge-warning]="o.payment?.status === 'partially_refunded'">
                  {{ o.payment?.status ?? 'unpaid' }}
                </span>
              </div>
              @if (isRefundable(o)) {
                <button class="btn btn-ghost btn-sm refund" *hasPermission="'order:refund'" [disabled]="refunding()" (click)="approveRefund(o)">
                  {{ refunding() ? 'Processing…' : '✓ Approve refund' }}
                </button>
              }
            </div>
            <p class="muted tiny note">A refund only ever happens here, after you review — the bot can never approve or send one itself.</p>
          }
          <div class="thread">
            @for (m of d.thread.messages; track m._id) {
              <div class="msg" [class.me]="m.role === 'agent'" [class.bot]="m.role === 'bot'">
                <span class="role tiny muted">{{ m.role }}</span>
                <div class="bubble">{{ m.text }}</div>
              </div>
            }
          </div>
          <div class="replybox">
            @if (macros().length) {
              <select class="input macropick" (change)="insertMacro($any($event.target).value); $any($event.target).value = ''">
                <option value="">📋 Insert canned response…</option>
                @for (m of macros(); track m.label) { <option [value]="m.text">{{ m.label }}</option> }
              </select>
            }
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
      .ordercard { display: flex; justify-content: space-between; align-items: center; gap: 10px;
                   background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
                   padding: 10px 12px; margin-bottom: 4px; }
      .refund:hover { color: var(--success); border-color: var(--success); }
      .note { margin: 4px 0 12px; }
      .macropick { margin-bottom: 8px; }
    `,
  ],
})
export class SupportInboxPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  private readonly socket = inject(SocketService);
  private readonly auth = inject(AuthFacade);
  private readonly me = toSignal(this.auth.user$);
  myUserId = () => this.me()?.id;

  tickets = signal<TicketRow[]>([]);
  selected = signal<TicketDetail | null>(null);
  order = signal<OrderSummary | null>(null);
  macros = signal<Macro[]>([]);
  statusFilter = '';
  channelFilter = '';
  statusPick = 'open';
  replyText = '';
  sending = signal(false);
  regenerating = signal(false);
  refunding = signal(false);

  constructor() {
    // Live refresh — a new/updated ticket (customer OR rider) reloads the list without
    // the admin needing to click Refresh, and refreshes the open ticket if it's the one.
    effect(() => {
      const evt = this.socket.lastTicketEvent();
      if (!evt) return;
      this.load();
      if (evt.ticketId === this.selected()?.ticket._id) this.open(evt.ticketId);
    });
  }

  filteredTickets(): TicketRow[] {
    if (!this.channelFilter) return this.tickets();
    return this.tickets().filter((t) => (this.channelFilter === 'rider' ? !!t.riderId : !t.riderId));
  }

  /** Overdue = past SLA and still open for work — a resolved/closed ticket is never "late". */
  isOverdue(t: TicketRow): boolean {
    return !!t.slaDueAt && new Date(t.slaDueAt) < new Date() && (t.status === 'open' || t.status === 'in_progress');
  }

  ngOnInit(): void {
    this.load();
    this.api.get<Macro[]>('/support/macros').subscribe({ next: (m) => this.macros.set(m), error: () => {} });
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.statusFilter) params['status'] = this.statusFilter;
    this.api.get<TicketRow[]>('/support/tickets', params).subscribe({
      next: (rows) => this.tickets.set(rows),
      error: (e) => this.notify.push('Could not load tickets', e?.message, 'warning'),
    });
  }

  insertMacro(text: string): void {
    if (!text) return;
    this.replyText = this.replyText ? `${this.replyText}\n${text}` : text;
  }

  assignToMe(id: string): void {
    const userId = this.myUserId();
    if (!userId) return;
    this.api.post(`/support/tickets/${id}/assign`, { assigneeId: userId }).subscribe({
      next: () => {
        this.notify.push('Assigned to you', undefined, 'success');
        const cur = this.selected();
        if (cur) this.selected.set({ ...cur, ticket: { ...cur.ticket, assigneeId: userId } });
        this.load();
      },
      error: (e) => this.notify.push('Could not assign', e?.message, 'warning'),
    });
  }

  open(id: string): void {
    this.replyText = '';
    this.order.set(null);
    this.api.get<TicketDetail>(`/support/tickets/${id}`).subscribe({
      next: (d) => {
        this.selected.set(d);
        this.statusPick = d.ticket.status;
        if (d.ticket.orderId) {
          this.api.get<OrderSummary>(`/orders/${d.ticket.orderId}`).subscribe({ next: (o) => this.order.set(o), error: () => {} });
        }
      },
      error: (e) => this.notify.push('Could not load ticket', e?.message, 'warning'),
    });
  }

  /** Only a paid (or already-partially-refunded) order has money to return. */
  isRefundable(o: OrderSummary): boolean {
    return o.payment?.status === 'paid' || o.payment?.status === 'partially_refunded';
  }

  /** The only place a refund actually happens — same endpoint/permission the Orders page
   * uses. The bot never calls this; a human reviews the ticket and clicks it. */
  approveRefund(o: OrderSummary): void {
    if (!confirm(`Refund ${o.orderNumber}? This reverses the vendor payout + commission.`)) return;
    this.refunding.set(true);
    this.api.post<OrderSummary>(`/orders/${o._id}/refund`, {}).subscribe({
      next: (updated) => {
        this.refunding.set(false);
        this.order.set(updated);
        this.notify.push('Refund processed', o.orderNumber, 'success');
      },
      error: (e) => { this.refunding.set(false); this.notify.push('Refund failed', e?.message, 'warning'); },
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
