import { Directive, inject, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { selectHasPermission } from '../../store/auth/auth.selectors';

/**
 * Structural directive: *hasPermission="'payout:release'"
 * Shows the element only if the user has the permission. UX only — the API still enforces.
 */
@Directive({ selector: '[hasPermission]', standalone: true })
export class HasPermissionDirective {
  private readonly store = inject(Store);
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private sub?: Subscription;
  private shown = false;

  @Input() set hasPermission(perm: string) {
    this.sub?.unsubscribe();
    this.sub = this.store.select(selectHasPermission(perm)).subscribe((allowed) => {
      if (allowed && !this.shown) {
        this.vcr.createEmbeddedView(this.tpl);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.vcr.clear();
        this.shown = false;
      }
    });
  }
}
