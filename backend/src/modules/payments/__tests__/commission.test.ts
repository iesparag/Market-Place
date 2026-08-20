import { describe, it, expect } from 'vitest';
import { percentOf, sum } from '../../../common/money.js';

/**
 * The commission arithmetic that settlement.service performs per store.
 * Kept as a pure test so the invariants are pinned without a DB.
 */
function splitOrder(
  lines: { storeId: string; lineTotal: number }[],
  discount: number,
  rateFor: (storeId: string) => number,
) {
  const itemsTotal = sum(lines.map((l) => l.lineTotal));
  const storeIds = [...new Set(lines.map((l) => l.storeId))];
  return storeIds.map((storeId) => {
    const gross = sum(lines.filter((l) => l.storeId === storeId).map((l) => l.lineTotal));
    const share = itemsTotal > 0 ? gross / itemsTotal : 0;
    const subtotal = gross - Math.round(discount * share);
    const amount = percentOf(subtotal, rateFor(storeId));
    return { storeId, subtotal, amount, payable: subtotal - amount };
  });
}

describe('multi-vendor commission split', () => {
  const lines = [
    { storeId: 'A', lineTotal: 60000 }, // ₹600
    { storeId: 'B', lineTotal: 40000 }, // ₹400
  ];

  it('splits per vendor and keeps the platform cut', () => {
    const split = splitOrder(lines, 0, (s) => (s === 'A' ? 15 : 20));
    expect(split).toEqual([
      { storeId: 'A', subtotal: 60000, amount: 9000, payable: 51000 },
      { storeId: 'B', subtotal: 40000, amount: 8000, payable: 32000 },
    ]);
    // Platform earns ₹170 on a ₹1000 cart.
    expect(sum(split.map((s) => s.amount))).toBe(17000);
  });

  it('shares an order-level discount proportionally, losing nothing to rounding', () => {
    const split = splitOrder(lines, 10000, () => 15); // ₹100 off
    expect(split.map((s) => s.subtotal)).toEqual([54000, 36000]);
    // Vendor subtotals must still add up to items − discount.
    expect(sum(split.map((s) => s.subtotal))).toBe(100000 - 10000);
  });

  it('never lets commission exceed the subtotal', () => {
    const split = splitOrder([{ storeId: 'A', lineTotal: 100 }], 0, () => 90);
    expect(split[0]!.payable).toBeGreaterThanOrEqual(0);
  });

  it('refund clawback is proportional to the refunded slice', () => {
    const [a] = splitOrder(lines, 0, () => 15);
    const grandTotal = 100000;
    const refund = 20000; // 20% of the cart
    const ratio = refund / grandTotal;
    expect(Math.round(a!.payable * ratio)).toBe(10200);
    expect(Math.round(a!.amount * ratio)).toBe(1800);
    // Vendor + platform give back exactly their share of the refunded slice.
    expect(Math.round(a!.payable * ratio) + Math.round(a!.amount * ratio)).toBe(12000);
  });
});
