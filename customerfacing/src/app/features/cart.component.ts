import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartFacade } from '../store/cart/cart.facade';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  template: `
    @if ((cart.count$ | async); as count) {
      <div class="chead">
        <h1>Shopping cart</h1>
        <span class="muted">{{ count }} item{{ count === 1 ? '' : 's' }}</span>
      </div>

      <div class="cartgrid">
        <!-- Items -->
        <div class="items">
          @for (group of cart.byStore$ | async; track group.storeId) {
            <div class="card store">
              <div class="store-head">
                <span class="shop">🏪 {{ group.lines[0]?.storeName || 'Store' }}</span>
                <span class="muted small">Sold & shipped by vendor</span>
              </div>
              @for (line of group.lines; track line.variantSku) {
                <div class="line">
                  <a class="thumb" [routerLink]="line.slug ? ['/p', line.slug] : ['/cart']">
                    @if (line.image) { <img [src]="line.image" [alt]="line.title" /> } @else { <span class="ph">🛍️</span> }
                  </a>
                  <div class="info">
                    <a class="ltitle" [routerLink]="line.slug ? ['/p', line.slug] : ['/cart']">{{ line.title }}</a>
                    @if (line.modifierNames?.length) { <div class="mods muted small">{{ line.modifierNames!.join(', ') }}</div> }
                    <div class="each muted small">₹{{ line.unitPrice / 100 }} each</div>
                    <button class="linkbtn" (click)="cart.remove(line.variantSku)">🗑 Remove</button>
                  </div>
                  <div class="qty">
                    <button class="sbtn" (click)="cart.setQty(line.variantSku, line.qty - 1)" aria-label="Decrease">−</button>
                    <span class="q">{{ line.qty }}</span>
                    <button class="sbtn" (click)="cart.setQty(line.variantSku, line.qty + 1)" aria-label="Increase">+</button>
                  </div>
                  <div class="ltotal">₹{{ (line.unitPrice * line.qty) / 100 }}</div>
                </div>
              }
            </div>
          }
          <a routerLink="/catalog" class="continue">← Continue shopping</a>
        </div>

        <!-- Summary -->
        <aside class="summary">
          <div class="card sbox">
            <h3>Order summary</h3>
            <div class="srow"><span>Subtotal ({{ count }} item{{ count === 1 ? '' : 's' }})</span><span>₹{{ (cart.total$ | async)! / 100 }}</span></div>
            <div class="srow"><span>Delivery</span><span class="muted">Calculated at checkout</span></div>
            <div class="srow"><span>Taxes</span><span class="muted">Calculated at checkout</span></div>
            <div class="srow total"><span>Total</span><span class="price">₹{{ (cart.total$ | async)! / 100 }}</span></div>
            <a class="btn btn-primary checkout" routerLink="/checkout">Proceed to checkout →</a>
            <div class="trust muted small">🔒 Secure checkout · 🚚 Free delivery over ₹500 · ↩️ 7-day returns</div>
          </div>
        </aside>
      </div>
    } @else {
      <div class="empty card">
        <div class="ei">🛒</div>
        <h2>Your cart is empty</h2>
        <p class="muted">Looks like you haven't added anything yet.</p>
        <a routerLink="/catalog" class="btn btn-primary">Start shopping →</a>
      </div>
    }
  `,
  styles: [
    `
      .chead { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
      .chead h1 { font-size: 1.6rem; }
      .cartgrid { display: grid; grid-template-columns: 1fr 350px; gap: 24px; align-items: start; }
      @media (max-width: 880px) { .cartgrid { grid-template-columns: 1fr; } }

      .store { margin-bottom: 16px; padding: 0; overflow: hidden; }
      .store-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
      .shop { font-weight: 700; font-size: 0.95rem; }
      .small { font-size: 0.78rem; }

      .line { display: grid; grid-template-columns: 92px 1fr auto auto; align-items: center; gap: 16px; padding: 16px 18px; border-top: 1px solid var(--border); }
      .line:first-of-type { border-top: none; }
      .thumb { width: 92px; height: 92px; border-radius: var(--radius-sm); overflow: hidden; background: #f5f5f4; display: grid; place-items: center; }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .ph { font-size: 2rem; }
      .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .ltitle { font-weight: 600; color: var(--text); font-size: 0.98rem; line-height: 1.3; }
      .ltitle:hover { color: var(--brand-700); }
      .mods { font-style: italic; }
      .linkbtn { align-self: flex-start; margin-top: 4px; background: none; border: none; padding: 0; color: var(--danger); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
      .linkbtn:hover { text-decoration: underline; }

      .qty { display: inline-flex; align-items: center; border: 1.5px solid var(--brand-600); border-radius: var(--radius-sm); overflow: hidden; }
      .sbtn { width: 36px; height: 36px; border: none; background: var(--brand-50, #fff5ef); color: var(--brand-700); font-size: 1.15rem; font-weight: 800; cursor: pointer; }
      .sbtn:hover { background: var(--brand-600); color: #fff; }
      .q { width: 40px; text-align: center; font-weight: 700; }
      .ltotal { font-weight: 800; font-size: 1.05rem; min-width: 70px; text-align: right; }
      @media (max-width: 560px) {
        .line { grid-template-columns: 72px 1fr; grid-template-areas: 'thumb info' 'qty total'; row-gap: 12px; }
        .thumb { grid-area: thumb; width: 72px; height: 72px; } .info { grid-area: info; } .qty { grid-area: qty; } .ltotal { grid-area: total; text-align: left; }
      }

      .continue { display: inline-block; margin-top: 6px; font-weight: 600; color: var(--brand-700); }

      .summary { position: sticky; top: 130px; }
      .sbox h3 { margin-bottom: 14px; }
      .srow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; font-size: 0.92rem; }
      .srow.total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 14px; font-weight: 800; font-size: 1.1rem; }
      .price { color: var(--brand-700); }
      .checkout { width: 100%; margin-top: 14px; justify-content: center; }
      .trust { margin-top: 12px; text-align: center; line-height: 1.6; }

      .empty { text-align: center; padding: 60px 20px; max-width: 460px; margin: 40px auto; }
      .ei { font-size: 3.4rem; margin-bottom: 10px; }
      .empty h2 { margin-bottom: 6px; } .empty p { margin-bottom: 18px; }
    `,
  ],
})
export class CartComponent {
  readonly cart = inject(CartFacade);
}
