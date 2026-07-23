import { Component, Input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CatNode } from '../core/services/catalog.service';

/**
 * Myntra-style category mega-menu. Departments in a horizontal bar; hovering a
 * department with sub-categories drops a full-width panel with columns.
 * Reused for the GLOBAL nav (header) and the STORE-scoped nav (store page) —
 * just pass a different `tree` and `routerPath`.
 */
@Component({
  selector: 'app-category-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="catnav" [class.dark]="dark" (mouseleave)="active.set(null)">
      <div class="bar">
        @for (d of tree; track d.slug) {
          <div class="dept" (mouseenter)="active.set(d.slug)">
            <a class="deptlink" [class.on]="active() === d.slug"
               [routerLink]="routerPath" [queryParams]="{ category: slugs(d) }" (click)="active.set(null)">
              {{ d.name }}@if (d.children.length) { <span class="car">▾</span> }
            </a>
          </div>
        } @empty { <span class="none">No categories yet</span> }
      </div>

      @if (panel(); as p) {
        <div class="mega" (mouseenter)="active.set(p.slug)">
          <div class="megainner">
            <a class="viewall" [routerLink]="routerPath" [queryParams]="{ category: slugs(p) }" (click)="active.set(null)">
              View all {{ p.name }} →
            </a>
            <div class="cols">
              @for (col of p.children; track col.slug) {
                <div class="col">
                  <a class="colh" [routerLink]="routerPath" [queryParams]="{ category: slugs(col) }" (click)="active.set(null)">{{ col.name }}</a>
                  @for (gc of col.children; track gc.slug) {
                    <a class="colitem" [routerLink]="routerPath" [queryParams]="{ category: slugs(gc) }" (click)="active.set(null)">{{ gc.name }}</a>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      }
    </nav>
  `,
  styles: [
    `
      .catnav { position: relative; }
      .bar { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
      .bar::-webkit-scrollbar { display: none; }
      .deptlink { display: inline-flex; align-items: center; gap: 5px; padding: 12px 14px; font-size: 0.9rem; font-weight: 600; white-space: nowrap; color: var(--text); border-bottom: 2px solid transparent; }
      .car { font-size: 0.6rem; opacity: 0.7; }
      .deptlink:hover, .deptlink.on { color: var(--brand-700); border-bottom-color: var(--brand-600); }
      .none { padding: 12px 14px; font-size: 0.85rem; opacity: 0.6; }

      /* dark theme (header strip) */
      .dark .deptlink { color: #dcdce1; }
      .dark .deptlink:hover, .dark .deptlink.on { color: #fff; border-bottom-color: var(--brand-600); }

      /* full-width drop panel */
      .mega { position: absolute; left: 0; right: 0; top: 100%; background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); border-radius: 0 0 14px 14px; z-index: 45; border-top: 3px solid var(--brand-600); }
      .megainner { padding: 22px 26px; max-height: 68vh; overflow-y: auto; }
      .viewall { display: inline-block; font-size: 0.82rem; font-weight: 700; color: var(--brand-700); margin-bottom: 14px; }
      .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px 28px; }
      .col { display: flex; flex-direction: column; padding-bottom: 12px; }
      .colh { font-weight: 800; font-size: 0.9rem; color: var(--brand-700); padding: 6px 0; }
      .colh:hover { text-decoration: underline; }
      .colitem { font-size: 0.86rem; color: var(--text-muted); padding: 5px 0; }
      .colitem:hover { color: var(--brand-700); }
    `,
  ],
})
export class CategoryNavComponent {
  @Input({ required: true }) tree: CatNode[] = [];
  /** Base route the category links point to, e.g. ['/catalog'] or ['/store', slug]. */
  @Input() routerPath: unknown[] = ['/catalog'];
  /** true = light-on-dark styling for the dark header strip. */
  @Input() dark = false;

  active = signal<string | null>(null);
  panel = (): CatNode | null => this.tree.find((d) => d.slug === this.active() && d.children.length > 0) ?? null;

  /** A node's slug + every descendant slug — so clicking a parent selects its whole subtree
   *  (products live in the leaves), while clicking a leaf selects just itself. */
  private allSlugs(n: CatNode): string[] {
    return [n.slug, ...n.children.flatMap((c) => this.allSlugs(c))];
  }
  slugs(n: CatNode): string {
    return this.allSlugs(n).join(',');
  }
}
