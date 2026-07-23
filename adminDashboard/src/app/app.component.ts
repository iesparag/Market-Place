import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from './store/auth/auth.actions';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit {
  private readonly store = inject(Store);

  ngOnInit(): void {
    // Restore session (token in storage) → load /me + navigation.
    this.store.dispatch(AuthActions.bootstrap());
  }
}
