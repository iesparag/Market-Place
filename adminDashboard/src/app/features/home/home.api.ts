import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

export interface HomeSection {
  _id: string;
  title: string;
  subtitle?: string;
  type: 'products' | 'vendors';
  source?: 'auto' | 'curated';
  sort?: string;
  category?: string;
  productIds?: string[];
  storeIds?: string[];
  limit?: number;
  enabled: boolean;
  order: number;
}
export type HomeSectionInput = Omit<HomeSection, '_id' | 'order'>;

@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly api = inject(ApiService);
  list() { return this.api.get<HomeSection[]>('/home-sections'); }
  create(body: Partial<HomeSectionInput>) { return this.api.post<HomeSection>('/home-sections', body); }
  update(id: string, body: Partial<HomeSectionInput>) { return this.api.patch<HomeSection>(`/home-sections/${id}`, body); }
  remove(id: string) { return this.api.delete<{ deleted: boolean }>(`/home-sections/${id}`); }
  reorder(ids: string[]) { return this.api.patch<{ reordered: boolean }>('/home-sections/reorder', { ids }); }
}
