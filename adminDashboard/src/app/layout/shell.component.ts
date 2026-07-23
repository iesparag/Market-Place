import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { AuthFacade } from '../store/auth/auth.facade';
import { NotificationService } from '../core/services/notification.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [AsyncPipe, RouterOutlet, SidebarComponent],
  template: `
    <div class="layout">
      <app-sidebar />
      <div class="main">
        <header class="topbar">
          <div class="who">
            <div class="avatar">{{ (auth.user$ | async)?.name?.charAt(0) ?? '?' }}</div>
            <div>
              <div class="name">{{ (auth.user$ | async)?.name }}</div>
              <div class="role muted">{{ (auth.user$ | async)?.role }}</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" (click)="auth.logout()">Logout</button>
        </header>
        <main class="content"><router-outlet /></main>
      </div>

      <div class="toasts">
        @for (t of notify.toasts(); track t.id) {
          <div class="toast" [class.success]="t.kind === 'success'" [class.warning]="t.kind === 'warning'"
               (click)="notify.dismiss(t.id)">
            <b>{{ t.title }}</b>
            @if (t.body) { <div class="muted">{{ t.body }}</div> }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .layout {
        display: flex;
        min-height: 100vh;
      }
      .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 24px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      .who {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 700;
        background: var(--brand-gradient);
      }
      .name {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .role {
        font-size: 0.75rem;
        text-transform: capitalize;
      }
      .content {
        padding: 28px 24px;
        flex: 1;
      }
      .toasts {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: grid;
        gap: 10px;
        z-index: 50;
      }
      .toast {
        background: var(--surface);
        border: 1px solid var(--border);
        border-left: 4px solid var(--brand-600);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        padding: 12px 16px;
        min-width: 240px;
        cursor: pointer;
      }
      .toast.success { border-left-color: var(--success); }
      .toast.warning { border-left-color: var(--warning); }
    `,
  ],
})
export class ShellComponent {
  readonly auth = inject(AuthFacade);
  readonly notify = inject(NotificationService);
}
