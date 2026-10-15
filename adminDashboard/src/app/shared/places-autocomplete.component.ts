import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { ApiService } from '../core/services/api.service';

export interface PickedPlace {
  line1: string;
  city: string;
  state?: string;
  pincode: string;
  lat: number;
  lng: number;
  label: string;
}

interface PlacePrediction {
  placeId: string;
  description: string;
}

function newSessionToken(): string {
  return crypto.randomUUID();
}

/**
 * Google Places Autocomplete, proxied through the backend's `/places` (Redis-cached +
 * cost-optimized there — see backend/src/modules/places). No API key here: the client
 * never talks to Google directly, which is both the secure answer and the only way the
 * backend cache actually works. One session token is generated per field instance and
 * reused across every keystroke's autocomplete call plus the final details call —
 * Google's documented cost-saving mechanism for this Autocomplete+Details pairing.
 * A fresh token is generated after each pick so the next address starts its own session.
 */
@Component({
  selector: 'app-places-autocomplete',
  standalone: true,
  template: `
    <div class="wrap">
      <input
        class="input"
        [value]="query()"
        (input)="onInput($event)"
        placeholder="Search a place, area, landmark…"
      />
      @if (loading()) { <span class="spinner"></span> }
      @if (predictions().length) {
        <ul class="suggest">
          @for (p of predictions(); track p.placeId) {
            <li (click)="pick(p)">{{ p.description }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .wrap { position: relative; }
      .input { width: 100%; }
      .spinner { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--brand-500, #f97316); border-radius: 50%; animation: spin 0.7s linear infinite; }
      @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }
      .suggest { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 500; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); list-style: none; max-height: 240px; overflow-y: auto; margin: 0; padding: 0; }
      .suggest li { padding: 9px 12px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
      .suggest li:hover { background: var(--surface-2); color: var(--brand-700); }
    `,
  ],
})
export class PlacesAutocompleteComponent {
  @Output() picked = new EventEmitter<PickedPlace>();

  private readonly api = inject(ApiService);
  query = signal('');
  predictions = signal<PlacePrediction[]>([]);
  loading = signal(false);

  private sessionToken = newSessionToken();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  onInput(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.query.set(q);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (q.trim().length < 3) { this.predictions.set([]); return; }
    this.debounceTimer = setTimeout(() => this.search(q.trim()), 350);
  }

  private search(q: string): void {
    const id = ++this.requestId;
    this.loading.set(true);
    this.api
      .get<PlacePrediction[]>('/places/autocomplete', { input: q, sessiontoken: this.sessionToken })
      .subscribe({
        next: (predictions) => { if (id === this.requestId) this.predictions.set(predictions); },
        error: () => { if (id === this.requestId) this.predictions.set([]); },
        complete: () => { if (id === this.requestId) this.loading.set(false); },
      });
  }

  pick(p: PlacePrediction): void {
    this.query.set(p.description);
    this.predictions.set([]);
    this.api
      .get<PickedPlace | null>('/places/details', { place_id: p.placeId, sessiontoken: this.sessionToken })
      .subscribe({
        next: (details) => { if (details) this.picked.emit(details); },
        complete: () => { this.sessionToken = newSessionToken(); }, // next address starts a new session
      });
  }
}
