import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { PlacesAutocompleteComponent, type PickedPlace } from '../../shared/places-autocomplete.component';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Super-admin / vendor: full storefront + business (KYC) profile — the customer store page renders from this. */
@Component({
  selector: 'app-store-edit',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink, PlacesAutocompleteComponent],
  template: `
    <header class="head">
      <div>
        <h1>{{ mine() ? 'My Store' : (form.controls.name.value || 'Store') }}</h1>
        <p class="muted">{{ mine() ? 'Set up your storefront — customers see this on your store page' : 'Storefront & business profile' }}</p>
      </div>
      <a class="btn btn-ghost" [routerLink]="mine() ? '/' : '/stores'">← Back</a>
    </header>

    @if (mine() && noStore()) {
      <div class="card empty" [formGroup]="form">
        <h3>You don't have a store yet</h3>
        <p class="muted">Give your store a name to get started — you can add branding & business details right after.</p>
        <label class="label">Store name</label>
        <input class="input" formControlName="name" placeholder="e.g. Kapda Junction" />
        <div class="actions"><button class="btn btn-primary" type="button" [disabled]="saving()" (click)="createStore()">{{ saving() ? 'Creating…' : 'Create my store' }}</button></div>
      </div>
    } @else {
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="card">
        <h3>Branding</h3>
        <div class="two">
          <div>
            <label class="label">Logo</label>
            <div class="imgs">
              @if (form.controls.logo.value) { <div class="thumb sq"><img [src]="form.controls.logo.value" alt="" /><button type="button" (click)="form.controls.logo.setValue('')">✕</button></div> }
              <label class="upload">{{ uploading() ? '…' : '+ Logo' }}<input type="file" accept="image/*" (change)="onFile($event, 'logo')" hidden /></label>
            </div>
          </div>
          <div>
            <label class="label">Cover images (carousel)</label>
            <div class="imgs">
              @for (url of covers(); track url) { <div class="thumb"><img [src]="url" alt="" /><button type="button" (click)="removeCover(url)">✕</button></div> }
              <label class="upload">{{ uploading() ? '…' : '+ Cover' }}<input type="file" accept="image/*" (change)="onFile($event, 'cover')" hidden /></label>
            </div>
          </div>
        </div>
        <label class="label">Store name</label><input class="input" formControlName="name" />
        <div class="two">
          <div><label class="label">Vendor type</label>
            <select class="input" formControlName="vendorType"><option>food</option><option>grocery</option><option>fashion</option><option>generic</option><option>integration</option></select>
          </div>
          <div><label class="label">Established year</label><input class="input" type="number" formControlName="establishedYear" /></div>
        </div>
        <label class="label">Description (about the store)</label>
        <textarea class="input" rows="3" formControlName="description"></textarea>
      </div>

      <div class="card">
        <h3>Business details <span class="muted small">(as per Indian law)</span></h3>
        <div class="two">
          <div><label class="label">Legal / registered name</label><input class="input" formControlName="legalName" /></div>
          <div><label class="label">GSTIN</label><input class="input" formControlName="gstin" placeholder="22AAAAA0000A1Z5" /></div>
        </div>
        <div class="two">
          <div><label class="label">PAN</label><input class="input" formControlName="pan" placeholder="AAAAA0000A" /></div>
          <div><label class="label">Website</label><input class="input" formControlName="website" placeholder="https://" /></div>
        </div>
        <div class="two">
          <div><label class="label">Contact email</label><input class="input" formControlName="contactEmail" /></div>
          <div><label class="label">Contact phone</label><input class="input" formControlName="contactPhone" /></div>
        </div>
      </div>

      <div class="card">
        <h3>Availability <span class="muted small">— drives the customer app's "Now" tab</span></h3>
        <label class="label">Status</label>
        <select class="input" formControlName="availabilityStatus">
          <option value="auto">Auto (follow the weekly hours below)</option>
          <option value="open">Force open now</option>
          <option value="closed">Force closed</option>
          <option value="holiday">On holiday today</option>
        </select>
        <p class="muted small">"Auto" is what you want almost always — the two "Force" options and "On holiday" override the schedule below until you change this back.</p>

        <label class="label">Weekly hours</label>
        <table class="hours" formArrayName="operatingHours">
          <thead><tr><th>Day</th><th>Open</th><th>Close</th><th>Closed all day</th></tr></thead>
          <tbody>
            @for (day of operatingHours.controls; track $index) {
              <tr [formGroupName]="$index">
                <td>{{ dayNames[$index] }}</td>
                <td><input class="input" type="time" formControlName="open" [disabled]="day.controls.closed.value" /></td>
                <td><input class="input" type="time" formControlName="close" [disabled]="day.controls.closed.value" /></td>
                <td><input type="checkbox" formControlName="closed" /></td>
              </tr>
            }
          </tbody>
        </table>

        <label class="label">Holidays <span class="muted small">(specific dates you're shut, regardless of weekly hours)</span></label>
        <div class="holidays">
          @for (h of holidays.controls; track $index) {
            <span class="chip">{{ h.value }} <button type="button" (click)="removeHoliday($index)">✕</button></span>
          }
        </div>
        <div class="add-holiday">
          <input class="input" type="date" [(ngModel)]="newHoliday" [ngModelOptions]="{ standalone: true }" />
          <button type="button" class="btn btn-ghost" (click)="addHoliday()">+ Add holiday</button>
        </div>
      </div>

      <div class="card" formGroupName="bankAccount">
        <h3>Payout account <span class="muted small">(where settlements are sent)</span></h3>
        <div class="two">
          <div><label class="label">Account holder name</label><input class="input" formControlName="accountName" /></div>
          <div><label class="label">UPI ID</label><input class="input" formControlName="upiId" placeholder="name@upi" /></div>
        </div>
        <div class="two">
          <div><label class="label">Bank account number</label><input class="input" formControlName="accountNumber" /></div>
          <div><label class="label">IFSC</label><input class="input" formControlName="ifsc" placeholder="HDFC0001234" /></div>
        </div>
        <p class="muted small">A UPI ID alone is enough for small settlements; add the bank account for larger ones.</p>
      </div>

      <div class="card" formGroupName="address">
        <h3>Registered address</h3>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="locating()" (click)="useCurrentLocation()">
          {{ locating() ? 'Locating…' : '📍 Use current location' }}
        </button>
        <label class="label">Search address</label>
        <app-places-autocomplete (picked)="onAddressPicked($event)" />
        <label class="label">Address line</label><input class="input" formControlName="line1" />
        <div class="three">
          <div><label class="label">City</label><input class="input" formControlName="city" /></div>
          <div><label class="label">State</label><input class="input" formControlName="state" /></div>
          <div><label class="label">Pincode</label><input class="input" formControlName="pincode" placeholder="e.g. 380061" /></div>
        </div>
        @if (form.controls.address.controls.lat.value) {
          <p class="muted small">📍 Pin confirmed — this store will appear in nearby-vendor search. Re-run the search above if you change the address text.</p>
        }
      </div>

      <div class="card" formGroupName="social">
        <h3>Social links</h3>
        <div class="three">
          <div><label class="label">Instagram</label><input class="input" formControlName="instagram" /></div>
          <div><label class="label">Facebook</label><input class="input" formControlName="facebook" /></div>
          <div><label class="label">Twitter/X</label><input class="input" formControlName="twitter" /></div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save profile' }}</button>
      </div>
    </form>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .card { margin-bottom: 18px; } .card h3 { margin-bottom: 10px; }
      .small { font-size: 0.8rem; font-weight: 400; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; }
      .imgs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
      .thumb { position: relative; width: 120px; height: 68px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); }
      .thumb.sq { width: 68px; }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .thumb button { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 11px; }
      .upload { width: 120px; height: 68px; border: 1px dashed var(--border); border-radius: var(--radius-sm); display: grid; place-items: center; cursor: pointer; color: var(--text-muted); font-size: 0.8rem; }
      .actions { position: sticky; bottom: 0; padding: 12px 0; }
      .hours { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 0.86rem; }
      .hours th { text-align: left; padding: 6px 8px; color: var(--text-muted); font-weight: 600; }
      .hours td { padding: 4px 8px; }
      .hours input[type='time'] { width: 110px; }
      .holidays { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
      .chip { background: var(--bg-subtle, #f3f4f6); border-radius: 999px; padding: 4px 10px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px; }
      .chip button { border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 0.8rem; }
      .add-holiday { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
      .add-holiday .input { width: 180px; }
    `,
  ],
})
export class StoreEditPage implements OnInit {
  @Input() id = '';
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  saving = signal(false);
  locating = signal(false);
  uploading = signal(false);
  covers = signal<string[]>([]);
  mine = signal(false);      // vendor editing their OWN store (route /my-store)
  noStore = signal(false);   // vendor has no store yet → show create prompt

  dayNames = DAY_NAMES;
  newHoliday = '';

  form = this.fb.nonNullable.group({
    name: [''], vendorType: ['generic'], establishedYear: [null as number | null], description: [''],
    logo: [''], legalName: [''], gstin: [''], pan: [''], website: [''], contactEmail: [''], contactPhone: [''],
    bankAccount: this.fb.group({ accountName: [''], accountNumber: [''], ifsc: [''], upiId: [''] }),
    address: this.fb.group({
      line1: [''], city: [''], state: [''], pincode: [''],
      // Resolved via Places Autocomplete+Details — drives Store.location for the
      // $geoNear nearby-vendor query. See onAddressPicked() below.
      lat: [null as number | null], lng: [null as number | null],
    }),
    social: this.fb.group({ instagram: [''], facebook: [''], twitter: [''] }),
    availabilityStatus: ['auto'],
    operatingHours: this.fb.array(
      DAY_NAMES.map((_, day) =>
        this.fb.nonNullable.group({ day: [day], open: ['09:00'], close: ['21:00'], closed: [false] }),
      ),
    ),
    holidays: this.fb.array<string>([]),
  });

  get operatingHours() { return this.form.controls.operatingHours; }
  get holidays() { return this.form.controls.holidays; }

  addHoliday(): void {
    if (!this.newHoliday || this.holidays.value.includes(this.newHoliday)) return;
    this.holidays.push(this.fb.nonNullable.control(this.newHoliday));
    this.newHoliday = '';
  }
  removeHoliday(i: number): void { this.holidays.removeAt(i); }

  ngOnInit(): void {
    this.mine.set(Boolean(this.route.snapshot.data['mine']));
    if (this.mine()) {
      // Vendor self-service: resolve their own store first.
      this.api.get<Record<string, unknown> | null>('/stores/mine').subscribe({
        next: (s) => {
          if (!s || !s['_id']) { this.noStore.set(true); return; }
          this.id = String(s['_id']);
          this.loadInto(s);
        },
        error: () => this.noStore.set(true),
      });
      return;
    }
    this.api.get<Record<string, unknown>>(`/stores/${this.id}`).subscribe({ next: (s) => this.loadInto(s) });
  }

  private loadInto(s: Record<string, unknown>): void {
    this.covers.set((s['coverImages'] as string[]) ?? []);
    // location.coordinates is GeoJSON [lng, lat]; surface it onto the address group so
    // the "pin confirmed" hint reflects reality for stores geocoded before this screen existed.
    const loc = s['location'] as { coordinates?: [number, number] } | undefined;
    const existingAddress = (s['address'] as Record<string, unknown>) ?? {};
    this.form.patchValue({
      name: (s['name'] as string) ?? '', vendorType: (s['vendorType'] as string) ?? 'generic',
      establishedYear: (s['establishedYear'] as number) ?? null, description: (s['description'] as string) ?? '',
      logo: (s['logo'] as string) ?? '', legalName: (s['legalName'] as string) ?? '',
      gstin: (s['gstin'] as string) ?? '', pan: (s['pan'] as string) ?? '', website: (s['website'] as string) ?? '',
      contactEmail: (s['contactEmail'] as string) ?? '', contactPhone: (s['contactPhone'] as string) ?? '',
      bankAccount: (s['bankAccount'] as never) ?? {},
      address: {
        ...existingAddress,
        lat: loc?.coordinates?.[1] ?? null,
        lng: loc?.coordinates?.[0] ?? null,
      } as never,
      social: (s['social'] as never) ?? {},
      availabilityStatus: (s['availabilityStatus'] as string) ?? 'auto',
    });
    const hours = s['operatingHours'] as { day: number; open: string; close: string; closed: boolean }[] | undefined;
    if (hours?.length === 7) {
      for (const h of [...hours].sort((a, b) => a.day - b.day)) {
        this.operatingHours.at(h.day)?.patchValue({ open: h.open, close: h.close, closed: h.closed });
      }
    }
    this.holidays.clear();
    for (const h of (s['holidays'] as string[] | undefined) ?? []) this.holidays.push(this.fb.nonNullable.control(h));
  }

  /** Fills the still-editable address fields and the hidden lat/lng controls — see
   * stores.service.ts's updateProfile(), which turns address.lat/lng into Store.location. */
  onAddressPicked(p: PickedPlace): void {
    this.form.controls.address.patchValue({ line1: p.line1, city: p.city, state: p.state ?? '', pincode: p.pincode, lat: p.lat, lng: p.lng });
  }

  /** Browser GPS → backend's `/geocode/reverse` → fills the address fields directly,
   * same mechanics as picking a Places search result. */
  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.notify.push('Not supported', 'Your browser can\'t access location — please search for your address instead', 'warning');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.api
          .get<{ line1?: string; city?: string; state?: string; pincode?: string; lat: number; lng: number } | null>(
            '/geocode/reverse',
            { lat: latitude, lng: longitude },
          )
          .subscribe({
            next: (hit) => {
              this.locating.set(false);
              if (!hit) { this.notify.push('No address found', 'Please search for your address instead', 'warning'); return; }
              this.form.controls.address.patchValue({
                line1: hit.line1 ?? '', city: hit.city ?? '', state: hit.state ?? '', pincode: hit.pincode ?? '',
                lat: hit.lat, lng: hit.lng,
              });
            },
            error: () => { this.locating.set(false); this.notify.push('Could not detect your location', 'Please search for your address instead', 'warning'); },
          });
      },
      () => {
        this.locating.set(false);
        this.notify.push('Location access needed', 'Please allow location access, or search for your address instead', 'warning');
      },
    );
  }

  onFile(e: Event, kind: 'logo' | 'cover'): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.upload<{ url: string }>('/media/upload', file).subscribe({
      next: (r) => {
        if (kind === 'logo') this.form.controls.logo.setValue(r.url);
        else this.covers.update((c) => [...c, r.url]);
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }
  removeCover(url: string): void { this.covers.update((c) => c.filter((u) => u !== url)); }

  /** Empty-state (vendor with no store yet): create a minimal store, then reveal the full profile form. */
  createStore(): void {
    const name = this.form.controls.name.value.trim();
    if (!name) { this.notify.push('Name required', 'Enter a store name', 'warning'); return; }
    this.saving.set(true);
    this.api.post<Record<string, unknown>>('/stores', { name }).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.id = String(s['_id']);
        this.noStore.set(false);
        this.loadInto(s);
        this.notify.push('Store created', 'Now add your branding & business details', 'success');
      },
      error: (err) => { this.saving.set(false); this.notify.push('Create failed', err?.message, 'warning'); },
    });
  }

  save(): void {
    this.saving.set(true);
    this.api.patch(`/stores/${this.id}`, { ...this.form.getRawValue(), coverImages: this.covers() }).subscribe({
      next: () => { this.saving.set(false); this.notify.push('Saved', 'Store profile updated', 'success'); },
      error: (err) => { this.saving.set(false); this.notify.push('Save failed', err?.message, 'warning'); },
    });
  }
}
