import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { AttributeDef } from '@app/shared';
import { ProductsApi } from '../services/products.api';
import { CategoriesApi, type Category } from '../../categories/categories.api';
import { ApiService } from '../../../core/services/api.service';
import { AuthFacade } from '../../../store/auth/auth.facade';

/**
 * The dynamic product editor (the core "dynamic + type-safe" UI):
 * pick a category → attribute fields render from its schema → variant matrix (with stock/price)
 * from its variantAxes → modifier groups. Prices entered in ₹, converted to paise on save.
 */
@Component({
  selector: 'app-product-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="head">
      <div><h1>{{ id ? 'Edit' : 'New' }} product</h1><p class="muted">Category schema drives the fields</p></div>
      <a class="btn btn-ghost" routerLink="/products">← Back</a>
    </header>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <div class="card">
        @if (isAdmin() && !id) {
          <label class="label">Vendor / Store <span class="req">*</span></label>
          <select class="input" formControlName="storeId">
            <option value="">— select vendor —</option>
            @for (s of stores(); track s._id) { <option [value]="s._id">{{ s.name }}</option> }
          </select>
          <p class="muted small">Adding this product on behalf of the selected vendor.</p>
        }

        <label class="label">Category</label>
        <div class="catpath">
          @for (lvl of levels(); track lvl) {
            <select class="input" [value]="catPath()[lvl] ?? ''" (change)="selectLevel(lvl, pick($event))">
              <option value="">{{ lvl === 0 ? '— department —' : '— sub-category —' }}</option>
              @for (c of levelOptions(lvl); track c._id) { <option [value]="c._id">{{ c.name }}</option> }
            </select>
          }
        </div>
        @if (catPath().length) { <div class="muted small pathlbl">📁 {{ pathLabel() }}</div> }

        <div class="two">
          <div><label class="label">Title</label><input class="input" formControlName="title" (input)="syncSlug()" /></div>
          <div><label class="label">Slug</label><input class="input" formControlName="slug" /></div>
        </div>
        <label class="label">Description</label>
        <textarea class="input" rows="2" formControlName="description"></textarea>

        <label class="label">Food type <span class="muted small">(India veg / non-veg marker)</span></label>
        <select class="input" formControlName="foodType">
          <option value="">— not applicable (non-food) —</option>
          <option value="veg">🟢 Veg</option>
          <option value="non_veg">🔺 Non-veg</option>
          <option value="egg">🟠 Contains egg</option>
        </select>

        <label class="label">Q&amp;A (customer questions)</label>
        <label class="chk"><input type="checkbox" formControlName="faqEnabled" /> Show Q&amp;A section on this product</label>
        <label class="chk"><input type="checkbox" formControlName="allowBuyerReplies" /> Allow buyers to answer questions</label>

        <label class="label">Images</label>
        <div class="imgs">
          @for (url of images(); track url) {
            <div class="thumb"><img [src]="url" alt="" /><button type="button" (click)="removeImage(url)">✕</button></div>
          }
          <label class="upload">
            {{ uploading() ? '…' : '+ Upload' }}
            <input type="file" accept="image/*" (change)="onFile($event)" hidden />
          </label>
        </div>
      </div>

      @if (selected(); as cat) {
        @if (cat.attributeSchema.length) {
          <div class="card">
            <h3>Attributes <span class="muted small">({{ cat.name }})</span></h3>
            <div class="attrs" formGroupName="attributes">
              @for (a of cat.attributeSchema; track a.key) {
                <div class="attr">
                  <label class="label">{{ a.label }} @if (a.required) { <span class="req">*</span> }</label>
                  @switch (a.type) {
                    @case ('boolean') { <label class="chk"><input type="checkbox" [formControlName]="a.key" /> Yes</label> }
                    @case ('number') { <input class="input" type="number" [formControlName]="a.key" /> }
                    @case ('enum') {
                      <select class="input" [formControlName]="a.key">
                        <option value="">—</option>
                        @for (o of a.options ?? []; track o) { <option [value]="o">{{ o }}</option> }
                      </select>
                    }
                    @default { <input class="input" [formControlName]="a.key" /> }
                  }
                </div>
              }
            </div>
          </div>
        }

        <div class="card">
          <div class="row-head"><h3>Variants</h3><button type="button" class="btn btn-sm" (click)="addVariant()">+ variant</button></div>

          @if (cat.variantAxes.length) {
            <div class="vgen">
              <div class="genrow">
                @for (ax of cat.variantAxes; track ax) {
                  <div class="genfield">
                    <label class="label">{{ ax }} <span class="muted small">(comma)</span></label>
                    <input class="input" [value]="axisInput()[ax] ?? ''" (input)="setAxis(ax, pick($event))" [placeholder]="axPlaceholder(ax)" />
                  </div>
                }
                <div class="genfield sm"><label class="label">Price ₹</label><input class="input" type="number" [value]="genPrice()" (input)="genPrice.set(+pick($event))" /></div>
                <div class="genfield sm"><label class="label">Stock</label><input class="input" type="number" [value]="genStock()" (input)="genStock.set(+pick($event))" /></div>
                <button type="button" class="btn btn-primary gen" (click)="generateVariants()">✨ Generate</button>
                @if (variants.length) { <button type="button" class="btn btn-ghost gen" (click)="clearVariants()">Clear</button> }
              </div>
              <p class="muted small">Har axis ki values comma se daalo (jaise <b>S, M, L</b> · <b>Blue, White</b>) → saare combinations rows ban jaayenge. Price/stock/SKU baad mein har row pe edit ho sakta hai. Combos badalne se pehle <b>Clear</b> karo.</p>
            </div>
          }

          <div class="vhead" [style.grid-template-columns]="varCols()">
            @for (ax of cat.variantAxes; track ax) { <span>{{ ax }}</span> }
            <span>SKU</span><span>Price ₹</span><span>Stock</span><span></span>
          </div>
          <div formArrayName="variants">
            @for (v of variants.controls; track v; let i = $index) {
              <div class="vrow" [formGroupName]="i" [style.grid-template-columns]="varCols()">
                <div class="opts" formGroupName="opts">
                  @for (ax of cat.variantAxes; track ax) { <input class="input" [formControlName]="ax" [placeholder]="ax" /> }
                </div>
                <input class="input" formControlName="sku" placeholder="sku" />
                <input class="input" type="number" formControlName="price" />
                <input class="input" type="number" formControlName="stock" />
                <button type="button" class="btn btn-ghost btn-sm" (click)="removeVariant(i)">✕</button>
              </div>
            }
          </div>
          @if (!variants.length) { <p class="muted">Add at least one variant (ya upar se Generate karo).</p> }
        </div>

        <div class="card">
          <div class="row-head"><h3>Modifier groups <span class="muted small">(e.g. cheese)</span></h3>
            <button type="button" class="btn btn-sm" (click)="addGroup()">+ group</button></div>
          <div formArrayName="modifierGroups">
            @for (g of groups.controls; track g; let gi = $index) {
              <div class="group" [formGroupName]="gi">
                <div class="grow">
                  <input class="input" formControlName="name" placeholder="Group name (Cheese)" />
                  <select class="input sel" formControlName="selection"><option value="single">single</option><option value="multi">multi</option></select>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="removeGroup(gi)">remove group</button>
                </div>
                <div formArrayName="options">
                  @for (o of groupOptions(gi).controls; track o; let oi = $index) {
                    <div class="orow" [formGroupName]="oi">
                      <input class="input" formControlName="name" placeholder="Option (Extra Cheese)" />
                      <input class="input" type="number" formControlName="priceDelta" placeholder="+₹" />
                      <button type="button" class="btn btn-ghost btn-sm" (click)="removeOption(gi, oi)">✕</button>
                    </div>
                  }
                </div>
                <button type="button" class="btn btn-sm" (click)="addOption(gi)">+ option</button>
              </div>
            }
          </div>
        </div>
      }

      @if (error()) { <div class="card err">{{ error() }}</div> }
      <div class="actions">
        <button class="btn btn-primary" [disabled]="form.invalid || saving() || !variants.length">
          {{ saving() ? 'Saving…' : (id ? 'Save changes' : 'Create product') }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .card { margin-bottom: 18px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; } .small { font-size: 0.8rem; font-weight: 400; }
      .catpath { display: flex; flex-wrap: wrap; gap: 8px; } .catpath .input { max-width: 220px; }
      .pathlbl { margin-top: 6px; font-weight: 600; }
      .req { color: var(--danger); }
      .attrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
      .chk { display: inline-flex; align-items: center; gap: 6px; padding-top: 8px; }
      .row-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .vhead, .vrow { display: grid; gap: 8px; align-items: center; }
      .vhead { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 6px; }
      .vhead span { padding: 0 2px; }
      .vrow { margin-bottom: 8px; }
      .vrow .opts { display: contents; }
      .vgen { background: var(--surface-2, #f6f7fb); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px; }
      .genrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
      .genfield { flex: 1; min-width: 130px; } .genfield.sm { flex: 0 0 90px; min-width: 0; } .genfield .label { margin-top: 0; }
      .gen { height: 38px; white-space: nowrap; }
      .group { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px; }
      .grow { display: flex; gap: 8px; margin-bottom: 8px; } .sel { max-width: 120px; }
      .orow { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; margin-bottom: 6px; }
      .actions { position: sticky; bottom: 0; padding: 12px 0; }
      .err { background: var(--danger-bg); color: var(--danger); }
      .imgs { display: flex; gap: 10px; flex-wrap: wrap; }
      .thumb { position: relative; width: 72px; height: 72px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .thumb button { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 11px; }
      .upload { width: 72px; height: 72px; border: 1px dashed var(--border); border-radius: var(--radius-sm);
                display: grid; place-items: center; cursor: pointer; color: var(--text-muted); font-size: 0.8rem; }
    `,
  ],
})
export class ProductEditPage implements OnInit {
  @Input() id = '';

  private readonly fb = inject(FormBuilder);
  private readonly productsApi = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);

  categories = signal<Category[]>([]);
  selectedId = signal('');
  selected = computed(() => this.categories().find((c) => c._id === this.selectedId()) ?? null);
  images = signal<string[]>([]);
  uploading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  // Variant matrix generator (comma-separated values per axis → all combinations).
  axisInput = signal<Record<string, string>>({});
  genPrice = signal(0);
  genStock = signal(0);

  // Admin-on-behalf-of-vendor + hierarchical category picker.
  isAdmin = signal(false);
  stores = signal<{ _id: string; name: string }[]>([]);
  catPath = signal<string[]>([]); // department → sub → sub-sub category ids

  pick(e: Event): string { return (e.target as HTMLSelectElement).value; }

  /** Options for a cascading level: roots at level 0, else children of the level above. */
  levelOptions(level: number): Category[] {
    if (level === 0) return this.categories().filter((c) => !c.parentId);
    const parentId = this.catPath()[level - 1];
    return parentId ? this.categories().filter((c) => c.parentId === parentId) : [];
  }
  /** Which cascading selects to render (stop when a level has no options). */
  levels(): number[] {
    const out: number[] = [];
    for (let i = 0; i < 8 && this.levelOptions(i).length; i++) out.push(i);
    return out;
  }
  pathLabel(): string {
    const byId = new Map(this.categories().map((c) => [c._id, c.name]));
    return this.catPath().map((id) => byId.get(id) ?? '').filter(Boolean).join(' › ');
  }
  selectLevel(level: number, id: string): void {
    const path = this.catPath().slice(0, level);
    if (id) path[level] = id;
    this.catPath.set(path);
    const deepest = path.length ? path[path.length - 1]! : '';
    this.form.controls.categoryId.setValue(deepest);
    this.selectedId.set(deepest);
    this.rebuildAttributes();
    this.axisInput.set({}); // reset the comma-generator for the new category's axes
    if (deepest && !this.variants.length) this.addVariant();
  }
  /** Edit mode: rebuild the department→leaf path by walking the category's ancestors. */
  private setPathFromCategory(categoryId: string): void {
    const byId = new Map(this.categories().map((c) => [c._id, c]));
    const path: string[] = [];
    let cur = byId.get(categoryId);
    while (cur) { path.unshift(cur._id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    this.catPath.set(path);
  }

  onFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.upload<{ url: string }>('/media/upload', file).subscribe({
      next: (r) => { this.images.update((imgs) => [...imgs, r.url]); this.uploading.set(false); },
      error: () => this.uploading.set(false),
    });
  }
  removeImage(url: string): void {
    this.images.update((imgs) => imgs.filter((u) => u !== url));
  }

  form = this.fb.nonNullable.group({
    storeId: [''],
    foodType: [''],
    faqEnabled: [true],
    allowBuyerReplies: [true],
    categoryId: ['', Validators.required],
    title: ['', Validators.required],
    slug: ['', Validators.required],
    description: [''],
    attributes: this.fb.group({}),
    variants: this.fb.array<ReturnType<ProductEditPage['newVariant']>>([]),
    modifierGroups: this.fb.array<ReturnType<ProductEditPage['newGroup']>>([]),
  });

  get variants(): FormArray { return this.form.get('variants') as FormArray; }
  get groups(): FormArray { return this.form.get('modifierGroups') as FormArray; }
  groupOptions(i: number): FormArray { return this.groups.at(i).get('options') as FormArray; }

  ngOnInit(): void {
    this.categoriesApi.list().subscribe({
      next: (c) => {
        this.categories.set(c);
        if (this.id) this.loadProduct();
      },
    });
    // Platform users (admin/super_admin) may add a product for any vendor → load stores.
    this.auth.user$.subscribe((u) => {
      const admin = !!u && u.role !== 'vendor' && u.role !== 'vendor_staff';
      this.isAdmin.set(admin);
      if (admin) this.api.get<{ _id: string; name: string }[]>('/stores').subscribe({ next: (s) => this.stores.set(s) });
    });
  }

  onCategory(): void {
    const id = this.form.controls.categoryId.value;
    this.selectedId.set(id);
    this.rebuildAttributes();
    if (!this.variants.length) this.addVariant();
  }

  private rebuildAttributes(): void {
    const grp = this.fb.group({});
    for (const a of this.selected()?.attributeSchema ?? []) {
      grp.addControl(a.key, this.fb.nonNullable.control(a.type === 'boolean' ? false : ''));
    }
    this.form.setControl('attributes', grp);
  }

  newVariant() {
    const opts = this.fb.group({});
    for (const ax of this.selected()?.variantAxes ?? []) opts.addControl(ax, this.fb.nonNullable.control(''));
    return this.fb.nonNullable.group({
      opts,
      sku: ['', Validators.required],
      price: [0, Validators.min(0)],
      stock: [0, Validators.min(0)],
    });
  }
  addVariant(): void { this.variants.push(this.newVariant()); }
  removeVariant(i: number): void { this.variants.removeAt(i); }
  clearVariants(): void { this.variants.clear(); this.error.set(null); }

  // ── Variant matrix generator ───────────────────────────────────────────────
  /** Grid columns for the variant table: one per axis + SKU + Price + Stock + remove-btn. */
  varCols(): string {
    const n = this.selected()?.variantAxes.length ?? 0;
    return `${'minmax(0,1fr) '.repeat(n)}1.4fr 0.9fr 0.7fr 34px`;
  }
  setAxis(ax: string, value: string): void {
    this.axisInput.update((m) => ({ ...m, [ax]: value }));
  }
  axPlaceholder(ax: string): string {
    if (ax === 'size') return 'S, M, L, XL';
    if (ax === 'color') return 'Blue, White, Black';
    if (ax === 'weight') return '500g, 1kg, 5kg';
    if (ax === 'volume') return '1L, 5L';
    return 'value1, value2';
  }
  /** Build every combination of the comma-separated axis values as variant rows. */
  generateVariants(): void {
    const axes = this.selected()?.variantAxes ?? [];
    if (!axes.length) { this.addVariant(); return; }
    const lists = axes.map((ax) => (this.axisInput()[ax] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    if (lists.some((l) => !l.length)) {
      this.error.set('Har axis ke liye comma-separated values daalo (jaise S, M, L).');
      return;
    }
    this.error.set(null);
    // Drop the single blank auto-added row (from category select) before generating.
    for (let i = this.variants.length - 1; i >= 0; i--) {
      const row = this.variants.at(i);
      const opts = row.get('opts')!.value as Record<string, string>;
      if (Object.values(opts).every((v) => !v) && !row.get('sku')!.value) this.variants.removeAt(i);
    }
    const existing = new Set(
      this.variants.controls.map((c) => this.comboKey(c.get('opts')!.value as Record<string, string>)),
    );
    const base = (this.form.controls.slug.value || 'sku').trim();
    let added = 0;
    for (const combo of this.cartesian(lists)) {
      const optionValues: Record<string, string> = {};
      axes.forEach((ax, i) => (optionValues[ax] = combo[i]!));
      const key = this.comboKey(optionValues);
      if (existing.has(key)) continue;
      const row = this.newVariant();
      row.get('opts')!.patchValue(optionValues);
      row.patchValue({
        sku: `${base}-${combo.join('-')}`.toLowerCase().replace(/\s+/g, ''),
        price: this.genPrice(),
        stock: this.genStock(),
      });
      this.variants.push(row);
      existing.add(key);
      added++;
    }
    if (!added) this.error.set('Ye combinations pehle se maujood hain. Purane combos badalne ke liye pehle "Clear" karo, phir Generate.');
  }
  private comboKey(opts: Record<string, string>): string { return Object.values(opts).join('|'); }
  private cartesian(lists: string[][]): string[][] {
    return lists.reduce<string[][]>((acc, list) => acc.flatMap((combo) => list.map((v) => [...combo, v])), [[]]);
  }

  newGroup() {
    return this.fb.nonNullable.group({
      name: ['', Validators.required],
      selection: ['single'],
      options: this.fb.array<ReturnType<ProductEditPage['newOption']>>([this.newOption()]),
    });
  }
  newOption() {
    return this.fb.nonNullable.group({ name: ['', Validators.required], priceDelta: [0] });
  }
  addGroup(): void { this.groups.push(this.newGroup()); }
  removeGroup(i: number): void { this.groups.removeAt(i); }
  addOption(gi: number): void { this.groupOptions(gi).push(this.newOption()); }
  removeOption(gi: number, oi: number): void { this.groupOptions(gi).removeAt(oi); }

  syncSlug(): void {
    this.form.controls.slug.setValue(
      this.form.controls.title.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    );
  }

  private loadProduct(): void {
    this.productsApi.getOne(this.id).subscribe({
      next: (p) => {
        const categoryId = String((p as unknown as { categoryId: string }).categoryId);
        this.selectedId.set(categoryId);
        this.setPathFromCategory(categoryId);
        this.form.patchValue({
          categoryId,
          title: p.title,
          slug: p.slug,
          description: p.description,
          foodType: (p as unknown as { foodType?: string }).foodType ?? '',
          faqEnabled: (p as unknown as { faqEnabled?: boolean }).faqEnabled !== false,
          allowBuyerReplies: (p as unknown as { allowBuyerReplies?: boolean }).allowBuyerReplies !== false,
        });
        this.images.set((p.images as string[]) ?? []);
        this.rebuildAttributes();
        this.form.get('attributes')!.patchValue(p.attributes as Record<string, unknown>);
        this.variants.clear();
        for (const v of p.variants) {
          const row = this.newVariant();
          row.patchValue({ sku: v.sku, price: v.price / 100, stock: v.stock });
          row.get('opts')!.patchValue(v.optionValues as Record<string, string>);
          this.variants.push(row);
        }
      },
    });
  }

  submit(): void {
    if (this.form.invalid || !this.variants.length) return;
    if (this.isAdmin() && !this.id && !this.form.controls.storeId.value) {
      this.error.set('Select the vendor / store this product belongs to.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body = {
      // Admin-on-behalf: send the chosen store; vendors are pinned server-side and this is ignored.
      ...(this.isAdmin() && !this.id && v.storeId ? { storeId: v.storeId } : {}),
      ...(v.foodType ? { foodType: v.foodType } : {}),
      faqEnabled: v.faqEnabled,
      allowBuyerReplies: v.allowBuyerReplies,
      categoryId: v.categoryId,
      title: v.title,
      slug: v.slug,
      description: v.description,
      images: this.images(),
      attributes: this.coerceAttrs(v.attributes as Record<string, unknown>),
      variants: (v.variants as { opts: Record<string, string>; sku: string; price: number; stock: number }[]).map((r) => ({
        sku: r.sku,
        optionValues: r.opts,
        price: Math.round(r.price * 100),
        currency: 'INR',
        stock: r.stock,
      })),
      modifierGroups: (v.modifierGroups as { name: string; selection: string; options: { name: string; priceDelta: number }[] }[]).map((g) => ({
        name: g.name,
        selection: g.selection as 'single',
        required: false,
        options: g.options.map((o) => ({ name: o.name, priceDelta: Math.round(o.priceDelta * 100) })),
      })),
      status: 'active',
      visibility: 'public',
    };
    const req = this.id
      ? this.productsApi.update(this.id, body as never)
      : this.productsApi.create(body as never);
    req.subscribe({
      next: () => this.router.navigate(['/products']),
      error: (e) => {
        this.error.set(e?.message ?? e?.details?.formErrors?.join(', ') ?? 'Save failed');
        this.saving.set(false);
      },
    });
  }

  /** Convert attribute values to their declared types before sending. */
  private coerceAttrs(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const a of this.selected()?.attributeSchema ?? []) {
      const val = raw[a.key];
      if (val === '' || val == null) continue;
      out[a.key] = a.type === 'number' ? Number(val) : a.type === 'boolean' ? !!val : val;
    }
    return out;
  }
}
