import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

interface Store {
  _id: string;
  name: string;
  slug: string;
  vendorType: string;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  description?: string;
}

@Component({
  selector: 'app-stores',
  standalone: true,
  imports: [HasPermissionDirective, RouterLink],
  template: `
    <header class="head">
      <div><h1>Vendors</h1><p class="muted">Approve and manage seller stores</p></div>
      <a class="btn btn-primary btn-sm" routerLink="/vendors/new" *hasPermission="'store:approve'">＋ Add vendor</a>
    </header>

    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>Store</th><th>Type</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (s of stores(); track s._id) {
            <tr>
              <td><b>{{ s.name }}</b><div class="muted small">{{ s.description }}</div></td>
              <td>{{ s.vendorType }}</td>
              <td>
                <span class="badge" [class.badge-success]="s.status === 'approved'"
                      [class.badge-warning]="s.status === 'pending'"
                      [class.badge-danger]="s.status === 'rejected' || s.status === 'suspended'">{{ s.status }}</span>
              </td>
              <td class="actions">
                <a class="btn btn-ghost btn-sm" [routerLink]="['/stores', s._id]">Details</a>
                <ng-container *hasPermission="'store:approve'">
                  @if (s.status !== 'approved') { <button class="btn btn-primary btn-sm" (click)="setStatus(s, 'approved')">Approve</button> }
                  @if (s.status === 'approved') { <button class="btn btn-ghost btn-sm" (click)="setStatus(s, 'suspended')">Suspend</button> }
                  @if (s.status === 'pending') { <button class="btn btn-ghost btn-sm" (click)="setStatus(s, 'rejected')">Reject</button> }
                </ng-container>
              </td>
            </tr>
          } @empty { <tr><td colspan="4" class="pad muted">No vendors yet.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .small { font-size: 0.8rem; }
      .pad { padding: 16px; }
      .actions { text-align: right; white-space: nowrap; display: flex; gap: 8px; justify-content: flex-end; }
    `,
  ],
})
export class StoresPage implements OnInit {
  private readonly api = inject(ApiService);
  stores = signal<Store[]>([]);

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.get<Store[]>('/stores').subscribe({ next: (s) => this.stores.set(s) });
  }

  setStatus(s: Store, status: 'approved' | 'rejected' | 'suspended'): void {
    const call =
      status === 'approved'
        ? this.api.patch(`/stores/${s._id}/approve`, {})
        : this.api.patch(`/stores/${s._id}/status`, { status });
    call.subscribe({ next: () => this.load() });
  }
}
