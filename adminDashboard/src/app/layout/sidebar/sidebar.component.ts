import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthFacade } from '../../store/auth/auth.facade';

/** Renders the sidebar from GET /me/navigation (server-generated, permission-filtered). */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [AsyncPipe, RouterLink, RouterLinkActive],
  template: `
    <nav class="sidebar">
      <a class="brand" routerLink="/">
        <span class="dot"></span>
        Marketplace
      </a>
      @for (section of nav$ | async; track section.section) {
        <div class="section">
          <div class="section-title">{{ section.section }}</div>
          @for (item of section.items; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active">{{ item.label }}</a>
          }
        </div>
      }
    </nav>
  `,
  styles: [
    `
      .sidebar {
        width: var(--sidebar-w);
        flex-shrink: 0;
        position: sticky;
        top: 0;
        align-self: flex-start;
        height: 100vh;
        background: var(--sidebar-bg);
        color: var(--sidebar-text);
        padding: 20px 14px;
        overflow-y: auto;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        font-size: 1.05rem;
        color: #fff;
        padding: 4px 8px 18px;
      }
      .dot {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        background: var(--brand-gradient);
        box-shadow: var(--shadow-sm);
      }
      .section-title {
        color: #8a8cb8;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 16px 8px 6px;
      }
      a {
        display: block;
        padding: 9px 12px;
        margin: 2px 0;
        border-radius: var(--radius-sm);
        color: var(--sidebar-text);
        font-size: 0.92rem;
        font-weight: 500;
        transition: background 0.15s, color 0.15s;
      }
      a:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      a.active {
        background: var(--sidebar-active);
        color: #fff;
        box-shadow: var(--shadow);
      }
    `,
  ],
})
export class SidebarComponent {
  private readonly auth = inject(AuthFacade);
  readonly nav$ = this.auth.nav$;
}
