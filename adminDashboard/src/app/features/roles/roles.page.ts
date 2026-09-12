import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { matchesSearch } from '../../shared/search';

interface User { _id: string; name: string; email: string; role: string; }
interface PermInfo { role: string; wildcard: boolean; effective: string[]; all: string[]; }

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="head"><h1>Roles & Permissions</h1><p class="muted">Grant granular access per user</p></header>
    <div class="cols">
      <div class="card users">
        <h3>Users</h3>
        <input class="input search" [(ngModel)]="q" placeholder="Search users…" />
        @for (u of filteredUsers(); track u._id) {
          <button class="urow" [class.sel]="selected()?._id === u._id" (click)="select(u)">
            <div>{{ u.name }}</div>
            <div class="muted small">{{ u.role }}</div>
          </button>
        }
      </div>

      <div class="card editor">
        @if (!selected()) {
          <p class="muted">Select a user to edit permissions.</p>
        } @else if (info()) {
          @if (info()!.wildcard) {
            <h3>{{ selected()?.name }}</h3>
            <p class="badge badge-info">super_admin — full access (all permissions)</p>
          } @else {
            <div class="ehead">
              <h3>{{ selected()?.name }} <span class="muted small">({{ info()!.role }})</span></h3>
              <button class="btn btn-primary btn-sm" (click)="save()">Save permissions</button>
            </div>
            <p class="muted small">Checked = user has it. Changes apply on their next login.</p>
            @for (group of grouped(); track group.module) {
              <div class="group">
                <div class="gname">{{ group.module }}</div>
                <div class="perms">
                  @for (p of group.perms; track p) {
                    <label class="perm"><input type="checkbox" [checked]="checked().has(p)" (change)="toggle(p)" /> {{ action(p) }}</label>
                  }
                </div>
              </div>
            }
          }
        } @else {
          <p class="muted">Loading…</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .urow { display: block; width: 100%; text-align: left; padding: 10px; border: none; background: none; border-radius: 8px; cursor: pointer; }
      .urow:hover { background: var(--surface-2); } .urow.sel { background: var(--brand-50); }
      .users .search { width: 100%; margin-bottom: 10px; }
      .small { font-size: 0.8rem; }
      .ehead { display: flex; justify-content: space-between; align-items: center; }
      .group { margin-top: 16px; } .gname { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.04em; margin-bottom: 6px; }
      .perms { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
      .perm { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
    `,
  ],
})
export class RolesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  users = signal<User[]>([]);
  selected = signal<User | null>(null);
  info = signal<PermInfo | null>(null);
  checked = signal<Set<string>>(new Set());
  q = '';

  filteredUsers(): User[] {
    return this.users().filter((u) => matchesSearch(this.q, u.name, u.email, u.role));
  }

  grouped = computed(() => {
    const all = this.info()?.all ?? [];
    const map = new Map<string, string[]>();
    for (const p of all) {
      const mod = p.split(':')[0] ?? 'other';
      map.set(mod, [...(map.get(mod) ?? []), p]);
    }
    return [...map.entries()].map(([module, perms]) => ({ module, perms }));
  });

  ngOnInit(): void {
    this.api.get<User[]>('/users').subscribe({ next: (u) => this.users.set(u) });
  }

  select(u: User): void {
    this.selected.set(u);
    this.info.set(null);
    this.api.get<PermInfo>(`/users/${u._id}/permissions`).subscribe({
      next: (inf) => { this.info.set(inf); this.checked.set(new Set(inf.effective)); },
    });
  }

  action(p: string): string { return p.split(':')[1] ?? p; }
  toggle(p: string): void {
    const s = new Set(this.checked());
    s.has(p) ? s.delete(p) : s.add(p);
    this.checked.set(s);
  }

  save(): void {
    const u = this.selected();
    if (!u) return;
    this.api.patch(`/users/${u._id}/permissions`, { permissions: [...this.checked()] }).subscribe({
      next: () => this.notify.push('Permissions saved', `${u.name} — applies next login`, 'success'),
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }
}
