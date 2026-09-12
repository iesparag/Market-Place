import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { downloadCsv } from '../../shared/csv';
import { matchesSearch } from '../../shared/search';

interface User { _id: string; name: string; email: string; role: string; status: string; }

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [HasPermissionDirective, FormsModule],
  template: `
    <header class="head">
      <div><h1>Users</h1><p class="muted">All platform accounts</p></div>
      <button class="btn btn-sm" (click)="exportCsv()">⬇ CSV</button>
    </header>
    <div class="toolbar">
      <input class="input search" [(ngModel)]="q" placeholder="Search by name, email or role…" />
      <span class="count muted">{{ filtered().length }} of {{ users().length }}</span>
    </div>
    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (u of filtered(); track u._id) {
            <tr>
              <td>{{ u.name }}</td>
              <td class="muted">{{ u.email }}</td>
              <td><span class="badge" [class.badge-info]="u.role === 'super_admin'">{{ u.role }}</span></td>
              <td><span class="badge" [class.badge-success]="u.status === 'active'">{{ u.status }}</span></td>
              <td class="actions" *hasPermission="'user:update'">
                <select class="input sel" [value]="u.role" (change)="setRole(u, $event)">
                  <option value="customer">customer</option>
                  <option value="vendor">vendor</option>
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
              </td>
            </tr>
          } @empty { <tr><td colspan="5" class="pad muted">{{ q ? 'No users match your search.' : 'No users.' }}</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .search { flex: 1; max-width: 360px; } .count { white-space: nowrap; }
      .pad { padding: 16px; } .actions { text-align: right; } .sel { max-width: 150px; }
    `,
  ],
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  users = signal<User[]>([]);
  q = '';

  filtered(): User[] {
    return this.users().filter((u) => matchesSearch(this.q, u.name, u.email, u.role));
  }

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.get<User[]>('/users').subscribe({ next: (u) => this.users.set(u) });
  }

  setRole(u: User, e: Event): void {
    const role = (e.target as HTMLSelectElement).value;
    this.api.patch(`/users/${u._id}/role`, { role }).subscribe({
      next: () => this.notify.push('Role updated', `${u.name} → ${role}`, 'success'),
      error: (err) => this.notify.push('Failed', err?.message, 'warning'),
    });
  }

  exportCsv(): void {
    downloadCsv('users.csv', this.users(), [
      { label: 'Name', value: (u) => u.name },
      { label: 'Email', value: (u) => u.email },
      { label: 'Role', value: (u) => u.role },
      { label: 'Status', value: (u) => u.status },
    ]);
  }
}
