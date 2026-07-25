import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap } from 'rxjs';
import { ProductsApi } from '../services/products.api';
import { ProductsActions } from './products.actions';

@Injectable()
export class ProductsEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(ProductsApi);

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProductsActions.load),
      switchMap(() =>
        this.api.list().pipe(
          map((page) => ProductsActions.loadSuccess({ products: page.items })),
          catchError((e) => of(ProductsActions.loadFailure({ error: e?.message ?? 'Failed' }))),
        ),
      ),
    ),
  );
}
