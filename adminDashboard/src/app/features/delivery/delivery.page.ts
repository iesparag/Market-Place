import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { SocketService } from '../../core/services/socket.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { OrderTrackingMapComponent } from '../../shared/order-tracking-map.component';

interface DeliveryTask {
  _id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  status: string;
  fulfillmentSource: 'own_fleet' | 'third_party';
  items: { title?: string; qty: number }[];
  riderId?: string;
  assignmentMode?: 'manual' | 'auto';
  offer?: { riderId?: string; sentAt?: string; expiresAt?: string; attempt?: number };
  excludedRiderIds?: string[];
  dropAddress?: { line1?: string; city?: string; pincode?: string; lat?: number; lng?: number };
  thirdParty?: { provider?: string; trackingUrl?: string };
  createdAt: string;
}

interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  status: string;
  rating: number;
  activeTaskCount: number;
  totalDeliveries: number;
  isActive: boolean;
  currentLocation?: { lat?: number; lng?: number; at?: string };
}

interface DeliverySettings {
  assignmentMode: 'manual' | 'auto';
  criteriaWeights: { distance: number; rating: number; activeLoad: number; reliability: number; vehicleMatch: number };
  offerTimeoutSeconds: number;
  maxOfferCascadeAttempts: number;
  maxAssignRadiusKm: number;
  serviceableCities: string[];
  thirdPartyFallbackEnabled: boolean;
}

@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ReactiveFormsModule, HasPermissionDirective, OrderTrackingMapComponent],
  template: `
    <header class="head">
      <div><h1>Delivery</h1><p class="muted">Riders, assignment, and who covers where — manual or automatic</p></div>
    </header>

    <div class="tabs">
      <button class="tab" [class.active]="tab() === 'tasks'" (click)="tab.set('tasks')">Tasks</button>
      <button class="tab" [class.active]="tab() === 'riders'" (click)="tab.set('riders')">Riders</button>
      <button class="tab" [class.active]="tab() === 'settings'" *hasPermission="'delivery:settings'" (click)="tab.set('settings')">Settings</button>
    </div>

    <!-- ───────────────────────── TASKS ───────────────────────── -->
    @if (tab() === 'tasks') {
      <div class="toolbar">
        <select class="input status-filter" [(ngModel)]="statusFilter" (change)="loadTasks()">
          <option value="">All statuses</option>
          <option value="ready">Ready for pickup</option>
          <option value="pickup_started">Rider heading to pickup</option>
          <option value="pickup_arrived">Rider at the store</option>
          <option value="picked_up">Picked up</option>
          <option value="delivery_started">Out for delivery</option>
          <option value="delivery_arrived">Rider arrived</option>
          <option value="delivered">Delivered</option>
        </select>
        <label class="check">
          <input type="checkbox" [(ngModel)]="unassignedOnly" (change)="loadTasks()" />
          <span>Unassigned only</span>
        </label>
        <button class="btn btn-ghost btn-sm" (click)="loadTasks()">↻ Refresh</button>
      </div>

      <div class="card card--flush">
        <table class="table">
          <thead>
            <tr><th>Order</th><th>Drop</th><th>Source</th><th>Status</th><th>Rider</th><th class="rcol" *hasPermission="'delivery:assign'"></th></tr>
          </thead>
          <tbody>
            @for (t of tasks(); track t._id) {
              <tr>
                <td><b>{{ t.orderNumber }}</b></td>
                <td class="muted tiny">{{ t.dropAddress?.city || '—' }}</td>
                <td>
                  <span class="badge" [class.badge-info]="t.fulfillmentSource === 'third_party'">
                    {{ t.fulfillmentSource === 'third_party' ? 'Third-party' : 'Own fleet' }}
                  </span>
                  @if (t.fulfillmentSource === 'third_party' && t.thirdParty?.trackingUrl) {
                    <div><a [href]="t.thirdParty!.trackingUrl" target="_blank" class="tiny">Track ↗</a></div>
                  }
                </td>
                <td>
                  <span class="badge" [class.badge-success]="t.status === 'delivered'" [class.badge-info]="isInTransit(t.status)" [class.badge-warning]="t.status === 'ready'">{{ statusLabel(t.status) }}</span>
                </td>
                <td>
                  @if (t.riderId) {
                    {{ riderName(t.riderId) }}
                    @if (t.assignmentMode === 'auto') { <span class="badge badge-info tiny">auto</span> }
                  } @else if (t.offer?.riderId) {
                    <span class="badge badge-warning">Offered → {{ riderName(t.offer!.riderId) }}</span>
                    <div class="tiny muted">attempt {{ t.offer!.attempt }}@if (t.excludedRiderIds?.length) { · {{ t.excludedRiderIds!.length }} declined/timed out }</div>
                  } @else {
                    —
                  }
                </td>
                <td class="actions" *hasPermission="'delivery:assign'">
                  @if (t.fulfillmentSource === 'own_fleet') {
                    <select class="input rider-select" [(ngModel)]="picked[t._id]">
                      <option [ngValue]="undefined">— choose rider —</option>
                      @for (r of activeRiders(); track r.id) {
                        <option [ngValue]="r.id">{{ r.name }} ({{ r.activeTaskCount }} active)</option>
                      }
                    </select>
                    <button class="btn btn-primary btn-sm" [disabled]="!picked[t._id] || busy() === t._id" (click)="assign(t)">
                      {{ t.riderId ? 'Reassign' : 'Assign' }}
                    </button>
                    @if (t.riderId) {
                      <button class="btn btn-ghost btn-sm" [disabled]="busy() === t._id" (click)="unassign(t)">Unassign</button>
                    }
                  }
                  @if (isInTransit(t.status) && t.riderId) {
                    <button class="btn btn-ghost btn-sm" (click)="openTracking(t)">📍 Track</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="pad muted">No tasks match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ───────────────────────── RIDERS ───────────────────────── -->
    @if (tab() === 'riders') {
      <div class="toolbar">
        <span class="count muted">{{ riders().length }} rider(s)</span>
        <button class="btn btn-primary btn-sm" *hasPermission="'rider:manage'" (click)="openCreate()">+ Add rider</button>
      </div>

      <div class="card card--flush">
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Vehicle</th><th>Online status</th><th>Rating</th><th>Active</th><th>Delivered</th><th></th></tr>
          </thead>
          <tbody>
            @for (r of riders(); track r.id) {
              <tr [class.dim]="!r.isActive">
                <td><b>{{ r.name }}</b></td>
                <td class="muted">{{ r.phone }}</td>
                <td>{{ r.vehicleType }}</td>
                <td><span class="badge" [class.badge-success]="r.status === 'available'" [class.badge-warning]="r.status === 'busy'">{{ r.status }}</span></td>
                <td>⭐ {{ r.rating | number: '1.1-1' }}</td>
                <td>{{ r.activeTaskCount }}</td>
                <td>{{ r.totalDeliveries }}</td>
                <td class="actions" *hasPermission="'rider:manage'">
                  <button class="btn btn-ghost btn-sm" (click)="toggleActive(r)">{{ r.isActive ? 'Deactivate' : 'Activate' }}</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="pad muted">No riders onboarded yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ───────────────────────── SETTINGS ───────────────────────── -->
    @if (tab() === 'settings') {
      <form class="card" [formGroup]="form" (ngSubmit)="saveSettings()" style="max-width:520px">
        <label class="label">Rider assignment</label>
        <div class="radios">
          <label class="check"><input type="radio" formControlName="assignmentMode" value="manual" /><span>Manual — admin/vendor picks the rider</span></label>
          <label class="check"><input type="radio" formControlName="assignmentMode" value="auto" /><span>Automatic — scored and offered out</span></label>
        </div>

        <h3 class="section">Coverage</h3>
        <label class="label">Serviceable cities (comma-separated — our own riders cover these)</label>
        <input class="input" formControlName="serviceableCitiesText" placeholder="e.g. New Delhi, Gurugram, Noida" />
        <p class="hint">Leave empty to treat everywhere as covered by our own fleet.</p>
        <label class="check">
          <input type="checkbox" formControlName="thirdPartyFallbackEnabled" />
          <span>Route orders outside those cities to a third-party courier automatically</span>
        </label>

        <h3 class="section">Auto-assignment scoring (used once "Automatic" is selected)</h3>
        <div class="weights">
          <div><label class="label">Distance</label><input class="input" type="number" step="0.05" formControlName="wDistance" /></div>
          <div><label class="label">Rating</label><input class="input" type="number" step="0.05" formControlName="wRating" /></div>
          <div><label class="label">Active load</label><input class="input" type="number" step="0.05" formControlName="wActiveLoad" /></div>
          <div><label class="label">Reliability</label><input class="input" type="number" step="0.05" formControlName="wReliability" /></div>
          <div><label class="label">Vehicle match</label><input class="input" type="number" step="0.05" formControlName="wVehicleMatch" /></div>
        </div>
        <p class="hint" [class.err]="weightSum() < 0.98 || weightSum() > 1.02">Weights sum to {{ weightSum() | number: '1.2-2' }} — should total 1.00.</p>

        <label class="label">Offer timeout (seconds)</label>
        <input class="input" type="number" formControlName="offerTimeoutSeconds" />
        <label class="label">Max riders to try before falling back to manual</label>
        <input class="input" type="number" formControlName="maxOfferCascadeAttempts" />
        <label class="label">Max assignment radius (km)</label>
        <input class="input" type="number" formControlName="maxAssignRadiusKm" />

        <button class="btn btn-primary" [disabled]="form.invalid || savingSettings()">{{ savingSettings() ? 'Saving…' : 'Save settings' }}</button>
      </form>
    }

    <!-- ───────────────────────── CREATE RIDER MODAL ───────────────────────── -->
    @if (creating()) {
      <div class="backdrop" (click)="creating.set(false)"></div>
      <div class="modal card">
        <h3>Add rider</h3>
        <label class="label">Name</label>
        <input class="input" [(ngModel)]="newRider.name" />
        <label class="label">Phone</label>
        <input class="input" [(ngModel)]="newRider.phone" placeholder="10-digit mobile" />
        <label class="label">Temporary password</label>
        <input class="input" [(ngModel)]="newRider.password" placeholder="Share this with the rider" />
        <label class="label">Vehicle</label>
        <select class="input" [(ngModel)]="newRider.vehicleType">
          <option value="bike">Bike</option>
          <option value="scooter">Scooter</option>
          <option value="bicycle">Bicycle</option>
          <option value="car">Car</option>
          <option value="van">Van</option>
        </select>
        @if (createError()) { <div class="err">{{ createError() }}</div> }
        <div class="mactions">
          <button class="btn btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button class="btn btn-primary" [disabled]="creatingBusy()" (click)="createRider()">{{ creatingBusy() ? 'Adding…' : 'Add rider' }}</button>
        </div>
      </div>
    }

    <!-- ───────────────────────── LIVE TRACKING ───────────────────────── -->
    @if (tracking(); as t) {
      <div class="backdrop" (click)="closeTracking()"></div>
      <div class="modal card trackmodal">
        <div class="thead">
          <h3>Tracking {{ t.orderNumber }}</h3>
          <button class="btn btn-ghost btn-sm" (click)="closeTracking()">✕</button>
        </div>
        <div class="tstatus badge badge-info">{{ statusLabel(t.status) }}</div>
        <p class="muted small">🏍️ {{ riderName(t.riderId) }}</p>
        <app-order-tracking-map
          [riderLat]="liveRiderPos()?.lat ?? riderLastKnown(t.riderId)?.lat ?? null"
          [riderLng]="liveRiderPos()?.lng ?? riderLastKnown(t.riderId)?.lng ?? null"
          [dropLat]="t.dropAddress?.lat ?? null"
          [dropLng]="t.dropAddress?.lng ?? null" />
      </div>
    }
  `,
  styles: [
    `
      .head { margin-bottom: 16px; }
      .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 18px; }
      .tab { padding: 10px 16px; border: none; background: none; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; }
      .tab.active { color: var(--brand-600); border-bottom-color: var(--brand-600); }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .status-filter { max-width: 200px; }
      .check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; }
      .check input { width: auto; }
      .count { white-space: nowrap; }
      .pad { padding: 16px; }
      .actions { white-space: nowrap; display: flex; gap: 6px; align-items: center; }
      .rider-select { width: auto; max-width: 220px; display: inline-block; }
      .rcol { width: 320px; }
      .tiny { font-size: 0.75rem; }
      tr.dim { opacity: 0.6; }
      .label { margin-top: 10px; }
      .section { margin: 24px 0 4px; padding-top: 18px; border-top: 1px solid var(--border); }
      .hint { font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0; }
      .hint.err { color: var(--danger); }
      .radios { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
      .weights { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; margin-top: 6px; }
      .btn-primary { margin-top: 16px; }
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 40; }
      .modal { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, 92vw); }
      .mactions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
      .err { color: var(--danger); font-size: 0.85rem; margin-top: 10px; }
      .trackmodal { width: min(480px, 92vw); }
      .thead { display: flex; justify-content: space-between; align-items: center; }
      .tstatus { margin: 8px 0 4px; }
    `,
  ],
})
export class DeliveryPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly socket = inject(SocketService);

  tab = signal<'tasks' | 'riders' | 'settings'>('tasks');

  // Tasks
  tasks = signal<DeliveryTask[]>([]);
  riders = signal<Rider[]>([]);
  busy = signal<string | null>(null);
  statusFilter = '';
  unassignedOnly = false;
  picked: Record<string, string | undefined> = {};

  activeRiders(): Rider[] {
    return this.riders().filter((r) => r.isActive);
  }
  riderName(id?: string): string {
    if (!id) return '—';
    return this.riders().find((r) => r.id === id)?.name ?? '—';
  }

  /** The 5 rider-controlled pickup/delivery sub-stages — shown with the "in progress" badge. */
  isInTransit(status: string): boolean {
    return ['pickup_started', 'pickup_arrived', 'picked_up', 'delivery_started', 'delivery_arrived'].includes(status);
  }

  statusLabel(s: string): string {
    return (
      {
        ready: 'Ready for pickup',
        pickup_started: 'Heading to pickup',
        pickup_arrived: 'At the store',
        picked_up: 'Picked up',
        delivery_started: 'Out for delivery',
        delivery_arrived: 'Arrived',
        delivered: 'Delivered',
      }[s] ?? s
    );
  }

  // ── Live tracking ────────────────────────────────────────────────────────
  tracking = signal<DeliveryTask | null>(null);
  liveRiderPos = signal<{ lat: number; lng: number } | null>(null);

  constructor() {
    // Delivery-task status push for whichever order is currently being tracked.
    effect(() => {
      const upd = this.socket.lastStatus();
      const t = this.tracking();
      if (upd && t && upd.orderId === t.orderId && upd.subOrderId === t._id) {
        this.tracking.set({ ...t, status: upd.status });
        this.tasks.update((rows) => rows.map((r) => (r._id === t._id ? { ...r, status: upd.status } : r)));
      }
    });
    effect(() => {
      const loc = this.socket.lastLocation();
      const t = this.tracking();
      if (loc && t && loc.orderId === t.orderId) this.liveRiderPos.set({ lat: loc.lat, lng: loc.lng });
    });
  }

  riderLastKnown(riderId?: string): { lat?: number; lng?: number } | undefined {
    if (!riderId) return undefined;
    return this.riders().find((r) => r.id === riderId)?.currentLocation;
  }

  openTracking(t: DeliveryTask): void {
    this.liveRiderPos.set(null);
    this.tracking.set(t);
    this.socket.joinOrder(t.orderId);
  }
  closeTracking(): void {
    this.socket.leaveOrder();
    this.tracking.set(null);
    this.liveRiderPos.set(null);
  }

  ngOnDestroy(): void {
    this.socket.leaveOrder();
  }

  // Riders — create modal
  creating = signal(false);
  creatingBusy = signal(false);
  createError = signal<string | null>(null);
  newRider = { name: '', phone: '', password: '', vehicleType: 'bike' };

  // Settings
  savingSettings = signal(false);
  form = this.fb.nonNullable.group({
    assignmentMode: ['manual' as 'manual' | 'auto', Validators.required],
    serviceableCitiesText: [''],
    thirdPartyFallbackEnabled: [true],
    wDistance: [0.35, [Validators.min(0), Validators.max(1)]],
    wRating: [0.2, [Validators.min(0), Validators.max(1)]],
    wActiveLoad: [0.2, [Validators.min(0), Validators.max(1)]],
    wReliability: [0.15, [Validators.min(0), Validators.max(1)]],
    wVehicleMatch: [0.1, [Validators.min(0), Validators.max(1)]],
    offerTimeoutSeconds: [45, [Validators.required, Validators.min(5)]],
    maxOfferCascadeAttempts: [5, [Validators.required, Validators.min(1)]],
    maxAssignRadiusKm: [10, [Validators.required, Validators.min(0.5)]],
  });

  weightSum(): number {
    const v = this.form.getRawValue();
    return v.wDistance + v.wRating + v.wActiveLoad + v.wReliability + v.wVehicleMatch;
  }

  ngOnInit(): void {
    this.loadTasks();
    this.loadRiders();
    this.loadSettings();
  }

  // ── Tasks ──────────────────────────────────────────────────────────────
  loadTasks(): void {
    const params: Record<string, string | number> = {};
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.unassignedOnly) params['unassigned'] = 1;
    this.api.get<DeliveryTask[]>('/delivery', params).subscribe({
      next: (rows) => this.tasks.set(rows),
      error: (e) => this.notify.push('Could not load delivery tasks', e?.message, 'warning'),
    });
  }

  assign(t: DeliveryTask): void {
    const riderId = this.picked[t._id];
    if (!riderId) return;
    this.busy.set(t._id);
    this.api.post(`/delivery/${t._id}/assign`, { riderId }).subscribe({
      next: () => {
        this.busy.set(null);
        this.notify.push(t.riderId ? 'Reassigned' : 'Assigned', t.orderNumber, 'success');
        this.loadTasks();
        this.loadRiders();
      },
      error: (e) => {
        this.busy.set(null);
        this.notify.push('Assignment failed', e?.message, 'warning');
      },
    });
  }

  unassign(t: DeliveryTask): void {
    this.busy.set(t._id);
    this.api.post(`/delivery/${t._id}/unassign`, {}).subscribe({
      next: () => {
        this.busy.set(null);
        this.notify.push('Unassigned', t.orderNumber, 'success');
        this.loadTasks();
        this.loadRiders();
      },
      error: (e) => {
        this.busy.set(null);
        this.notify.push('Unassign failed', e?.message, 'warning');
      },
    });
  }

  // ── Riders ─────────────────────────────────────────────────────────────
  loadRiders(): void {
    this.api.get<Rider[]>('/riders').subscribe({
      next: (rows) => this.riders.set(rows),
      error: (e) => this.notify.push('Could not load riders', e?.message, 'warning'),
    });
  }

  openCreate(): void {
    this.createError.set(null);
    this.newRider = { name: '', phone: '', password: '', vehicleType: 'bike' };
    this.creating.set(true);
  }

  createRider(): void {
    if (!this.newRider.name.trim() || !this.newRider.phone.trim() || this.newRider.password.length < 6) {
      this.createError.set('Name, phone and a password of 6+ characters are required.');
      return;
    }
    this.creatingBusy.set(true);
    this.api.post<Rider>('/riders', this.newRider).subscribe({
      next: () => {
        this.creatingBusy.set(false);
        this.creating.set(false);
        this.notify.push('Rider added', this.newRider.name, 'success');
        this.loadRiders();
      },
      error: (e) => {
        this.creatingBusy.set(false);
        this.createError.set(e?.message ?? 'Could not add rider');
      },
    });
  }

  toggleActive(r: Rider): void {
    this.api.patch(`/riders/${r.id}`, { isActive: !r.isActive }).subscribe({
      next: () => {
        this.notify.push(r.isActive ? 'Rider deactivated' : 'Rider activated', r.name, 'success');
        this.loadRiders();
      },
      error: (e) => this.notify.push('Update failed', e?.message, 'warning'),
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────
  loadSettings(): void {
    this.api.get<DeliverySettings>('/delivery/settings').subscribe({
      next: (s) =>
        this.form.patchValue({
          assignmentMode: s.assignmentMode,
          serviceableCitiesText: (s.serviceableCities ?? []).join(', '),
          thirdPartyFallbackEnabled: s.thirdPartyFallbackEnabled !== false,
          wDistance: s.criteriaWeights?.distance ?? 0.35,
          wRating: s.criteriaWeights?.rating ?? 0.2,
          wActiveLoad: s.criteriaWeights?.activeLoad ?? 0.2,
          wReliability: s.criteriaWeights?.reliability ?? 0.15,
          wVehicleMatch: s.criteriaWeights?.vehicleMatch ?? 0.1,
          offerTimeoutSeconds: s.offerTimeoutSeconds ?? 45,
          maxOfferCascadeAttempts: s.maxOfferCascadeAttempts ?? 5,
          maxAssignRadiusKm: s.maxAssignRadiusKm ?? 10,
        }),
      error: (e) => this.notify.push('Could not load delivery settings', e?.message, 'warning'),
    });
  }

  saveSettings(): void {
    if (this.form.invalid) return;
    this.savingSettings.set(true);
    const v = this.form.getRawValue();
    const body = {
      assignmentMode: v.assignmentMode,
      serviceableCities: v.serviceableCitiesText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      thirdPartyFallbackEnabled: v.thirdPartyFallbackEnabled,
      criteriaWeights: {
        distance: v.wDistance,
        rating: v.wRating,
        activeLoad: v.wActiveLoad,
        reliability: v.wReliability,
        vehicleMatch: v.wVehicleMatch,
      },
      offerTimeoutSeconds: v.offerTimeoutSeconds,
      maxOfferCascadeAttempts: v.maxOfferCascadeAttempts,
      maxAssignRadiusKm: v.maxAssignRadiusKm,
    };
    this.api.patch('/delivery/settings', body).subscribe({
      next: () => {
        this.savingSettings.set(false);
        this.notify.push('Delivery settings saved', undefined, 'success');
      },
      error: (e) => {
        this.savingSettings.set(false);
        this.notify.push('Save failed', e?.message, 'warning');
      },
    });
  }
}
