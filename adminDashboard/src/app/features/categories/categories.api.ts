import { Injectable, inject } from '@angular/core';
import type { AttributeDef } from '@app/shared';
import { ApiService } from '../../core/services/api.service';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  appliesTo: string;
  attributeSchema: AttributeDef[];
  variantAxes: string[];
}

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(ApiService);
  list() {
    return this.api.get<Category[]>('/categories');
  }
  create(body: Omit<Category, '_id'>) {
    return this.api.post<Category>('/categories', body);
  }
  update(id: string, body: Partial<Omit<Category, '_id'>>) {
    return this.api.patch<Category>(`/categories/${id}`, body);
  }
  remove(id: string) {
    return this.api.delete<{ deleted: true }>(`/categories/${id}`);
  }
}
