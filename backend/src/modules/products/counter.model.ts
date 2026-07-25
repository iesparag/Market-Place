import { Schema, model } from 'mongoose';

/** Atomic named counters (e.g. product codes). One doc per sequence name. */
const counterSchema = new Schema({
  _id: { type: String, required: true }, // sequence name, e.g. "product"
  seq: { type: Number, default: 0 },
});

export const Counter = model('Counter', counterSchema);

/** Atomically increment and return the next value of a named sequence. */
export async function nextSeq(name: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc!.seq;
}

/** Human-friendly, unique product code shown to customers + admin, e.g. MP-000123. */
export function formatProductCode(n: number): string {
  return `MP-${String(n).padStart(6, '0')}`;
}
