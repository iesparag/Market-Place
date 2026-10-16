import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { EntityPickerComponent, type PickedEntity } from '../../shared/components/entity-picker.component';

export type CampaignLayout = 'product_showcase' | 'big_picture' | 'store_spotlight' | 'standard';
type Audience = 'customers' | 'vendors' | 'all' | 'individual';

export interface CampaignProduct {
  id: string;
  title: string;
  slug: string;
  price: number;
  originalPrice?: number;
  image?: string;
}

export interface CampaignStore {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  vendorType?: string;
}

interface Coupon {
  _id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  active: boolean;
}

interface WaTemplate {
  _id: string;
  name: string;
  status: string;
  variableCount: number;
}

interface CampaignHistoryItem {
  _id: string;
  title: string;
  subtitle?: string;
  body?: string;
  image?: string;
  link?: string;
  layout?: string;
  products?: CampaignProduct[];
  storeName?: string;
  actionText?: string;
  audience: string;
  targetCity?: string;
  recipientsCount: number;
  devicesCount: number;
  createdAt: string;
}

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, EntityPickerComponent, DatePipe],
  template: `
    <header class="head">
      <div>
        <h1>Push Notifications & WhatsApp Campaigns</h1>
        <p class="muted">
          Design high-converting rich notifications — Flipkart-style multi-product carousels, hero banners, store spotlights, and WhatsApp broadcasts with live phone preview.
        </p>
      </div>
    </header>

    <div class="cols">
      <!-- Left Column: Notification & Campaign Composer -->
      <form class="card composer-card" [formGroup]="form" (ngSubmit)="send()">
        
        <!-- 1. Layout Mode Selector (Flipkart Multi-Product vs Big Picture vs Store Spotlight) -->
        <div class="section-title">1. Choose Notification Layout & Style</div>
        <div class="layout-selector">
          <button
            type="button"
            class="layout-card"
            [class.active]="layout() === 'product_showcase'"
            (click)="setLayout('product_showcase')">
            <span class="layout-icon">🛍️</span>
            <div class="layout-text">
              <b>Multi-Product Carousel</b>
              <span class="muted small">Flipkart/Meesho style — 2 to 4 items in a row with prices & direct click-to-buy</span>
            </div>
          </button>

          <button
            type="button"
            class="layout-card"
            [class.active]="layout() === 'big_picture'"
            (click)="setLayout('big_picture')">
            <span class="layout-icon">🖼️</span>
            <div class="layout-text">
              <b>Hero Big Picture</b>
              <span class="muted small">High-res wide banner with bold CTA button (Myntra/Zomato style)</span>
            </div>
          </button>

          <button
            type="button"
            class="layout-card"
            [class.active]="layout() === 'store_spotlight'"
            (click)="setLayout('store_spotlight')">
            <span class="layout-icon">🏪</span>
            <div class="layout-text">
              <b>Store / Vendor Spotlight</b>
              <span class="muted small">Feature a specific shop with store logo, verified badge, and direct storefront link</span>
            </div>
          </button>

          <button
            type="button"
            class="layout-card"
            [class.active]="layout() === 'standard'"
            (click)="setLayout('standard')">
            <span class="layout-icon">📢</span>
            <div class="layout-text">
              <b>Standard Deal & Alert</b>
              <span class="muted small">Clean title, deal badge, custom copy, and direct action link</span>
            </div>
          </button>
        </div>

        <!-- 2. Attached Items / Store Section based on layout -->
        @if (layout() === 'product_showcase') {
          <div class="section-title" style="margin-top: 20px;">
            2. Attached Products (Flipkart Carousel Items)
          </div>
          <p class="muted small" style="margin-top: 2px; margin-bottom: 8px;">
            Customers can tap individual product cards right from their notification shade or WhatsApp message to open the product directly.
          </p>

          <app-entity-picker
            endpoint="/products"
            placeholder="Search & add products to carousel (type title or category)…"
            [mapFn]="productMapFn"
            [clearOnPick]="true"
            (changed)="onProductAdded($event)" />

          <div class="product-pills-list">
            @for (p of attachedProducts(); track p.id; let i = $index) {
              <div class="product-edit-item">
                <img [src]="p.image || 'assets/placeholder.png'" class="prod-thumb" alt="Product" />
                <div class="prod-info">
                  <div class="prod-title">{{ p.title }}</div>
                  <div class="prod-pricing">
                    <label class="price-input-label">
                      Sale Price: ₹
                      <input
                        type="number"
                        class="mini-price-input"
                        [ngModel]="p.price"
                        [ngModelOptions]="{ standalone: true }"
                        (ngModelChange)="updateProductPrice(i, $event)" />
                    </label>
                    <label class="price-input-label">
                      MRP: ₹
                      <input
                        type="number"
                        class="mini-price-input"
                        [ngModel]="p.originalPrice || p.price * 2"
                        [ngModelOptions]="{ standalone: true }"
                        (ngModelChange)="updateProductOriginalPrice(i, $event)" />
                    </label>
                  </div>
                </div>
                <button type="button" class="del-btn" (click)="removeProduct(i)" title="Remove item">×</button>
              </div>
            } @empty {
              <div class="empty-hint">No products attached yet. Search above to add items to your notification carousel!</div>
            }
          </div>
        }

        @if (layout() === 'store_spotlight') {
          <div class="section-title" style="margin-top: 20px;">
            2. Target Store / Vendor
          </div>
          <app-entity-picker
            endpoint="/stores"
            placeholder="Search vendor or shop by name…"
            [mapFn]="storeMapFn"
            (changed)="onStorePicked($event)" />

          @if (attachedStore(); as s) {
            <div class="selected-store-box">
              @if (s.logo) { <img [src]="s.logo" class="store-avatar" alt="Store logo" /> }
              <div class="store-text">
                <b>{{ s.name }}</b>
                <span class="muted small"> · {{ s.vendorType }} store</span>
                <div class="store-link-preview">Opens: <code>/store/{{ s.slug }}</code></div>
              </div>
              <button type="button" class="del-btn" (click)="attachedStore.set(null)">×</button>
            </div>
          }
        }

        <!-- 3. Message Copy & Emojis -->
        <div class="section-title" style="margin-top: 20px;">
          3. Headline & Message Content
        </div>

        <div class="emoji-bar">
          <span class="emoji-hint">Quick Emojis:</span>
          @for (e of quickEmojis; track e) {
            <button type="button" class="emoji-btn" (click)="insertEmoji(e)">{{ e }}</button>
          }
        </div>

        <label class="label">Notification Title *</label>
        <input class="input" formControlName="title" placeholder="📞 Shopping therapy is calling you! or 🎉 Flash Sale Live!" />

        <label class="label">
          Deal Highlight / Subtitle
          <span class="muted small">(e.g. price highlight, discount tag or punchline)</span>
        </label>
        <div class="quick-chips">
          @for (sub of quickSubtitles; track sub) {
            <button type="button" class="chip-btn" (click)="setSubtitle(sub)">{{ sub }}</button>
          }
        </div>
        <input class="input" formControlName="subtitle" placeholder="Pick up to find the best 🥰 or At Rs. 599! or ⚡ 15-Min Delivery" />

        <label class="label">Message Body</label>
        <textarea class="input" rows="2" formControlName="body" placeholder="Handpicked trending items at unmatched prices. Tap to shop before stock runs out!"></textarea>

        <!-- Coupon Attachment -->
        <div class="coupon-row">
          <div style="flex: 1;">
            <label class="label">Attach Coupon (Optional)</label>
            <select class="input" formControlName="couponCode" (change)="onCouponChange()">
              <option value="">No Coupon</option>
              @for (c of coupons(); track c._id) {
                <option [value]="c.code">
                  {{ c.code }} — {{ c.type === 'percent' ? c.value + '% OFF' : '₹' + c.value / 100 + ' OFF' }}
                </option>
              }
            </select>
          </div>
        </div>

        <!-- Hero Image (if big_picture layout) -->
        @if (layout() === 'big_picture') {
          <div class="section-title" style="margin-top: 18px;">4. Banner Image (Big Picture Hero)</div>
          <div class="banner-presets">
            @for (banner of presetBanners; track banner.label) {
              <button type="button" class="banner-pill" (click)="setBanner(banner.url)">
                {{ banner.label }}
              </button>
            }
          </div>
          <input class="input" formControlName="image" placeholder="https://images.unsplash.com/... or paste image URL" />
        }

        <!-- 4. Deep Link & Action Button -->
        <div class="section-title" style="margin-top: 20px;">4. Deep Link & Primary Action</div>
        <div class="two-inputs">
          <div>
            <label class="label">Action Button Label</label>
            <input class="input" formControlName="actionText" placeholder="SHOP or VIEW DEALS or BUY NOW" />
          </div>
          <div>
            <label class="label">Target Link / Route</label>
            <input class="input" formControlName="link" placeholder="/now or /catalog or /p/slug or /store/slug" />
          </div>
        </div>

        <!-- 5. Target Audience & Channels -->
        <div class="section-title" style="margin-top: 20px;">5. Audience & Channels</div>
        <label class="label">Target Audience *</label>
        <select class="input" formControlName="audience" (change)="onAudienceChange()">
          <option value="customers">👥 All Registered Customers</option>
          <option value="vendors">🏪 All Vendors & Store Staff</option>
          <option value="all">🌐 Everyone (Customers + Vendors)</option>
          <option value="individual">🎯 Specific Customer(s)</option>
        </select>

        @if (audience() === 'individual') {
          <div style="margin-top: 8px;">
            <app-entity-picker
              endpoint="/users"
              placeholder="Search customers by name, phone or email…"
              [multiple]="true"
              [extraParams]="{ role: 'customer' }"
              [mapFn]="userMapFn"
              (changed)="recipients.set($event)" />
          </div>
        }

        <!-- Delivery Channels Checkboxes -->
        <div class="channels-box">
          <label class="channel-check">
            <input type="checkbox" [(ngModel)]="viaPush" [ngModelOptions]="{ standalone: true }" />
            <span>📱 <b>Push Notification</b> (FCM System Notification Shade + In-App Bell)</span>
          </label>
          <label class="channel-check">
            <input type="checkbox" [(ngModel)]="viaWhatsapp" [ngModelOptions]="{ standalone: true }" />
            <span>💬 <b>WhatsApp Business Message</b> (Meta Cloud Verified Template)</span>
          </label>
        </div>

        @if (viaWhatsapp) {
          <div class="wa-config-notice">
            <label class="label">Select Approved WhatsApp Template</label>
            <select class="input" [(ngModel)]="templateName" [ngModelOptions]="{ standalone: true }">
              <option value="">Default Marketing Broadcast Template</option>
              @for (t of approvedTemplates(); track t._id) {
                <option [value]="t.name">{{ t.name }}</option>
              }
            </select>
            <p class="muted small" style="margin-top: 4px;">
              Only customers opted into WhatsApp updates receive the message on WhatsApp; all others receive push notification.
            </p>
          </div>
        }

        @if (result()) { <div class="ok">{{ result() }}</div> }
        @if (testResult()) { <div class="test-ok">{{ testResult() }}</div> }

        <div class="btn-group">
          <button
            type="button"
            class="btn btn-secondary"
            [disabled]="testing() || form.controls.title.invalid"
            (click)="sendTestPush()">
            {{ testing() ? 'Sending Test…' : '⚡ Send Test Push to My Device' }}
          </button>

          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="form.invalid || sending() || (!viaPush && !viaWhatsapp) || (audience() === 'individual' && !recipients().length)">
            {{ sending() ? 'Broadcasting…' : '📣 Broadcast Campaign Now' }}
          </button>
        </div>
      </form>

      <!-- Right Column: Interactive Phone Previews (Android Notification Shade + WhatsApp) -->
      <div class="preview-column">
        <div class="card preview-card">
          <div class="preview-top-bar">
            <h3>👁️ Live Interactive Preview</h3>
            <div class="preview-tabs">
              <button
                type="button"
                class="tab-btn"
                [class.active]="previewTab() === 'android'"
                (click)="previewTab.set('android')">
                📱 Android Shade
              </button>
              <button
                type="button"
                class="tab-btn"
                [class.active]="previewTab() === 'whatsapp'"
                (click)="previewTab.set('whatsapp')">
                💬 WhatsApp Chat
              </button>
            </div>
          </div>

          <p class="preview-desc muted small">
            @if (previewTab() === 'android') {
              Pixel-perfect replica of the customer's lock screen & notification shade (matching Flipkart, Meesho & Myntra).
            } @else {
              Realistic preview of the message received by customers on WhatsApp Business.
            }
          </p>

          <!-- ── TAB 1: Android Notification Shade (Matches Flipkart User Screenshot) ── -->
          @if (previewTab() === 'android') {
            <div class="android-phone-frame">
              <!-- Android Status Bar -->
              <div class="android-status-bar">
                <span>10:13</span>
                <div class="status-icons">
                  <span>📶 5G</span>
                  <span>🔋 93%</span>
                </div>
              </div>

              <!-- Notification Shade Container -->
              <div class="android-shade">
                <div class="notif-card">
                  <!-- App Header Bar -->
                  <div class="notif-head">
                    <div class="notif-app-icon">🛍️</div>
                    <span class="notif-app-name">Marketplace</span>
                    <span class="notif-dot">•</span>
                    <span class="notif-time">10:13 pm</span>
                    <span class="notif-expand">⌃</span>
                    <div class="notif-right-logo">🛍️</div>
                  </div>

                  <!-- Notification Title & Body -->
                  <div class="notif-title-row">
                    <div class="notif-title">{{ form.controls.title.value || '📞 Shopping therapy is calling you!' }}</div>
                  </div>
                  <div class="notif-subtitle-row">
                    {{ form.controls.subtitle.value || 'Pick up to find the best 🥰' }}
                  </div>
                  @if (form.controls.body.value) {
                    <div class="notif-message-body">{{ form.controls.body.value }}</div>
                  }

                  <!-- ── 1. MULTI-PRODUCT CAROUSEL (Flipkart Style from Screenshot) ── -->
                  @if (layout() === 'product_showcase' && attachedProducts().length) {
                    <div class="flipkart-carousel">
                      <div class="carousel-items-row">
                        @for (p of attachedProducts(); track p.id) {
                          <div class="carousel-prod-card">
                            <div class="carousel-img-wrap">
                              <img [src]="p.image || 'assets/placeholder.png'" class="carousel-prod-img" alt="Product" />
                            </div>
                            <div class="carousel-prod-title">{{ p.title }}</div>
                            <div class="carousel-prod-price-row">
                              <span class="carousel-sale-price">₹{{ p.price }}</span>
                              @if (p.originalPrice && p.originalPrice > p.price) {
                                <span class="carousel-mrp-price">₹{{ p.originalPrice }}</span>
                              }
                            </div>
                          </div>
                        }
                      </div>

                      <!-- Pagination Carousel Controls from Flipkart screenshot -->
                      <div class="carousel-nav-footer">
                        <button type="button" class="carousel-arrow-btn">‹</button>
                        <div class="carousel-dots">
                          <span class="dot active"></span>
                          <span class="dot"></span>
                          <span class="dot"></span>
                        </div>
                        <button type="button" class="carousel-arrow-btn">›</button>
                      </div>
                    </div>
                  }

                  <!-- ── 2. HERO BIG PICTURE (Myntra/Zomato Style) ── -->
                  @if (layout() === 'big_picture' && form.controls.image.value) {
                    <div class="notif-hero-container">
                      <img class="notif-hero-img" [src]="form.controls.image.value" alt="Hero Banner" />
                    </div>
                    <div class="notif-action-row">
                      <button type="button" class="notif-action-btn">
                        {{ form.controls.actionText.value || 'SHOP NOW' }}
                      </button>
                      <span class="notif-action-link muted small">Opens: {{ form.controls.link.value || '/' }}</span>
                    </div>
                  }

                  <!-- ── 3. STORE SPOTLIGHT ── -->
                  @if (layout() === 'store_spotlight' && attachedStore(); as s) {
                    <div class="notif-store-card">
                      @if (s.logo) { <img [src]="s.logo" class="notif-store-logo" alt="Store logo" /> }
                      <div class="notif-store-info">
                        <div class="notif-store-name">{{ s.name }} <span class="store-badge">Verified</span></div>
                        <div class="notif-store-type">{{ s.vendorType }} · Fast Delivery</div>
                      </div>
                      <button type="button" class="notif-store-btn">VISIT STORE</button>
                    </div>
                  }

                  <!-- ── 4. COUPON PILL ── -->
                  @if (form.controls.couponCode.value) {
                    <div class="notif-coupon-bar">
                      <span>🎟️ CODE: <b>{{ form.controls.couponCode.value }}</b></span>
                      <span class="coupon-copy-hint">TAP TO APPLY</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- ── TAB 2: WhatsApp Business Chat Preview ── -->
          @if (previewTab() === 'whatsapp') {
            <div class="wa-phone-frame">
              <!-- WhatsApp Header -->
              <div class="wa-header">
                <span class="wa-back-arrow">←</span>
                <div class="wa-avatar">🛍️</div>
                <div class="wa-contact-info">
                  <div class="wa-contact-name">Marketplace Official <span class="wa-verified">✓</span></div>
                  <div class="wa-contact-status">Official Business Account</div>
                </div>
              </div>

              <!-- WhatsApp Chat Area -->
              <div class="wa-chat-canvas">
                <div class="wa-date-pill">TODAY</div>

                <!-- Message Bubble -->
                <div class="wa-bubble">
                  @if (form.controls.image.value || (attachedProducts().length && attachedProducts()[0]?.image)) {
                    <div class="wa-header-img-wrap">
                      <img
                        [src]="form.controls.image.value || attachedProducts()[0]?.image"
                        class="wa-header-img"
                        alt="Campaign Header" />
                    </div>
                  }

                  <div class="wa-bubble-content">
                    <div class="wa-title"><b>{{ form.controls.title.value || '📞 Shopping therapy is calling you!' }}</b></div>
                    @if (form.controls.subtitle.value) {
                      <div class="wa-subtitle">✨ <i>{{ form.controls.subtitle.value }}</i></div>
                    }
                    <div class="wa-body-text">
                      {{ form.controls.body.value || 'Handpicked products just for you. Get instant delivery on Marketplace!' }}
                    </div>

                    @if (layout() === 'product_showcase' && attachedProducts().length) {
                      <div class="wa-deals-list">
                        <div class="wa-deals-head">🔥 <b>Featured Items Today:</b></div>
                        @for (p of attachedProducts(); track p.id; let i = $index) {
                          <div class="wa-deal-line">
                            {{ i + 1 }}. <b>{{ p.title }}</b> — <b>₹{{ p.price }}</b>
                            @if (p.originalPrice && p.originalPrice > p.price) {
                              <span class="wa-strike">~₹{{ p.originalPrice }}~</span>
                            }
                          </div>
                        }
                      </div>
                    }

                    @if (form.controls.couponCode.value) {
                      <div class="wa-coupon-box">
                        🎟️ Use Coupon Code: <code>{{ form.controls.couponCode.value }}</code>
                      </div>
                    }

                    <div class="wa-timestamp">
                      10:13 PM <span class="wa-ticks">✓✓</span>
                    </div>
                  </div>

                  <!-- WhatsApp CTA Button -->
                  <div class="wa-cta-button">
                    <span class="wa-cta-icon">🛍️</span>
                    <span>{{ form.controls.actionText.value || 'Shop Now on App' }}</span>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Past Campaigns Table -->
    <div class="card history-card" style="margin-top: 24px;">
      <div class="history-head">
        <h2>📜 Past Broadcast Campaigns</h2>
        <button class="btn btn-secondary btn-sm" (click)="loadCampaigns()">🔄 Refresh</button>
      </div>

      @if (loadingHistory()) {
        <p class="muted">Loading campaign history…</p>
      } @else if (campaigns().length === 0) {
        <p class="muted">No broadcast campaigns sent yet. Send your first campaign above!</p>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Layout</th>
                <th>Headline</th>
                <th>Audience</th>
                <th>Recipients</th>
                <th>Devices</th>
                <th>Link</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (c of campaigns(); track c._id) {
                <tr>
                  <td>{{ c.createdAt | date:'short' }}</td>
                  <td>
                    <span class="badge" [class.badge-primary]="c.layout === 'product_showcase'">
                      {{ c.layout || 'standard' }}
                    </span>
                  </td>
                  <td>
                    <b>{{ c.title }}</b>
                    @if (c.subtitle) {
                      <span class="history-chip">{{ c.subtitle }}</span>
                    }
                  </td>
                  <td><span class="badge">{{ c.audience }}</span></td>
                  <td>{{ c.recipientsCount }} users</td>
                  <td>{{ c.devicesCount }} devices</td>
                  <td><code class="small">{{ c.link || '/' }}</code></td>
                  <td>
                    <button class="btn btn-sm btn-outline" (click)="reuseCampaign(c)">Copy to Form</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 24px; align-items: start; }
      @media (max-width: 992px) { .cols { grid-template-columns: 1fr; } }

      .section-title { font-weight: 700; font-size: 0.95rem; color: #ea580c; border-bottom: 1px solid var(--border, #eee); padding-bottom: 4px; margin-bottom: 8px; }
      .label { margin-top: 10px; display: block; font-weight: 600; font-size: 0.88rem; }
      .muted { color: #64748b; }
      .small { font-size: 0.8rem; }

      /* Layout Selector */
      .layout-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
      .layout-card { display: flex; align-items: flex-start; gap: 10px; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: left; cursor: pointer; transition: all 0.15s ease; }
      .layout-card:hover { border-color: #ea580c; background: #fffaf5; }
      .layout-card.active { border-color: #ea580c; background: #fff7ed; box-shadow: 0 0 0 2px rgba(234,88,12,0.15); }
      .layout-icon { font-size: 1.4rem; line-height: 1; flex-shrink: 0; }
      .layout-text { display: flex; flex-direction: column; }
      .layout-text b { font-size: 0.86rem; color: #1e293b; margin-bottom: 2px; }

      /* Attached Product List */
      .product-pills-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
      .product-edit-item { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; }
      .prod-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
      .prod-info { flex: 1; min-width: 0; }
      .prod-title { font-size: 0.85rem; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .prod-pricing { display: flex; gap: 12px; margin-top: 4px; font-size: 0.8rem; }
      .price-input-label { display: flex; align-items: center; gap: 4px; font-weight: 600; color: #475569; }
      .mini-price-input { width: 75px; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.82rem; font-weight: 700; color: #0f172a; }
      .del-btn { border: none; background: #f1f5f9; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 1.1rem; line-height: 1; color: #64748b; }
      .del-btn:hover { background: #fee2e2; color: #ef4444; }
      .empty-hint { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; text-align: center; font-size: 0.85rem; color: #64748b; }

      /* Selected Store Box */
      .selected-store-box { display: flex; align-items: center; gap: 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px; margin-top: 8px; }
      .store-avatar { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; }
      .store-text { flex: 1; }
      .store-link-preview { font-size: 0.75rem; color: #9a3412; margin-top: 2px; }

      /* Emoji and Chips */
      .emoji-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .emoji-hint { font-size: 0.8rem; color: #64748b; }
      .emoji-btn { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; font-size: 1rem; cursor: pointer; }
      .emoji-btn:hover { transform: scale(1.15); background: #f1f5f9; }

      .quick-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; margin-bottom: 6px; }
      .chip-btn { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.78rem; font-weight: 600; padding: 3px 8px; cursor: pointer; color: #334155; }
      .chip-btn:hover { background: #e2e8f0; }

      .banner-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; margin-bottom: 6px; }
      .banner-pill { background: #fff7ed; border: 1px solid #fed7aa; color: #ea580c; border-radius: 8px; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; cursor: pointer; }
      .banner-pill:hover { background: #ffedd5; }

      .two-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .channels-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
      .channel-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem; }
      .wa-config-notice { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px; margin-top: 10px; }

      .btn-group { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
      .btn { padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; font-size: 0.9rem; }
      .btn-primary { background: #ea580c; color: white; }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-secondary { background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; }
      .btn-sm { padding: 4px 10px; font-size: 0.8rem; border-radius: 6px; }
      .btn-outline { background: transparent; border: 1px solid #ea580c; color: #ea580c; }
      .btn-outline:hover { background: #ea580c; color: white; }

      .ok { background: #e7f8ee; color: #15803d; padding: 10px; border-radius: 8px; margin-top: 12px; font-weight: 600; font-size: 0.9rem; }
      .test-ok { background: #eff6ff; color: #1d4ed8; padding: 10px; border-radius: 8px; margin-top: 12px; font-weight: 600; font-size: 0.9rem; }

      /* ── PHONE PREVIEW TABS & CHROME ── */
      .preview-top-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
      .preview-tabs { display: flex; background: #f1f5f9; padding: 3px; border-radius: 8px; gap: 4px; }
      .tab-btn { background: transparent; border: none; padding: 5px 12px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; color: #64748b; cursor: pointer; }
      .tab-btn.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .preview-desc { margin: 8px 0 14px; }

      /* ── 1. ANDROID NOTIFICATION SHADE PREVIEW (Flipkart Replica) ── */
      .android-phone-frame { background: #1a1b1e; border-radius: 22px; padding: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.35); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .android-status-bar { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #ffffff; font-weight: 600; padding: 0 6px 10px; }
      .status-icons { display: flex; gap: 8px; font-size: 0.72rem; }

      .android-shade { background: #26272b; border-radius: 16px; padding: 10px; }
      .notif-card { background: #323338; border-radius: 14px; padding: 12px; color: #ffffff; }

      .notif-head { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: #9da0a6; margin-bottom: 6px; }
      .notif-app-icon { width: 20px; height: 20px; background: #eab308; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; }
      .notif-app-name { font-weight: 700; color: #f1f5f9; }
      .notif-expand { font-size: 0.8rem; margin-left: auto; }
      .notif-right-logo { width: 22px; height: 22px; background: #eab308; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; margin-left: 6px; }

      .notif-title-row { margin-top: 4px; }
      .notif-title { font-weight: 800; font-size: 0.95rem; color: #ffffff; line-height: 1.3; }
      .notif-subtitle-row { font-size: 0.84rem; color: #cbd5e1; margin-top: 2px; }
      .notif-message-body { font-size: 0.8rem; color: #94a3b8; margin-top: 4px; line-height: 1.3; }

      /* FLIPKART MULTI-PRODUCT CAROUSEL PREVIEW */
      .flipkart-carousel { margin-top: 10px; }
      .carousel-items-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .carousel-prod-card { background: #ffffff; border-radius: 8px; padding: 5px; color: #0f172a; display: flex; flex-direction: column; overflow: hidden; }
      .carousel-img-wrap { width: 100%; height: 86px; border-radius: 6px; overflow: hidden; background: #f1f5f9; }
      .carousel-prod-img { width: 100%; height: 100%; object-fit: cover; }
      .carousel-prod-title { font-size: 0.7rem; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .carousel-prod-price-row { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
      .carousel-sale-price { font-size: 0.8rem; font-weight: 900; color: #0f172a; }
      .carousel-mrp-price { font-size: 0.68rem; color: #94a3b8; text-decoration: line-through; }

      .carousel-nav-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 0 40px; }
      .carousel-arrow-btn { background: #404249; color: #ffffff; border: none; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.9rem; }
      .carousel-dots { display: flex; gap: 4px; }
      .carousel-dots .dot { width: 6px; height: 6px; border-radius: 50%; background: #64748b; }
      .carousel-dots .dot.active { background: #3b82f6; width: 14px; border-radius: 4px; }

      /* HERO BIG PICTURE */
      .notif-hero-container { margin-top: 10px; border-radius: 8px; overflow: hidden; max-height: 140px; }
      .notif-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .notif-action-row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); }
      .notif-action-btn { background: #f43f5e; color: #ffffff; font-weight: 800; font-size: 0.8rem; padding: 5px 16px; border: none; border-radius: 6px; cursor: pointer; }
      .notif-action-link { color: #94a3b8; font-size: 0.72rem; }

      /* STORE SPOTLIGHT NOTIF */
      .notif-store-card { display: flex; align-items: center; gap: 10px; background: #26272b; border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
      .notif-store-logo { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; }
      .notif-store-info { flex: 1; min-width: 0; }
      .notif-store-name { font-weight: 800; font-size: 0.84rem; color: #f8fafc; }
      .store-badge { background: #16a34a; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
      .notif-store-type { font-size: 0.72rem; color: #94a3b8; }
      .notif-store-btn { background: #ea580c; color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; }

      .notif-coupon-bar { display: flex; justify-content: space-between; align-items: center; background: #3e3f46; border-radius: 6px; padding: 6px 10px; margin-top: 8px; font-size: 0.78rem; font-weight: 700; color: #fde047; }
      .coupon-copy-hint { color: #94a3b8; font-size: 0.68rem; }

      /* ── 2. WHATSAPP CHAT PREVIEW ── */
      .wa-phone-frame { background: #0b141a; border-radius: 22px; overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.35); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .wa-header { background: #1f2c34; display: flex; align-items: center; gap: 10px; padding: 12px 14px; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .wa-back-arrow { font-size: 1.1rem; }
      .wa-avatar { width: 34px; height: 34px; border-radius: 50%; background: #ea580c; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
      .wa-contact-info { flex: 1; }
      .wa-contact-name { font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 4px; }
      .wa-verified { background: #25d366; color: white; width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 900; }
      .wa-contact-status { font-size: 0.72rem; color: #8696a0; }

      .wa-chat-canvas { background: #0b141a; padding: 14px 12px 20px; display: flex; flex-direction: column; align-items: center; }
      .wa-date-pill { background: #182229; color: #8696a0; font-size: 0.7rem; font-weight: 600; padding: 4px 10px; border-radius: 8px; margin-bottom: 12px; }

      .wa-bubble { background: #005c4b; color: #e9edef; border-radius: 12px; max-width: 310px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.3); font-size: 0.84rem; line-height: 1.38; }
      .wa-header-img-wrap { width: 100%; height: 140px; overflow: hidden; }
      .wa-header-img { width: 100%; height: 100%; object-fit: cover; }
      .wa-bubble-content { padding: 10px 12px 8px; }
      .wa-title { font-size: 0.92rem; margin-bottom: 2px; }
      .wa-subtitle { font-size: 0.8rem; color: #d1d7db; margin-bottom: 6px; }
      .wa-body-text { margin-bottom: 8px; }

      .wa-deals-list { background: rgba(0,0,0,0.18); border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
      .wa-deals-head { margin-bottom: 4px; color: #25d366; }
      .wa-deal-line { font-size: 0.78rem; margin: 3px 0; }
      .wa-strike { text-decoration: line-through; opacity: 0.7; }

      .wa-coupon-box { background: rgba(255,255,255,0.12); padding: 5px 8px; border-radius: 6px; margin: 6px 0; font-weight: 600; }
      .wa-coupon-box code { color: #fde047; font-weight: 800; }

      .wa-timestamp { text-align: right; font-size: 0.68rem; color: #8696a0; margin-top: 4px; display: flex; justify-content: flex-end; align-items: center; gap: 3px; }
      .wa-ticks { color: #53bdeb; font-weight: 800; font-size: 0.75rem; }

      .wa-cta-button { border-top: 1px solid rgba(255,255,255,0.1); padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #53bdeb; font-weight: 700; cursor: pointer; text-align: center; }

      /* History Table */
      .history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .table-wrap { overflow-x: auto; }
      .table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      .history-chip { display: inline-block; background: #ffe4e6; color: #e11d48; font-size: 0.72rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
      .badge { background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
      .badge-primary { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; }
    `,
  ],
})
export class AnnouncementsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  sending = signal(false);
  testing = signal(false);
  result = signal<string | null>(null);
  testResult = signal<string | null>(null);
  audience = signal<Audience>('customers');
  recipients = signal<PickedEntity[]>([]);

  layout = signal<CampaignLayout>('product_showcase');
  previewTab = signal<'android' | 'whatsapp'>('android');

  attachedProducts = signal<CampaignProduct[]>([
    {
      id: 'prod-1',
      title: 'THE BEAR HOUSE Slim Fit Shirt',
      slug: 'shirts-1',
      price: 599,
      originalPrice: 2495,
      image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=400&q=80',
    },
    {
      id: 'prod-2',
      title: 'THE BEAR HOUSE Checked Shirt',
      slug: 'shirts-2',
      price: 599,
      originalPrice: 2495,
      image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80',
    },
    {
      id: 'prod-3',
      title: 'THE BEAR HOUSE Maroon Casual Shirt',
      slug: 'shirts-4',
      price: 579,
      originalPrice: 2495,
      image: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=400&q=80',
    },
  ]);

  attachedStore = signal<CampaignStore | null>(null);

  viaPush = true;
  viaWhatsapp = false;
  templateName = '';

  coupons = signal<Coupon[]>([]);
  templates = signal<WaTemplate[]>([]);
  approvedTemplates = computed(() => this.templates().filter((t) => t.status === 'approved'));

  loadingHistory = signal(false);
  campaigns = signal<CampaignHistoryItem[]>([]);

  readonly quickEmojis = ['📞', '🛍️', '🎉', '⚡', '🔥', '💰', '👗', '✨', '🚀', '🥰'];
  readonly quickSubtitles = ['Pick up to find the best 🥰', 'At Rs. 599!', '⚡ 15-Min Delivery', 'Flat 70% OFF Today', 'Limited Stock Deal'];

  readonly presetBanners = [
    { label: '🎉 Mega Blockbuster Sale', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80' },
    { label: '⚡ 10-Min Quick Delivery', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80' },
    { label: '👗 Fashion Fiesta', url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80' },
    { label: '🥦 Fresh Farm Groceries', url: 'https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=800&q=80' },
  ];

  form = this.fb.nonNullable.group({
    audience: ['customers'],
    title: ['📞 Shopping therapy is calling you!', Validators.required],
    subtitle: ['Pick up to find the best 🥰'],
    body: ['Handpicked trending deals from top verified stores. Tap to claim before stock runs out!'],
    link: ['/catalog'],
    image: ['https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80'],
    actionText: ['SHOP'],
    couponCode: [''],
  });

  ngOnInit(): void {
    this.loadCampaigns();
    this.api.get<Coupon[]>('/coupons').subscribe({
      next: (c) => this.coupons.set(c.filter((x) => x.active)),
      error: () => {},
    });
    this.api.get<WaTemplate[]>('/whatsapp/templates').subscribe({
      next: (t) => this.templates.set(t || []),
      error: () => {},
    });
  }

  loadCampaigns(): void {
    this.loadingHistory.set(true);
    this.api.get<CampaignHistoryItem[]>('/notifications/campaigns').subscribe({
      next: (data) => {
        this.campaigns.set(data || []);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
      },
    });
  }

  setLayout(mode: CampaignLayout): void {
    this.layout.set(mode);
    if (mode === 'product_showcase') {
      this.form.patchValue({
        title: '📞 Shopping therapy is calling you!',
        subtitle: 'Pick up to find the best 🥰',
        actionText: 'SHOP',
        link: '/catalog',
      });
    } else if (mode === 'store_spotlight') {
      this.form.patchValue({
        title: '🏪 Now Delivering Near You!',
        subtitle: 'Verified local store spotlight',
        actionText: 'VISIT STORE',
      });
    } else if (mode === 'big_picture') {
      this.form.patchValue({
        title: '🎉 Mega Blockbuster Sale Live!',
        subtitle: 'Flat 50% - 80% OFF Today',
        actionText: 'SHOP NOW',
        link: '/now',
      });
    }
  }

  insertEmoji(emoji: string): void {
    const cur = this.form.controls.title.value;
    this.form.patchValue({ title: cur ? `${cur} ${emoji}` : emoji });
  }

  setSubtitle(sub: string): void {
    this.form.patchValue({ subtitle: sub });
  }

  setBanner(url: string): void {
    this.form.patchValue({ image: url });
  }

  onCouponChange(): void {
    const code = this.form.controls.couponCode.value;
    if (code) {
      this.form.patchValue({ subtitle: `Use Code: ${code} for extra discount!` });
    }
  }

  userMapFn = (r: { _id: string; name?: string; email?: string; phone?: string }): PickedEntity => ({
    id: r._id,
    label: r.name || r.phone || r.email || 'Customer',
    sublabel: r.email || r.phone,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productMapFn = (r: any): PickedEntity => {
    const rawPrice = r.minPrice ?? r.variants?.[0]?.price ?? r.price ?? 59900;
    const price = rawPrice > 1000 ? Math.round(rawPrice / 100) : rawPrice;
    const rawCompare = r.variants?.[0]?.compareAtPrice;
    const originalPrice = rawCompare && rawCompare > 1000 ? Math.round(rawCompare / 100) : price * 2;
    const title = r.title || r.name || 'Product';
    const image = r.images?.[0] || r.variants?.[0]?.image || '';
    return {
      id: r._id,
      label: title,
      sublabel: `₹${price}${r.brand ? ' · ' + r.brand : ''}`,
      image,
      meta: {
        id: r._id,
        title,
        slug: r.slug,
        price,
        originalPrice,
        image,
      },
    };
  };

  storeMapFn = (r: { _id: string; name: string; slug: string; logo?: string; vendorType?: string }): PickedEntity => ({
    id: r._id,
    label: r.name,
    image: r.logo,
    sublabel: r.vendorType,
    meta: {
      id: r._id,
      name: r.name,
      slug: r.slug,
      logo: r.logo,
      vendorType: r.vendorType,
    },
  });

  onAudienceChange(): void {
    this.audience.set(this.form.controls.audience.value as Audience);
    this.recipients.set([]);
  }

  onProductAdded(picked: PickedEntity[]): void {
    const item = picked[0];
    if (!item || !item.meta) return;
    const meta = item.meta as { id: string; title: string; slug: string; price: number; image?: string };

    const cur = this.attachedProducts();
    if (!cur.some((p) => p.id === meta.id)) {
      this.attachedProducts.update((list) => [
        ...list,
        {
          id: meta.id,
          title: meta.title,
          slug: meta.slug,
          price: meta.price || 599,
          originalPrice: (meta.price || 599) * 2,
          image: meta.image || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=400&q=80',
        },
      ]);
    }
  }

  removeProduct(index: number): void {
    this.attachedProducts.update((list) => list.filter((_, i) => i !== index));
  }

  updateProductPrice(index: number, newPrice: number): void {
    this.attachedProducts.update((list) => {
      const copy = [...list];
      if (copy[index]) copy[index] = { ...copy[index], price: Number(newPrice) || 0 };
      return copy;
    });
  }

  updateProductOriginalPrice(index: number, newPrice: number): void {
    this.attachedProducts.update((list) => {
      const copy = [...list];
      if (copy[index]) copy[index] = { ...copy[index], originalPrice: Number(newPrice) || 0 };
      return copy;
    });
  }

  onStorePicked(picked: PickedEntity[]): void {
    const s = picked[0];
    if (!s || !s.meta) return;
    const meta = s.meta as unknown as CampaignStore;
    this.attachedStore.set(meta);
    this.form.patchValue({
      link: `/store/${meta.slug}`,
      actionText: 'VISIT STORE',
      title: `🏪 ${meta.name} is now Delivering!`,
      subtitle: `Explore ${meta.vendorType || ''} store on Marketplace`,
    });
  }

  sendTestPush(): void {
    this.testing.set(true);
    this.testResult.set(null);
    const v = this.form.getRawValue();

    const payload = {
      title: v.title,
      subtitle: v.subtitle,
      body: v.body,
      link: v.link,
      image: v.image,
      actionText: v.actionText,
      layout: this.layout(),
      products: this.layout() === 'product_showcase' ? this.attachedProducts() : [],
      storeId: this.attachedStore()?.id,
      storeSlug: this.attachedStore()?.slug,
      storeName: this.attachedStore()?.name,
      storeLogo: this.attachedStore()?.logo,
      couponCode: v.couponCode || undefined,
    };

    this.api.post<{ success: boolean; message: string; devices: number }>('/notifications/test', payload).subscribe({
      next: (res) => {
        this.testing.set(false);
        this.testResult.set(res.message || 'Test push notification dispatched to your device!');
        this.notify.push('Test Push Sent', `Dispatched to ${res.devices} device(s)`, 'success');
      },
      error: (e) => {
        this.testing.set(false);
        this.notify.push('Test Push Failed', e?.message, 'warning');
      },
    });
  }

  send(): void {
    if (this.form.invalid) return;
    this.sending.set(true);
    this.result.set(null);
    const v = this.form.getRawValue();

    const prods = this.layout() === 'product_showcase' ? this.attachedProducts() : [];
    const store = this.attachedStore();

    const payload = {
      title: v.title,
      subtitle: v.subtitle,
      body: v.body,
      link: v.link,
      image: v.image,
      actionText: v.actionText,
      layout: this.layout(),
      products: prods,
      storeId: store?.id,
      storeSlug: store?.slug,
      storeName: store?.name,
      storeLogo: store?.logo,
      couponCode: v.couponCode || undefined,
    };

    if (this.audience() === 'individual') {
      this.api
        .post<{ recipients: number; devices: number }>('/notifications/send', {
          ...payload,
          userIds: this.recipients().map((r) => r.id),
        })
        .subscribe({
          next: (r) => {
            this.sending.set(false);
            this.result.set(`🎉 Dispatched to ${r.recipients} customer(s) · ${r.devices} push device(s) queued.`);
            this.notify.push('Campaign Sent', `${r.recipients} customer(s) reached`, 'success');
            this.loadCampaigns();
          },
          error: (e) => {
            this.sending.set(false);
            this.notify.push('Broadcast Failed', e?.message, 'warning');
          },
        });
    } else {
      this.api
        .post<{ recipients: number; devices: number }>('/notifications/broadcast', {
          ...payload,
          audience: v.audience,
        })
        .subscribe({
          next: (r) => {
            this.sending.set(false);
            this.result.set(`🎉 Dispatched to ${r.recipients} user(s) · ${r.devices} push device(s) queued.`);
            this.notify.push('Broadcast Complete', `${r.recipients} users reached`, 'success');
            this.loadCampaigns();
          },
          error: (e) => {
            this.sending.set(false);
            this.notify.push('Broadcast Failed', e?.message, 'warning');
          },
        });
    }

    // Also trigger WhatsApp if selected
    if (this.viaWhatsapp) {
      this.api
        .post('/campaigns/send', {
          segment: { type: this.audience() === 'customers' ? 'all_customers' : this.audience() },
          title: v.title,
          body: v.body,
          couponCode: v.couponCode || undefined,
          image: v.image || (prods.length && prods[0] ? prods[0].image : undefined),
          channels: ['whatsapp'],
          whatsappTemplateName: this.templateName || undefined,
          layout: this.layout(),
          products: prods,
          storeSlug: store?.slug,
          storeName: store?.name,
        })
        .subscribe({
          next: () => {},
          error: () => {},
        });
    }
  }

  reuseCampaign(c: CampaignHistoryItem): void {
    this.form.patchValue({
      title: c.title,
      subtitle: c.subtitle || '',
      body: c.body || '',
      link: c.link || '/catalog',
      image: c.image || '',
      actionText: c.actionText || 'SHOP',
    });
    if (c.layout) {
      this.layout.set(c.layout as CampaignLayout);
    }
    if (c.products && c.products.length) {
      this.attachedProducts.set(c.products);
    }
    this.notify.push('Campaign Loaded', 'Template copied into form', 'info');
  }
}
