import { Component, Input } from '@angular/core';
import type { CatalogProduct } from '../core/services/catalog.service';

export type FoodType = 'veg' | 'non_veg' | 'egg';

/** Resolve a product's veg marker: first-class foodType, else legacy boolean `veg` attribute. */
export function foodTypeOf(p: Pick<CatalogProduct, 'foodType' | 'attributes'>): FoodType | null {
  if (p.foodType) return p.foodType;
  const veg = (p.attributes as Record<string, unknown> | undefined)?.['veg'];
  return typeof veg === 'boolean' ? (veg ? 'veg' : 'non_veg') : null;
}

/** India FSSAI veg / non-veg / egg symbol — bordered square with a dot (veg) or triangle (non-veg). */
@Component({
  selector: 'app-veg-mark',
  standalone: true,
  template: `<span class="mark" [class]="type" [style.--s.px]="size" [title]="label"><span class="inner"></span></span>`,
  styles: [
    `
      .mark { display: inline-grid; place-items: center; width: var(--s, 16px); height: var(--s, 16px); border: 1.5px solid; border-radius: 3px; box-sizing: border-box; flex: none; }
      .veg { border-color: #0a8f3c; }
      .veg .inner { width: 55%; height: 55%; border-radius: 50%; background: #0a8f3c; }
      .non_veg { border-color: #c0392b; }
      .non_veg .inner { width: 0; height: 0; border-left: calc(var(--s, 16px) * 0.28) solid transparent; border-right: calc(var(--s, 16px) * 0.28) solid transparent; border-bottom: calc(var(--s, 16px) * 0.5) solid #c0392b; }
      .egg { border-color: #d97706; }
      .egg .inner { width: 55%; height: 55%; border-radius: 50%; background: #d97706; }
    `,
  ],
})
export class VegMarkComponent {
  @Input() type: FoodType = 'veg';
  @Input() size = 16;
  get label(): string {
    return this.type === 'veg' ? 'Veg' : this.type === 'non_veg' ? 'Non-veg' : 'Contains egg';
  }
}
