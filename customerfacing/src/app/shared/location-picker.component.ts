import { Component, ElementRef, EventEmitter, Output, PLATFORM_ID, ViewChild, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface PickedLocation {
  line1: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  label: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

/**
 * Free location picker — OpenStreetMap (Leaflet) + Nominatim search/reverse-geocode.
 * No API key, no billing. Search an address or drag the pin → emits line1/city/pincode.
 * SSR-safe: Leaflet + its CSS are loaded only in the browser.
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  template: `
    <button type="button" class="toggle" (click)="toggle()">📍 {{ open() ? 'Hide map' : 'Search location / pin on map' }}</button>
    @if (open()) {
      <div class="panel">
        <div class="searchbar">
          <input class="input" [value]="query()" (input)="onSearch($event)" placeholder="Search a place, area, landmark…" />
          <button type="button" class="mine" (click)="useMyLocation()" title="Use my location">🎯</button>
          @if (results().length) {
            <ul class="suggest">
              @for (r of results(); track r.display_name) {
                <li (click)="pickResult(r)">{{ r.display_name }}</li>
              }
            </ul>
          }
        </div>
        <div #map class="map"></div>
        <p class="hint muted">Drag the pin or tap the map to set the exact spot — the fields below auto-fill.</p>
      </div>
    }
  `,
  styles: [
    `
      .toggle { background: none; border: 1px dashed var(--brand-400, #fb923c); color: var(--brand-700); font-weight: 600; padding: 9px 12px; border-radius: var(--radius-sm); cursor: pointer; width: 100%; margin-top: 6px; }
      .toggle:hover { background: var(--brand-50, #fff5ef); }
      .panel { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
      .searchbar { position: relative; display: flex; gap: 6px; padding: 10px; }
      .searchbar .input { flex: 1; }
      .mine { width: 42px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; font-size: 1.05rem; }
      .suggest { position: absolute; top: 52px; left: 10px; right: 10px; z-index: 500; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); list-style: none; max-height: 240px; overflow-y: auto; }
      .suggest li { padding: 9px 12px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
      .suggest li:hover { background: var(--surface-2); color: var(--brand-700); }
      .map { height: 280px; width: 100%; background: #e8eef2; }
      .hint { padding: 8px 12px; font-size: 0.78rem; }
    `,
  ],
})
export class LocationPickerComponent {
  @Output() picked = new EventEmitter<PickedLocation>();
  @ViewChild('map') mapEl?: ElementRef<HTMLDivElement>;

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  open = signal(false);
  query = signal('');
  results = signal<NominatimItem[]>([]);

  private L: any;
  private map: any;
  private marker: any;
  private lastLatLng: [number, number] | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next && this.browser) {
      // Wait for the map div to render, then (re)initialise.
      setTimeout(() => this.initMap(), 60);
    } else if (!next && this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
  }

  /** Inject Leaflet's CSS at runtime so the map renders even without an angular.json rebuild. */
  private ensureLeafletCss(): void {
    if (typeof document === 'undefined' || document.getElementById('leaflet-css')) return;
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  private async initMap(): Promise<void> {
    if (!this.mapEl || this.map) return;
    this.ensureLeafletCss();
    const mod: any = await import('leaflet');
    const L = mod.default ?? mod;
    this.L = L;

    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
    });

    const center: [number, number] = this.lastLatLng ?? [22.9734, 78.6569]; // remembered spot or India
    this.map = L.map(this.mapEl.nativeElement).setView(center, this.lastLatLng ? 15 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(this.map);
    this.marker = L.marker(center, { draggable: true, icon }).addTo(this.map);
    this.marker.on('dragend', () => {
      const ll = this.marker.getLatLng();
      this.lastLatLng = [ll.lat, ll.lng];
      this.reverse(ll);
    });
    this.map.on('click', (e: any) => {
      this.marker.setLatLng(e.latlng);
      this.lastLatLng = [e.latlng.lat, e.latlng.lng];
      this.reverse(e.latlng);
    });
    // Container was hidden until now → recompute size so tiles fill it.
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private setPos(lat: number, lng: number): void {
    this.lastLatLng = [lat, lng];
    if (this.map && this.marker) {
      this.map.setView([lat, lng], 16);
      this.marker.setLatLng([lat, lng]);
    }
  }

  onSearch(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.query.set(q);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (q.trim().length < 3) { this.results.set([]); return; }
    this.searchTimer = setTimeout(() => this.runSearch(q.trim()), 350);
  }

  private async runSearch(q: string): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      this.results.set((await res.json()) as NominatimItem[]);
    } catch { this.results.set([]); }
  }

  pickResult(r: NominatimItem): void {
    this.results.set([]);
    this.query.set(r.display_name);
    this.setPos(+r.lat, +r.lon);
    this.emit(r);
  }

  private async reverse(latlng: { lat: number; lng: number }): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${latlng.lat}&lon=${latlng.lng}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const item = (await res.json()) as NominatimItem;
      this.query.set(item.display_name ?? '');
      this.emit(item);
    } catch { /* ignore */ }
  }

  useMyLocation(): void {
    if (!this.browser || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      this.setPos(lat, lng);
      this.reverse({ lat, lng });
    });
  }

  private emit(item: NominatimItem): void {
    const a = item.address ?? {};
    const line1 = [a['house_number'], a['road'] || a['neighbourhood'] || a['suburb']].filter(Boolean).join(', ')
      || (item.display_name?.split(',').slice(0, 2).join(',') ?? '');
    const city = a['city'] || a['town'] || a['village'] || a['municipality'] || a['county'] || a['state_district'] || '';
    const pincode = a['postcode'] ?? '';
    this.picked.emit({ line1, city, pincode, lat: +item.lat, lng: +item.lon, label: item.display_name ?? '' });
  }
}
