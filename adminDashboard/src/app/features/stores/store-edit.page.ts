import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

/** Super-admin / vendor: full storefront + business (KYC) profile — the customer store page renders from this. */
@Component({
  selector: 'app-store-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
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

      <div class="card" formGroupName="address">
        <h3>Registered address</h3>
        <label class="label">Address line</label><input class="input" formControlName="line1" />
        <div class="three">
          <div><label class="label">City</label><input class="input" formControlName="city" /></div>
          <div><label class="label">State</label><input class="input" formControlName="state" /></div>
          <div><label class="label">Pincode</label><input class="input" formControlName="pincode" /></div>
        </div>
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
  uploading = signal(false);
  covers = signal<string[]>([]);
  mine = signal(false);      // vendor editing their OWN store (route /my-store)
  noStore = signal(false);   // vendor has no store yet → show create prompt

  form = this.fb.nonNullable.group({
    name: [''], vendorType: ['generic'], establishedYear: [null as number | null], description: [''],
    logo: [''], legalName: [''], gstin: [''], pan: [''], website: [''], contactEmail: [''], contactPhone: [''],
    address: this.fb.group({ line1: [''], city: [''], state: [''], pincode: [''] }),
    social: this.fb.group({ instagram: [''], facebook: [''], twitter: [''] }),
  });

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
    this.form.patchValue({
      name: (s['name'] as string) ?? '', vendorType: (s['vendorType'] as string) ?? 'generic',
      establishedYear: (s['establishedYear'] as number) ?? null, description: (s['description'] as string) ?? '',
      logo: (s['logo'] as string) ?? '', legalName: (s['legalName'] as string) ?? '',
      gstin: (s['gstin'] as string) ?? '', pan: (s['pan'] as string) ?? '', website: (s['website'] as string) ?? '',
      contactEmail: (s['contactEmail'] as string) ?? '', contactPhone: (s['contactPhone'] as string) ?? '',
      address: (s['address'] as never) ?? {}, social: (s['social'] as never) ?? {},
    });
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
