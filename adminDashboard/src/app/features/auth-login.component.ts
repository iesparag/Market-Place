import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthFacade } from '../store/auth/auth.facade';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="login">
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="brand">
          <span class="dot"></span>
          Marketplace
        </div>
        <h1>Welcome back</h1>
        <p class="muted sub">Sign in to your dashboard</p>

        <label class="label">Email</label>
        <input class="input" formControlName="email" placeholder="you@example.com" type="email" />

        <label class="label">Password</label>
        <input class="input" formControlName="password" placeholder="••••••••" type="password" />

        <button class="btn btn-primary" [disabled]="form.invalid">Sign in</button>
      </form>
    </div>
  `,
  styles: [
    `
      .login {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 20px;
        background: var(--brand-gradient);
      }
      form {
        width: 360px;
        display: grid;
        gap: 6px;
        box-shadow: var(--shadow-lg);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        margin-bottom: 8px;
      }
      .dot {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        background: var(--brand-gradient);
      }
      .sub {
        margin: 0 0 14px;
      }
      .label {
        margin-top: 10px;
      }
      .btn-primary {
        margin-top: 18px;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthFacade);

  form = this.fb.nonNullable.group({
    email: ['admin@marketplace.local', [Validators.required, Validators.email]],
    password: ['admin1234', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid) return;
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password);
  }
}
