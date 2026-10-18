import { AfterViewChecked, Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

interface Message { role: 'customer' | 'bot' | 'agent' | 'system'; text: string; createdAt?: string; }
interface Thread { _id: string; messages: Message[]; status: string; }
interface OrderOption { _id: string; orderNumber: string; }

const QUICK_INTENTS = ["Where's my order?", 'Return or refund', 'Cancel my order', 'Payment issue', 'Damaged / wrong item'];

/**
 * Floating support chat — the website's equivalent of customer_app's SupportScreen
 * (same backend: /support/threads, same quick-intent chips, same safety guarantee —
 * every tool call happens server-side in the guarded registry; this widget is just
 * the chrome). Mounted once, globally, in app.component.ts.
 */
@Component({
  selector: 'app-support-chat',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (channelOn()) {
      <button class="fab" (click)="toggle()" [class.open]="open()">
        {{ open() ? '✕' : '💬' }}
      </button>

      @if (open()) {
        <div class="panel card">
          <div class="phead">
            <span>Support</span>
            <button class="close" (click)="open.set(false)">✕</button>
          </div>

          @if (!auth.isLoggedIn()) {
            <div class="signin">
              <p class="muted">Sign in to chat with support.</p>
              <a class="btn btn-primary btn-sm" routerLink="/login">Sign in</a>
            </div>
          } @else if (loading()) {
            <div class="loading muted">Connecting…</div>
          } @else {
            @if (escalated()) {
              <div class="banner">🤝 Passed to our team — they'll reply here shortly.</div>
            }
            <div class="ctxbar">
              @if (selectedOrder(); as o) {
                <span class="ctxchip">📦 {{ o.orderNumber }} <button type="button" (click)="selectedOrder.set(null)">✕</button></span>
              } @else {
                <button type="button" class="ctxpick" (click)="showOrderPicker.set(!showOrderPicker())">📦 Attach an order ▾</button>
              }
              @if (showOrderPicker()) {
                <div class="orderlist">
                  @for (o of orders(); track o._id) {
                    <button type="button" (click)="pickOrder(o)">{{ o.orderNumber }}</button>
                  } @empty {
                    <span class="muted tiny">No orders yet.</span>
                  }
                </div>
              }
            </div>
            <div class="messages" #scrollEl>
              @for (m of messages(); track $index) {
                @if (m.role === 'system') {
                  <div class="sys">{{ m.text }}</div>
                } @else {
                  <div class="bubble" [class.me]="m.role === 'customer'" [class.bot]="m.role === 'bot'">
                    @if (m.role !== 'customer') { <span class="who tiny">{{ m.role }}</span> }
                    {{ m.text }}
                  </div>
                }
              }
              @if (sending()) { <div class="bubble bot typing">…</div> }
            </div>

            @if (error()) { <div class="err">{{ error() }}</div> }

            <div class="quicks">
              @for (q of quickIntents; track q) {
                <button class="chip" (click)="send(q)">{{ q }}</button>
              }
            </div>
            <div class="composer">
              <input class="input" [(ngModel)]="draft" (keydown.enter)="send(draft)" placeholder="Type a message…" />
              <button class="btn btn-primary btn-sm" [disabled]="!draft.trim() || sending()" (click)="send(draft)">Send</button>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .fab { position: fixed; bottom: 22px; right: 22px; width: 56px; height: 56px; border-radius: 50%;
             background: var(--brand-600); color: #fff; border: none; font-size: 1.5rem; cursor: pointer;
             box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.2)); z-index: 50; }
      .fab.open { background: var(--ink); }
      .panel { position: fixed; bottom: 90px; right: 22px; width: min(380px, 92vw); height: min(560px, 72vh);
               display: flex; flex-direction: column; z-index: 50; padding: 0; overflow: hidden; }
      .phead { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px;
               background: var(--brand-600); color: #fff; font-weight: 700; }
      .close { background: none; border: none; color: #fff; cursor: pointer; font-size: 1rem; }
      .signin, .loading { padding: 24px; text-align: center; }
      .banner { background: var(--brand-50, #fff5ef); color: var(--brand-700); font-size: 0.82rem; padding: 8px 14px; }
      .messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
      .sys { align-self: center; background: var(--brand-50, #fff5ef); color: var(--brand-700); font-size: 0.78rem;
             font-weight: 600; padding: 6px 12px; border-radius: 12px; text-align: center; }
      .bubble { align-self: flex-start; max-width: 80%; background: var(--surface-2); border-radius: 14px 14px 14px 4px;
                padding: 9px 13px; font-size: 0.88rem; }
      .bubble.me { align-self: flex-end; background: var(--brand-600); color: #fff; border-radius: 14px 14px 4px 14px; }
      .bubble.bot { background: var(--brand-50, #fff5ef); }
      .bubble.typing { opacity: 0.6; }
      .who { display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 700; color: var(--brand-700); margin-bottom: 2px; }
      .err { color: var(--danger); font-size: 0.78rem; padding: 0 14px 6px; }
      .quicks { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 8px; }
      .chip { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 5px 11px;
              font-size: 0.76rem; font-weight: 600; cursor: pointer; }
      .chip:hover { border-color: var(--brand-600); color: var(--brand-700); }
      .composer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); }
      .composer .input { flex: 1; }
      .tiny { font-size: 0.68rem; }
      .ctxbar { padding: 0 12px 6px; position: relative; }
      .ctxpick { background: none; border: 1px dashed var(--border); border-radius: 8px; padding: 5px 10px;
                 font-size: 0.76rem; font-weight: 600; cursor: pointer; color: var(--brand-700); }
      .ctxchip { display: inline-flex; align-items: center; gap: 6px; background: var(--brand-50, #fff5ef);
                 color: var(--brand-700); font-size: 0.76rem; font-weight: 700; padding: 5px 10px; border-radius: 8px; }
      .ctxchip button { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.7rem; }
      .orderlist { position: absolute; top: 100%; left: 12px; right: 12px; background: var(--surface);
                   border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); z-index: 5;
                   max-height: 160px; overflow-y: auto; }
      .orderlist button { display: block; width: 100%; text-align: left; padding: 8px 12px; border: none;
                           background: none; cursor: pointer; font-size: 0.82rem; }
      .orderlist button:hover { background: var(--surface-2); }
      .orderlist .muted { padding: 8px 12px; display: block; }
    `,
  ],
})
export class SupportChatComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  quickIntents = QUICK_INTENTS;

  @ViewChild('scrollEl') private scrollEl?: ElementRef<HTMLDivElement>;

  channelOn = signal(false);
  open = signal(false);
  loading = signal(false);
  messages = signal<Message[]>([]);
  escalated = signal(false);
  sending = signal(false);
  error = signal<string | null>(null);
  draft = '';

  orders = signal<OrderOption[]>([]);
  selectedOrder = signal<OrderOption | null>(null);
  showOrderPicker = signal(false);

  private threadId: string | null = null;
  private started = false;

  ngOnInit(): void {
    this.api.get<{ botEnabled: boolean; channels?: { web?: boolean } }>('/support/config/public').subscribe({
      next: (c) => this.channelOn.set(c.channels?.web !== false),
      error: () => this.channelOn.set(false),
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open() && this.auth.isLoggedIn() && !this.started) this.start();
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  pickOrder(o: OrderOption): void {
    this.selectedOrder.set(o);
    this.showOrderPicker.set(false);
  }

  private start(): void {
    this.started = true;
    this.loading.set(true);
    this.api.post<Thread>('/support/threads', { channel: 'web' }).subscribe({
      next: (t) => {
        this.loading.set(false);
        this.threadId = t._id;
        this.messages.set(t.messages);
        this.escalated.set(t.status === 'pending_admin');
        this.scrollToBottom();
      },
      error: (e) => { this.loading.set(false); this.error.set(e?.message ?? 'Could not start chat'); },
    });
    this.api.get<OrderOption[]>('/orders').subscribe({ next: (o) => this.orders.set(o.slice(0, 10)), error: () => {} });
  }

  send(text: string): void {
    const body = text.trim();
    if (!body || !this.threadId || this.sending()) return;
    this.draft = '';
    this.error.set(null);
    this.messages.update((m) => [...m, { role: 'customer', text: body }]);
    this.sending.set(true);
    this.scrollToBottom();
    const order = this.selectedOrder();
    this.api.post<{ thread: Thread; reply: string; escalated: boolean }>(`/support/threads/${this.threadId}/message`, {
      text: body,
      ...(order ? { context: { orderId: order._id } } : {}),
    }).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.messages.set(res.thread.messages);
        this.escalated.set(res.escalated || this.escalated());
        this.scrollToBottom();
      },
      error: (e) => {
        this.sending.set(false);
        this.messages.update((m) => m.slice(0, -1));
        this.error.set(e?.status === 429 ? "You're sending messages too fast — give it a moment." : (e?.message ?? 'Message failed to send.'));
      },
    });
  }
}
