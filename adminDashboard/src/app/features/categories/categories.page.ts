import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoriesApi, type Category } from './categories.api';

/** Super-admin defines + edits categories and their attribute schema (drives the dynamic product form). */
@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head"><h1>Categories</h1><p class="muted">Departments, sub-categories & their attribute schema</p></header>

    <div class="cols">
      <!-- Clean department → sub-category tree -->
      <div class="card list">
        <div class="lhead"><h3>Categories</h3><span class="muted small">department › sub-category</span></div>
        @for (row of flattened(); track row.cat._id) {
          <div class="crow" [class.dept]="row.depth === 0" [class.editing]="editingId() === row.cat._id" [style.padding-left.px]="14 + row.depth * 22">
            <div class="cinfo">
              <div class="cname">
                @if (row.depth) { <span class="tw">└</span> }{{ row.cat.name }}
                <span class="badge">{{ row.cat.appliesTo }}</span>
              </div>
              <div class="muted xs">{{ row.cat.attributeSchema.length }} attrs · axes: {{ row.cat.variantAxes.join(', ') || '—' }}</div>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="edit(row.cat)">✎ Edit</button>
          </div>
        } @empty { <p class="muted pad">No categories yet.</p> }
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="fhead">
          <h3>{{ editingId() ? 'Edit category' : 'New category' }}</h3>
          @if (editingId()) { <button type="button" class="btn btn-ghost btn-sm" (click)="cancelEdit()">Cancel</button> }
        </div>

        <label class="label">Name</label>
        <input class="input" formControlName="name" (input)="syncSlug()" />
        <div class="two">
          <div><label class="label">Slug</label><input class="input" formControlName="slug" /></div>
          <div><label class="label">Applies to</label>
            <select class="input" formControlName="appliesTo">
              <option>food</option><option>grocery</option><option>fashion</option>
              <option>generic</option><option>integration</option>
            </select>
          </div>
        </div>
        <label class="label">Parent category (optional — makes this a sub-category)</label>
        <select class="input" formControlName="parentId">
          <option value="">— none (top-level department) —</option>
          @for (c of parentOptions(); track c._id) { <option [value]="c._id">{{ c.name }}</option> }
        </select>

        <label class="label">Variant axes (comma, e.g. size,color)</label>
        <input class="input" formControlName="variantAxes" placeholder="size" />

        <div class="attrs-head">
          <span class="label">Attributes</span>
          <button type="button" class="btn btn-sm" (click)="addAttr()">+ attribute</button>
        </div>
        <div formArrayName="attrs">
          @for (a of attrs.controls; track $index) {
            <div class="attr-row" [formGroupName]="$index">
              <input class="input" formControlName="key" placeholder="key" />
              <input class="input" formControlName="label" placeholder="Label" />
              <select class="input" formControlName="type">
                <option>string</option><option>number</option><option>boolean</option><option>enum</option>
              </select>
              <input class="input" formControlName="options" placeholder="opt1,opt2 (enum)" />
              <label class="req"><input type="checkbox" formControlName="required" /> req</label>
              <button type="button" class="btn btn-ghost btn-sm" (click)="removeAttr($index)">✕</button>
            </div>
          }
        </div>

        @if (error()) { <div class="err">{{ error() }}</div> }
        <button class="btn btn-primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Saving…' : (editingId() ? 'Save changes' : 'Create category') }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1fr 1.3fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .list { padding: 0; overflow: hidden; }
      .lhead { display: flex; justify-content: space-between; align-items: baseline; padding: 16px 16px 12px; border-bottom: 1px solid var(--border); }
      .crow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
      .crow:hover { background: var(--surface-2); }
      .crow.dept { background: var(--surface-2); }
      .crow.editing { box-shadow: inset 3px 0 0 var(--brand-600); }
      .dept .cname { font-weight: 800; font-size: 0.98rem; }
      .cname { font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .tw { color: var(--text-muted); }
      .xs { font-size: 0.72rem; } .small { font-size: 0.8rem; } .pad { padding: 16px; }
      .fhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; }
      .attrs-head { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
      .attr-row { display: grid; grid-template-columns: 1fr 1fr 0.9fr 1.1fr auto auto; gap: 8px; margin-bottom: 8px; align-items: center; }
      .req { font-size: 0.8rem; white-space: nowrap; }
      .btn-primary { margin-top: 16px; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; margin-top: 10px; }
    `,
  ],
})
export class CategoriesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CategoriesApi);

  categories = signal<Category[]>([]);
  editingId = signal<string | null>(null);
  saving = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    appliesTo: ['generic', Validators.required],
    parentId: [''],
    variantAxes: [''],
    attrs: this.fb.array<ReturnType<CategoriesPage['newAttr']>>([]),
  });

  get attrs(): FormArray {
    return this.form.get('attrs') as FormArray;
  }

  /** Categories in tree order with an indent depth (handles arbitrary nesting). */
  flattened(): { cat: Category; depth: number }[] {
    const all = this.categories();
    const out: { cat: Category; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number): void => {
      for (const c of all.filter((x) => (x.parentId ?? null) === parentId)) {
        out.push({ cat: c, depth });
        walk(c._id, depth + 1);
      }
    };
    walk(null, 0);
    const shown = new Set(out.map((r) => r.cat._id));
    for (const c of all) if (!shown.has(c._id)) out.push({ cat: c, depth: 0 });
    return out;
  }

  /** Valid parents = everything except the category being edited and its descendants (no cycles). */
  parentOptions(): Category[] {
    const editing = this.editingId();
    if (!editing) return this.categories();
    const banned = new Set<string>([editing]);
    let added = true;
    while (added) {
      added = false;
      for (const c of this.categories()) {
        if (c.parentId && banned.has(c.parentId) && !banned.has(c._id)) { banned.add(c._id); added = true; }
      }
    }
    return this.categories().filter((c) => !banned.has(c._id));
  }

  ngOnInit(): void { this.load(); }
  load(): void { this.api.list().subscribe({ next: (c) => this.categories.set(c) }); }

  newAttr() {
    return this.fb.nonNullable.group({
      key: ['', Validators.required],
      label: ['', Validators.required],
      type: ['string'],
      options: [''],
      required: [false],
    });
  }
  addAttr(): void { this.attrs.push(this.newAttr()); }
  removeAttr(i: number): void { this.attrs.removeAt(i); }

  edit(cat: Category): void {
    this.editingId.set(cat._id);
    this.error.set(null);
    this.form.patchValue({
      name: cat.name, slug: cat.slug, appliesTo: cat.appliesTo,
      parentId: cat.parentId ?? '', variantAxes: cat.variantAxes.join(', '),
    });
    this.attrs.clear();
    for (const a of cat.attributeSchema) {
      const g = this.newAttr();
      g.patchValue({ key: a.key, label: a.label, type: a.type, options: (a.options ?? []).join(', '), required: !!a.required });
      this.attrs.push(g);
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ appliesTo: 'generic', parentId: '' });
    this.attrs.clear();
  }

  syncSlug(): void {
    if (this.editingId()) return; // don't rewrite slug while editing an existing category
    const name = this.form.controls.name.value;
    this.form.controls.slug.setValue(
      name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    );
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      slug: v.slug,
      appliesTo: v.appliesTo,
      ...(v.parentId ? { parentId: v.parentId } : {}),
      variantAxes: v.variantAxes ? v.variantAxes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      attributeSchema: (v.attrs as ReturnType<CategoriesPage['newAttr']>['value'][]).map((a) => ({
        key: a.key!,
        label: a.label!,
        type: a.type as 'string',
        required: !!a.required,
        options: a.options ? a.options.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        filterable: false,
        searchable: false,
      })),
    };
    const editing = this.editingId();
    const req = editing ? this.api.update(editing, body as never) : this.api.create(body as never);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Failed');
        this.saving.set(false);
      },
    });
  }
}
