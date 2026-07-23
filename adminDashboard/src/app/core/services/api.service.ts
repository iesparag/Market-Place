import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import type { ApiResponse } from '@app/shared';
import { environment } from '../../../environments/environment';

/** Thin typed wrapper over HttpClient. The envelope is unwrapped here + in the error interceptor. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, params?: Record<string, string | number>): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: params as never })
      .pipe(map(unwrap));
  }
  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map(unwrap));
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map(unwrap));
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`).pipe(map(unwrap));
  }
  upload<T>(path: string, file: File): Observable<T> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, fd).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiResponse<T>): T {
  if (res.ok) return res.data;
  throw res.error;
}
