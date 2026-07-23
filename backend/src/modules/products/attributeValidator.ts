import { z, type ZodTypeAny } from 'zod';
import type { AttributeDef } from '@app/shared';

/**
 * Build a Zod validator from a category's attributeSchema, then use it to validate a
 * product's `attributes` map. This is what makes the catalog "dynamic yet type-safe":
 * the schema is data (per category) but nothing invalid is ever stored.
 * See docs/03-DATA-MODEL.md.
 */
export function buildAttributeValidator(defs: AttributeDef[]): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const d of defs) {
    let field: ZodTypeAny;
    switch (d.type) {
      case 'number': {
        let n = z.number();
        if (d.min != null) n = n.min(d.min);
        if (d.max != null) n = n.max(d.max);
        field = n;
        break;
      }
      case 'boolean':
        field = z.boolean();
        break;
      case 'enum':
        field = z.enum((d.options ?? ['']) as [string, ...string[]]);
        break;
      case 'multi-enum':
        field = z.array(z.enum((d.options ?? ['']) as [string, ...string[]]));
        break;
      default:
        field = z.string();
    }
    shape[d.key] = d.required ? field : field.optional();
  }
  return z.object(shape).strict(); // reject unknown attribute keys
}
