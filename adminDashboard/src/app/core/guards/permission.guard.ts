import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs';
import { selectHasPermission } from '../../store/auth/auth.selectors';

/** permissionGuard('product:read') — block route if the user lacks the permission. */
export const permissionGuard = (perm: string): CanMatchFn => {
  return () => {
    const store = inject(Store);
    const router = inject(Router);
    return store.select(selectHasPermission(perm)).pipe(
      take(1),
      map((allowed) => allowed || router.createUrlTree(['/'])),
    );
  };
};
