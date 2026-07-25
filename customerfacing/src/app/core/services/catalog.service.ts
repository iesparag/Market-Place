import { Injectable, inject } from '@angular/core';
import type { Product, Variant, ModifierGroup } from '@app/shared';
import { ApiService } from './api.service';

export interface CatNode {
  _id: string;
  name: string;
  slug: string;
  children: CatNode[];
}

export interface Banner {
  _id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  ctaText: string;
  link: string;
  bg: string;
}

export interface CatalogProduct extends Product {
  _id: string;
  code?: string;
  storeId: string;
  store?: { name: string; slug: string } | null;
  variants: Variant[];
  modifierGroups: ModifierGroup[];
  ratingAvg?: number;
  ratingCount?: number;
  related?: CatalogProduct[];
  categoryName?: string;
  foodType?: 'veg' | 'non_veg' | 'egg';
  attributeDefs?: { key: string; label: string; type: string; required?: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(ApiService);

  listProducts(params?: { q?: string; category?: string; sort?: string; priceMin?: number; priceMax?: number; ratingMin?: number; veg?: boolean; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.category) qs.set('category', params.category);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.priceMin != null) qs.set('priceMin', String(params.priceMin));
    if (params?.priceMax != null) qs.set('priceMax', String(params.priceMax));
    if (params?.ratingMin != null) qs.set('ratingMin', String(params.ratingMin));
    if (params?.veg) qs.set('veg', 'true');
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get<CatalogProduct[]>(`/catalog/products${suffix}`);
  }

  getProduct(slug: string) {
    return this.api.get<CatalogProduct>(`/catalog/products/${slug}`);
  }
  getCategories() {
    return this.api.get<{ name: string; slug: string; appliesTo: string }[]>('/catalog/categories');
  }
  getCategoryTree() {
    return this.api.get<CatNode[]>('/catalog/category-tree');
  }
  getBanners() {
    return this.api.get<Banner[]>('/banners');
  }
  getStore(slug: string) {
    return this.api.get<{ store: StoreProfile; products: CatalogProduct[]; categoryTree: CatNode[] }>(`/catalog/stores/${slug}`);
  }
  getStores() {
    return this.api.get<Vendor[]>('/catalog/stores');
  }
  /** Admin-composed landing page: ordered sections, each already resolved to its items. */
  getHome() {
    return this.api.get<HomeSectionView[]>('/catalog/home');
  }
  /** Typeahead: matching products + stores for the header search dropdown. */
  suggest(q: string) {
    return this.api.get<Suggestion>(`/search/suggest?q=${encodeURIComponent(q)}`);
  }
}

export interface Suggestion {
  products: { _id: string; title: string; slug: string; code?: string; image?: string; minPrice: number; storeName?: string }[];
  stores: { _id: string; name: string; slug: string; logo?: string }[];
}

export interface HomeSectionView {
  _id: string;
  title: string;
  subtitle?: string;
  type: 'products' | 'vendors';
  sort?: string;
  category?: string;
  items: CatalogProduct[] | Vendor[];
}

export interface StoreProfile {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  banner?: string;
  coverImages?: string[];
  vendorType?: string;
  legalName?: string;
  gstin?: string;
  establishedYear?: number;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: { line1?: string; city?: string; state?: string; pincode?: string };
  social?: { instagram?: string; facebook?: string; twitter?: string };
  ratingAvg?: number;
  ratingCount?: number;
}

export interface Vendor {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  vendorType: string;
  logo?: string;
  ratingAvg?: number;
  ratingCount?: number;
  productCount: number;
}
