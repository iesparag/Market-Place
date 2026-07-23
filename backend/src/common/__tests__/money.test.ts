import { describe, it, expect } from 'vitest';
import { toMinor, toMajor, sum, percentOf } from '../money.js';

describe('money helpers (integer minor units)', () => {
  it('converts rupees ↔ paise without float drift', () => {
    expect(toMinor(449)).toBe(44900);
    expect(toMinor(9.99)).toBe(999);
    expect(toMajor(44900)).toBe(449);
  });

  it('sums line totals', () => {
    expect(sum([44900, 9000, 3000])).toBe(56900);
    expect(sum([])).toBe(0);
  });

  it('computes commission (percent of minor units, rounded)', () => {
    // 15% of ₹539.00 = ₹80.85
    expect(percentOf(53900, 15)).toBe(8085);
    // vendor payable = subtotal − commission
    expect(53900 - percentOf(53900, 15)).toBe(45815);
    expect(percentOf(0, 15)).toBe(0);
  });

  it('reprices a cart line = (variant + Σ modifiers) × qty', () => {
    const variant = 44900;
    const modifiers = [9000, 3000]; // double cheese + olives
    const qty = 2;
    const unit = variant + sum(modifiers);
    expect(unit).toBe(56900);
    expect(unit * qty).toBe(113800); // ₹1138
  });
});
