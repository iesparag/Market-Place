import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, HeaderComponent],
  template: `
    <app-header />
    <main class="container"><router-outlet /></main>

    <footer class="foot">
      <div class="container fcols">
        <div>
          <div class="fbrand"><span class="dot">M</span> Marketplace</div>
          <p class="muted">Everything you need, from every vendor — one cart, one checkout.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <a routerLink="/catalog">All products</a>
          <a routerLink="/catalog" [queryParams]="{ sort: 'rating' }">Top rated</a>
          <a routerLink="/catalog" [queryParams]="{ sort: 'price_asc' }">Best deals</a>
        </div>
        <div>
          <h4>Account</h4>
          <a routerLink="/account">Your account</a>
          <a routerLink="/account/orders">Orders</a>
          <a routerLink="/account/wishlist">Wishlist</a>
        </div>
        <div>
          <h4>Sell</h4>
          <a routerLink="/become-vendor">Become a vendor</a>
          <span class="muted">support&#64;marketplace.local</span>
        </div>
      </div>
      <div class="fbar">© 2026 Marketplace · Built as a demo marketplace.</div>
    </footer>
  `,
  styles: [
    `
      main { min-height: 60vh; }
      .foot { background: var(--ink); color: #cfcfd6; margin-top: 48px; }
      .fcols { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 30px; padding-top: 40px; padding-bottom: 30px; }
      @media (max-width: 720px) { .fcols { grid-template-columns: 1fr 1fr; } }
      .fbrand { display: flex; align-items: center; gap: 8px; font-weight: 800; color: #fff; margin-bottom: 8px; }
      .dot { width: 22px; height: 22px; border-radius: 6px; background: var(--brand-gradient); display: grid; place-items: center; color: #fff; font-size: 0.8rem; }
      .foot h4 { color: #fff; font-size: 0.9rem; margin-bottom: 10px; }
      .foot a, .foot .muted { display: block; color: #b7b7bd; font-size: 0.88rem; padding: 4px 0; }
      .foot a:hover { color: var(--brand-500); }
      .fbar { border-top: 1px solid rgba(255, 255, 255, 0.1); padding: 16px 0; text-align: center; font-size: 0.82rem; color: #9a9aa2; }
    `,
  ],
})
export class AppComponent {}
