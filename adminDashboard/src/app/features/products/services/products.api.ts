import { Injectable, inject } from '@angular/core';
import type { Product } from '@app/shared';
import { ApiService } from '../../../core/services/api.service';

export interface ProductRow extends Product {
  _id: string;
  code?: string;
  store?: { name: string; slug: string; status: string } | null;
}
export interface ProductPage {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly api = inject(ApiService);

  list(params: { page?: number; limit?: number; q?: string; category?: string } = {}) {
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = v;
    return this.api.get<ProductPage>('/products', clean);
  }
  getOne(id: string) {
    return this.api.get<ProductRow>(`/products/${id}`);
  }
  create(body: Product) {
    return this.api.post<ProductRow>('/products', body);
  }
  update(id: string, body: Partial<Product>) {
    return this.api.patch<ProductRow>(`/products/${id}`, body);
  }
  remove(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/products/${id}`);
  }
  publish(id: string, active: boolean) {
    return this.api.patch<ProductRow>(`/products/${id}/publish`, { active });
  }
}
