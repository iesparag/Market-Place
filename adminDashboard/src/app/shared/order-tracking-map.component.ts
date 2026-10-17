import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';

/**
 * Live rider → drop-point map for the Delivery page's tracking panel — same shape as
 * customerfacing's app-order-tracking-map (kept separate since admin and the website
 * are independent Angular projects with no shared component layer). Read-only: a
 * rider marker that moves as [riderLat]/[riderLng] update, a fixed drop marker, and
 * a line between them.
 */
@Component({
  selector: 'app-order-tracking-map',
  standalone: true,
  template: `<div #map class="map"></div>`,
  styles: [
    `
      .map { height: 320px; border-radius: var(--radius-sm, 8px); overflow: hidden; margin-top: 10px; }
    `,
  ],
})
export class OrderTrackingMapComponent implements OnChanges, OnDestroy {
  @Input() riderLat: number | null = null;
  @Input() riderLng: number | null = null;
  @Input() dropLat: number | null = null;
  @Input() dropLng: number | null = null;

  @ViewChild('map') private mapEl?: ElementRef<HTMLDivElement>;

  private L: any;
  private map: any;
  private riderMarker: any;
  private dropMarker: any;
  private line: any;
  private ready = false;

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.ready) {
      await this.init();
      this.ready = true;
    }
    if (!this.map) return;
    if (changes['riderLat'] || changes['riderLng']) this.updateRider();
    if (changes['dropLat'] || changes['dropLng']) this.updateDrop();
    this.fit();
  }

  private ensureCss(): void {
    if (document.getElementById('leaflet-css')) return;
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  private async init(): Promise<void> {
    if (!this.mapEl) return;
    this.ensureCss();
    const mod: any = await import('leaflet');
    const L = mod.default ?? mod;
    this.L = L;
    const center: [number, number] = [this.riderLat ?? this.dropLat ?? 22.9734, this.riderLng ?? this.dropLng ?? 78.6569];
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private riderIcon(): any {
    return this.L.divIcon({ html: '🛵', className: 'rider-emoji-icon', iconSize: [28, 28] });
  }
  private dropIcon(): any {
    return this.L.divIcon({ html: '📍', className: 'drop-emoji-icon', iconSize: [26, 26] });
  }

  private updateRider(): void {
    if (this.riderLat == null || this.riderLng == null) {
      if (this.riderMarker) { this.map.removeLayer(this.riderMarker); this.riderMarker = null; }
      return;
    }
    const pos: [number, number] = [this.riderLat, this.riderLng];
    if (this.riderMarker) this.riderMarker.setLatLng(pos);
    else this.riderMarker = this.L.marker(pos, { icon: this.riderIcon() }).addTo(this.map);
  }

  private updateDrop(): void {
    if (this.dropLat == null || this.dropLng == null) return;
    const pos: [number, number] = [this.dropLat, this.dropLng];
    if (this.dropMarker) this.dropMarker.setLatLng(pos);
    else this.dropMarker = this.L.marker(pos, { icon: this.dropIcon() }).addTo(this.map);
  }

  private fit(): void {
    if (!this.map) return;
    const points: [number, number][] = [];
    if (this.riderLat != null && this.riderLng != null) points.push([this.riderLat, this.riderLng]);
    if (this.dropLat != null && this.dropLng != null) points.push([this.dropLat, this.dropLng]);
    if (!points.length) return;
    if (points.length === 2) {
      if (this.line) this.map.removeLayer(this.line);
      this.line = this.L.polyline(points, { color: '#ea580c', weight: 3, dashArray: '6,8' }).addTo(this.map);
      this.map.fitBounds(this.L.latLngBounds(points), { padding: [30, 30] });
    } else {
      this.map.setView(points[0], 15);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
