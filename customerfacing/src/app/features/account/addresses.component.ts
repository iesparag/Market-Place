import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { LocationPickerComponent, type PickedLocation } from '../../shared/location-picker.component';

interface Address { _id: string; label: string; line1: string; city: string; pincode?: string; phone?: string; isDefault?: boolean; }

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [ReactiveFormsModule, LocationPickerComponent],
  template: `
    <h1>Addresses</h1>
    <div class="cols">
      <div>
        @for (a of items(); track a._id) {
          <div class="card addr">
            <div><b>{{ a.label }}</b> @if (a.isDefault) { <span class="badge badge-info">default</span> }
              <div class="muted">{{ a.line1 }}, {{ a.city }} {{ a.pincode }}</div>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="remove(a._id)">Delete</button>
          </div>
        } @empty { <div class="card muted">No saved addresses.</div> }
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="add()">
        <h3>Add address</h3>
        <label class="label">Label</label><input class="input" formControlName="label" />
        <app-location-picker (picked)="onPicked($event)" />
        <label class="label">Address</label><input class="input" formControlName="line1" />
        <div class="two">
          <div><label class="label">City</label><input class="input" formControlName="city" /></div>
          <div><label class="label">Pincode</label><input class="input" formControlName="pincode" /></div>
        </div>
        <label class="chk"><input type="checkbox" formControlName="isDefault" /> Set as default</label>
        <button class="btn btn-primary" [disabled]="form.invalid">Add</button>
      </form>
    </div>
  `,
  styles: [
    `
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; margin-top: 16px; }
      @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
      .addr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .label { margin-top: 10px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .chk { display: block; margin: 12px 0; } .btn-primary { margin-top: 6px; }
    `,
  ],
})
export class AddressesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  items = signal<Address[]>([]);

  form = this.fb.nonNullable.group({
    label: ['Home', Validators.required],
    line1: ['', Validators.required],
    city: ['', Validators.required],
    pincode: [''],
    isDefault: [false],
  });

  onPicked(loc: PickedLocation): void {
    this.form.patchValue({ line1: loc.line1, city: loc.city, pincode: loc.pincode });
  }

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Address[]>('/addresses').subscribe({ next: (a) => this.items.set(a) }); }
  add(): void {
    if (this.form.invalid) return;
    this.api.post('/addresses', this.form.getRawValue()).subscribe({ next: () => { this.form.reset({ label: 'Home', isDefault: false }); this.load(); } });
  }
  remove(id: string): void { this.api.delete(`/addresses/${id}`).subscribe({ next: () => this.load() }); }
}
