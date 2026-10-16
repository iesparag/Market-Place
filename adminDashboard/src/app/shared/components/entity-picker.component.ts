import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

export interface PickedEntity {
  id: string;
  label: string;
  sublabel?: string;
  image?: string;
  /** Passthrough for fields the caller needs but the picker UI doesn't render — e.g.
   * a product/store `slug` to build a deep link from once something is picked. */
  meta?: Record<string, unknown>;
}

/**
 * Search-as-you-type picker backed by any `GET <endpoint>?q=` search API (products,
 * stores, users all support it — see backend products/stores/users controllers).
 * Used wherever an admin needs to attach/target a specific record: the product/vendor
 * link on a push, or the individual-customer audience on push + WhatsApp campaigns.
 */
@Component({
  selector: 'app-entity-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="picker">
      <div class="input-wrap">
        <input class="input" [(ngModel)]="q" (ngModelChange)="search()" [placeholder]="placeholder" />
        @if (loading()) {
          <span class="spinner" title="Searching…"></span>
        }
      </div>
      @if (results().length) {
        <div class="dropdown">
          @for (r of results(); track r.id) {
            <div class="row" (click)="pick(r)">
              @if (r.image) { <img [src]="r.image" alt="" /> }
              <div class="text">
                <b>{{ r.label }}</b>
                @if (r.sublabel) { <span class="muted"> · {{ r.sublabel }}</span> }
              </div>
            </div>
          }
        </div>
      }
      @if (!clearOnPick && picked().length) {
        <div class="chips">
          @for (p of picked(); track p.id) {
            <span class="chip">{{ p.label }} <button type="button" (click)="remove(p)">×</button></span>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .picker { position: relative; }
      .input-wrap { position: relative; display: flex; align-items: center; }
      .input-wrap .input { width: 100%; padding-right: 32px; }
      .spinner { position: absolute; right: 10px; width: 14px; height: 14px; border: 2px solid #cbd5e1;
        border-top-color: var(--primary, #ea580c); border-radius: 50%; animation: spin 0.6s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .dropdown { position: absolute; z-index: 100; top: 100%; left: 0; right: 0; background: #fff;
        border: 1px solid var(--border, #cbd5e1); border-radius: 10px; margin-top: 4px; max-height: 280px;
        overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,.15); }
      .row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; font-size: 0.88rem;
        border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
      .row:last-child { border-bottom: none; }
      .row:hover { background: #fff7ed; }
      .row img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid #e2e8f0; }
      .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .text b { color: #0f172a; font-size: 0.9rem; }
      .text .muted { color: #64748b; font-size: 0.82rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--bg, #f1f3f5);
        border-radius: 999px; padding: 4px 6px 4px 10px; font-size: 0.82rem; }
      .chip button { border: none; background: none; cursor: pointer; font-size: 1rem; line-height: 1; color: var(--muted, #888); }
    `,
  ],
})
export class EntityPickerComponent {
  private readonly api = inject(ApiService);

  @Input() endpoint = ''; // e.g. '/products', '/stores', '/users'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() mapFn: (raw: any) => PickedEntity = (r) => ({ id: r._id, label: r.name });
  @Input() placeholder = 'Search…';
  @Input() multiple = false;
  @Input() clearOnPick = false;
  @Input() extraParams: Record<string, string> = {};
  @Output() changed = new EventEmitter<PickedEntity[]>();

  q = '';
  loading = signal(false);
  results = signal<PickedEntity[]>([]);
  picked = signal<PickedEntity[]>([]);
  private debounce?: ReturnType<typeof setTimeout>;

  search(): void {
    clearTimeout(this.debounce);
    const term = this.q.trim();
    if (!term) {
      this.results.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.debounce = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.api.get<any>(this.endpoint, { q: term, ...this.extraParams }).subscribe({
        next: (res: any) => {
          this.loading.set(false);
          let list: any[] = [];
          if (Array.isArray(res)) {
            list = res;
          } else if (Array.isArray(res?.items)) {
            list = res.items;
          } else if (Array.isArray(res?.data?.items)) {
            list = res.data.items;
          } else if (Array.isArray(res?.data)) {
            list = res.data;
          } else if (res && typeof res === 'object') {
            const arr = Object.values(res).find((v) => Array.isArray(v));
            if (Array.isArray(arr)) list = arr as any[];
          }
          this.results.set(list.map(this.mapFn));
        },
        error: (err) => {
          console.error('Search failed in entity-picker', err);
          this.loading.set(false);
          this.results.set([]);
        },
      });
    }, 300);
  }

  pick(r: PickedEntity): void {
    if (this.clearOnPick) {
      this.changed.emit([r]);
      this.q = '';
      this.results.set([]);
      this.picked.set([]);
      return;
    }

    if (this.multiple) {
      if (!this.picked().some((p) => p.id === r.id)) this.picked.update((arr) => [...arr, r]);
      this.q = '';
    } else {
      this.picked.set([r]);
      this.q = r.label;
    }
    this.results.set([]);
    this.changed.emit(this.picked());
  }

  remove(r: PickedEntity): void {
    this.picked.update((arr) => arr.filter((p) => p.id !== r.id));
    this.changed.emit(this.picked());
  }

  clear(): void {
    this.picked.set([]);
    this.q = '';
    this.results.set([]);
    this.changed.emit([]);
  }
}

