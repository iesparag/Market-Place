import { Injectable, inject } from '@angular/core';
import type { Product } from '@app/shared';
import { ApiService } from '../../../core/services/api.service';

export interface ProductRow extends Product {
  _id: string;
  store?: { name: string; slug: string; status: string } | null;
}

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly api = inject(ApiService);

  list() {
    return this.api.get<ProductRow[]>('/products');
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
