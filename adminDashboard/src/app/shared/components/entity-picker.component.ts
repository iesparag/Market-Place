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
      <input class="input" [(ngModel)]="q" (ngModelChange)="search()" [placeholder]="placeholder" />
      @if (results().length) {
        <div class="dropdown">
          @for (r of results(); track r.id) {
            <div class="row" (click)="pick(r)">
              @if (r.image) { <img [src]="r.image" /> }
              <div class="text">
                <b>{{ r.label }}</b>
                @if (r.sublabel) { <span class="muted"> · {{ r.sublabel }}</span> }
              </div>
            </div>
          }
        </div>
      }
      @if (picked().length) {
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
      .dropdown { position: absolute; z-index: 20; top: 100%; left: 0; right: 0; background: #fff;
        border: 1px solid var(--border); border-radius: 10px; margin-top: 4px; max-height: 260px;
        overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      .row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: 0.88rem; }
      .row:hover { background: var(--bg, #f6f7f9); }
      .row img { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
      .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  @Input() extraParams: Record<string, string> = {};
  @Output() changed = new EventEmitter<PickedEntity[]>();

  q = '';
  results = signal<PickedEntity[]>([]);
  picked = signal<PickedEntity[]>([]);
  private debounce?: ReturnType<typeof setTimeout>;

  search(): void {
    clearTimeout(this.debounce);
    const term = this.q.trim();
    if (!term) {
      this.results.set([]);
      return;
    }
    this.debounce = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.api.get<any[]>(this.endpoint, { q: term, ...this.extraParams }).subscribe((rows) => {
        this.results.set(rows.map(this.mapFn));
      });
    }, 300);
  }

  pick(r: PickedEntity): void {
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
