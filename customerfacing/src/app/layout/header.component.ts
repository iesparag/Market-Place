import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CartFacade } from '../store/cart/cart.facade';
import { AuthService } from '../core/services/auth.service';
import { CatalogService, type CatNode, type Suggestion } from '../core/services/catalog.service';
import { NotificationsService, type Notif } from '../core/services/notifications.service';
import { WishlistService } from '../core/services/wishlist.service';
import { CategoryNavComponent } from '../shared/category-nav.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, RouterLink, CategoryNavComponent],
  template: `
    <header>
      <div class="topbar">
        <div class="hbar">
          <a routerLink="/" class="brand"><span class="dot">M</span> Marketplace</a>

          <form class="search" (submit)="doSearch($event)" (click)="$event.stopPropagation()">
            <input placeholder="Search for products, brands and vendors" autocomplete="off"
                   [value]="sq()" (input)="onType($any($event.target).value)" (focus)="sopen.set(true)" />
            <button type="submit" aria-label="Search">🔍</button>

            @if (sopen() && sq().trim().length >= 2 && (sugg().products.length || sugg().stores.length)) {
              <div class="sdrop">
                @if (sugg().stores.length) {
                  <div class="sgroup">Stores</div>
                  @for (s of sugg().stores; track s._id) {
                    <button type="button" class="sitem" (click)="goStore(s.slug)">
                      <span class="sthumb store">@if (s.logo) { <img [src]="s.logo" alt="" /> } @else { 🏬 }</span>
                      <span class="stxt"><b>{{ s.name }}</b><span class="muted">Visit store</span></span>
                    </button>
                  }
                }
                @if (sugg().products.length) {
                  <div class="sgroup">Products</div>
                  @for (p of sugg().products; track p._id) {
                    <button type="button" class="sitem" (click)="goProduct(p.slug)">
                      <span class="sthumb">@if (p.image) { <img [src]="p.image" alt="" /> } @else { 📦 }</span>
                      <span class="stxt"><b>{{ p.title }}</b><span class="muted">{{ p.storeName }} · {{ rupees(p.minPrice) }}</span></span>
                    </button>
                  }
                }
                <button type="button" class="sall" (click)="doSearchText()">See all results for “{{ sq().trim() }}” →</button>
              </div>
            }
          </form>

          <nav class="right">
            @if (auth.isLoggedIn()) {
              <a routerLink="/account/orders" class="icon" title="Your orders">📦<span class="ilbl">Orders</span></a>
              <a routerLink="/account/wishlist" class="icon wish" title="Wishlist">
                <span class="hicon">{{ wl.count() ? '♥' : '♡' }}</span><span class="ilbl">Wishlist</span>
                @if (wl.count()) { <span class="badge">{{ wl.count() }}</span> }
              </a>

              <!-- Notification bell -->
              <div class="icon bellwrap" (click)="toggle('bell', $event)" title="Notifications">
                🔔<span class="ilbl">Alerts</span>
                @if (notif.unread() > 0) { <span class="badge">{{ notif.unread() }}</span> }
                @if (open() === 'bell') {
                  <div class="dropdown notif" (click)="$event.stopPropagation()">
                    <div class="nhead"><b>Notifications</b>
                      @if (notif.unread() > 0) { <button class="link" (click)="notif.markAll()">Mark all read</button> }
                    </div>
                    <div class="nlist">
                      @for (n of notif.items(); track n._id) {
                        <button class="nitem" [class.unread]="!n.read" (click)="openNotif(n)">
                          <div class="nt">{{ n.title }}</div>
                          <div class="nb muted">{{ n.body }}</div>
                          <div class="na muted">{{ ago(n.createdAt) }}</div>
                        </button>
                      } @empty { <div class="nempty muted">No notifications yet.</div> }
                    </div>
                  </div>
                }
              </div>

              <div class="acct" (click)="toggle('acct', $event)">
                <span class="lbl">Hello,</span>
                <span class="nm">{{ auth.user()?.name?.split(' ')?.[0] || 'Account' }} ▾</span>
                @if (open() === 'acct') {
                  <div class="dropdown" (click)="$event.stopPropagation()">
                    <a routerLink="/account" (click)="close()">Your account</a>
                    <a routerLink="/account/orders" (click)="close()">Your orders</a>
                    <a routerLink="/account/wishlist" (click)="close()">Wishlist</a>
                    <a routerLink="/account/addresses" (click)="close()">Addresses</a>
                    <button (click)="signOut()">Sign out</button>
                  </div>
                }
              </div>
            } @else {
              <a routerLink="/login" class="signin"><span class="lbl">Account</span><span class="nm">Sign in ▾</span></a>
            }
            <a routerLink="/cart" class="cart">🛒<span class="count">{{ cart.count$ | async }}</span></a>
          </nav>
        </div>
      </div>

      <!-- Departments mega-menu (dynamic, admin-managed) + quick links -->
      <div class="catstrip">
        <div class="hbar">
          <app-category-nav class="cnav" [tree]="tree()" [dark]="true" [routerPath]="catalogPath" />
          <div class="quick">
            <a routerLink="/catalog" class="clink">All products</a>
            <a routerLink="/stores" class="clink">🏪 Stores</a>
            <a routerLink="/catalog" [queryParams]="{ sort: 'rating' }" class="clink deals">🔥 Top rated</a>
            <a routerLink="/catalog" [queryParams]="{ sort: 'price_asc' }" class="clink">Best deals</a>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      header { position: sticky; top: 0; z-index: 30; }
      /* full-bleed bars — nav spans the whole screen width */
      .hbar { display: flex; align-items: center; gap: 18px; width: 100%; padding: 0 clamp(16px, 2.2vw, 44px); }
      .topbar { background: var(--ink); color: #fff; }
      .topbar .hbar { height: 62px; }
      .brand { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 1.15rem; color: #fff; white-space: nowrap; }
      .brand:hover { color: #fff; }
      .dot { width: 26px; height: 26px; border-radius: 7px; background: var(--brand-gradient); display: grid; place-items: center; color: #fff; font-size: 0.9rem; }
      .search { flex: 1; display: flex; min-width: 0; position: relative; }
      .search input { flex: 1; padding: 11px 16px; border: none; border-radius: var(--radius-sm) 0 0 var(--radius-sm); font: inherit; }
      .search input:focus { outline: none; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.4); }
      .search button { padding: 0 18px; border: none; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; background: var(--brand-gradient); color: #fff; cursor: pointer; font-size: 1rem; }
      /* Typeahead dropdown */
      .sdrop { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #fff; color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); z-index: 60; max-height: 70vh; overflow-y: auto; padding: 6px; }
      .sgroup { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); padding: 8px 10px 4px; }
      .sitem { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: none; border: none; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
      .sitem:hover { background: var(--surface-2); }
      .sthumb { width: 40px; height: 40px; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; overflow: hidden; flex-shrink: 0; font-size: 1.1rem; }
      .sthumb.store { border-radius: 50%; }
      .sthumb img { width: 100%; height: 100%; object-fit: cover; }
      .stxt { display: flex; flex-direction: column; min-width: 0; }
      .stxt b { font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .stxt .muted { font-size: 0.78rem; }
      .sall { width: 100%; text-align: center; background: none; border: none; border-top: 1px solid var(--border); margin-top: 4px; padding: 10px; color: var(--brand-700); font-weight: 700; cursor: pointer; font-size: 0.85rem; }
      .sall:hover { background: var(--surface-2); }
      .right { display: flex; align-items: center; gap: 16px; white-space: nowrap; }
      .icon { display: flex; flex-direction: column; align-items: center; gap: 1px; color: #fff; font-size: 1.15rem; cursor: pointer; position: relative; line-height: 1; }
      .ilbl { font-size: 0.66rem; color: #b7b7bd; font-weight: 600; }
      .icon:hover .ilbl { color: #fff; }
      .wish .hicon { font-size: 1.25rem; color: #fb7185; line-height: 1; }
      .lbl { display: block; font-size: 0.72rem; color: #b7b7bd; }
      .nm { font-weight: 700; font-size: 0.9rem; color: #fff; }
      .acct, .signin { cursor: pointer; position: relative; line-height: 1.15; }
      .signin { color: #fff; }
      .badge { position: absolute; top: -6px; right: -8px; background: var(--brand-gradient); color: #fff; border-radius: 999px; min-width: 17px; height: 17px; display: grid; place-items: center; font-size: 0.65rem; font-weight: 800; padding: 0 4px; }
      .dropdown { position: absolute; right: 0; top: 44px; background: var(--surface); color: var(--text); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); display: grid; min-width: 190px; padding: 6px; z-index: 40; }
      .dropdown a, .dropdown button { text-align: left; padding: 10px 12px; border-radius: 8px; background: none; border: none; cursor: pointer; font: inherit; color: var(--text); }
      .dropdown a:hover, .dropdown button:hover { background: var(--surface-2); color: var(--brand-700); }
      /* notification dropdown */
      .notif { min-width: 340px; padding: 0; overflow: hidden; }
      .nhead { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--border); }
      .link { background: none; border: none; color: var(--brand-700); font-size: 0.8rem; font-weight: 700; cursor: pointer; padding: 0; }
      .nlist { max-height: 380px; overflow-y: auto; display: grid; }
      .nitem { text-align: left; padding: 11px 14px; border: none; border-bottom: 1px solid var(--border); background: none; cursor: pointer; display: grid; gap: 2px; }
      .nitem:hover { background: var(--surface-2); }
      .nitem.unread { background: #fff6f0; }
      .nt { font-weight: 700; font-size: 0.88rem; color: var(--text); }
      .nb { font-size: 0.82rem; }
      .na { font-size: 0.72rem; }
      .nempty { padding: 26px 14px; text-align: center; }
      .cart { display: flex; flex-direction: column; align-items: center; gap: 1px; color: #fff; font-size: 1.2rem; position: relative; }
      .count { position: absolute; top: -6px; right: -8px; background: var(--brand-gradient); color: #fff; border-radius: 999px; min-width: 18px; height: 18px; display: grid; place-items: center; font-size: 0.68rem; font-weight: 800; padding: 0 4px; }
      .catstrip { background: var(--ink-2); }
      .catstrip .hbar { min-height: 46px; gap: 12px; }
      .cnav { flex: 1; min-width: 0; }
      .quick { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
      .clink { color: #cfcfd6; font-size: 0.85rem; font-weight: 500; padding: 6px 10px; border-radius: 8px; }
      .clink:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .deals { color: #ffb27a; }
      @media (max-width: 900px) { .search { display: none; } .ilbl, .lbl { display: none; } .quick { display: none; } }
    `,
  ],
})
export class HeaderComponent implements OnInit {
  readonly cart = inject(CartFacade);
  readonly auth = inject(AuthService);
  readonly notif = inject(NotificationsService);
  readonly wl = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);

  open = signal<'acct' | 'bell' | null>(null);
  tree = signal<CatNode[]>([]);
  readonly catalogPath = ['/catalog'];

  // Typeahead search
  sq = signal('');
  sopen = signal(false);
  sugg = signal<Suggestion>({ products: [], stores: [] });
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.catalog.getCategoryTree().subscribe({ next: (t) => this.tree.set(t) });
  }

  toggle(which: 'acct' | 'bell', e: Event): void {
    e.stopPropagation();
    this.open.set(this.open() === which ? null : which);
  }
  close(): void { this.open.set(null); }
  signOut(): void { this.cart.clear(); this.auth.logout(); this.close(); }
  @HostListener('document:click') onDocClick(): void { this.open.set(null); this.sopen.set(false); }

  // ── Typeahead ──────────────────────────────────────────────────────────────
  onType(v: string): void {
    this.sq.set(v);
    this.sopen.set(true);
    clearTimeout(this.searchTimer);
    const term = v.trim();
    if (term.length < 2) { this.sugg.set({ products: [], stores: [] }); return; }
    this.searchTimer = setTimeout(() => {
      this.catalog.suggest(term).subscribe({ next: (r) => this.sugg.set(r) });
    }, 220);
  }
  goProduct(slug: string): void { this.sopen.set(false); void this.router.navigate(['/p', slug]); }
  goStore(slug: string): void { this.sopen.set(false); void this.router.navigate(['/store', slug]); }
  doSearchText(): void {
    const q = this.sq().trim();
    this.sopen.set(false);
    void this.router.navigate(['/catalog'], { queryParams: q ? { q } : {} });
  }
  rupees(paise: number): string { return '₹' + Math.round((paise ?? 0) / 100).toLocaleString('en-IN'); }

  openNotif(n: Notif): void {
    this.notif.markRead(n._id);
    this.close();
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  ago(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  doSearch(e: Event): void {
    e.preventDefault();
    this.doSearchText();
  }
}
