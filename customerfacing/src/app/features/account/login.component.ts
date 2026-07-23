import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth">
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>Sign in</h1>
        <p class="muted">Welcome back to Marketplace.</p>
        @if (error()) { <div class="err">{{ error() }}</div> }

        <label class="label">Email</label>
        <input class="input" type="email" formControlName="email" placeholder="you@example.com" />
        @if (form.controls.email.touched && form.controls.email.invalid) { <div class="fe">Enter a valid email</div> }

        <div class="prow"><label class="label">Password</label><a routerLink="/forgot-password" class="forgot">Forgot?</a></div>
        <input class="input" type="password" formControlName="password" placeholder="••••••••" />
        @if (form.controls.password.touched && form.controls.password.invalid) { <div class="fe">Password is required</div> }

        <button class="btn btn-primary" [disabled]="loading()">{{ loading() ? 'Signing in…' : 'Sign in' }}</button>
        <p class="muted foot">New here? <a routerLink="/register">Create an account</a></p>
      </form>
    </div>
  `,
  styles: [
    `
      .auth { display: grid; place-items: center; min-height: 70vh; }
      form { width: 380px; display: grid; gap: 6px; }
      .label { margin-top: 10px; } .btn-primary { margin-top: 16px; }
      .prow { display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; }
      .forgot { font-size: 0.82rem; }
      .foot { margin-top: 14px; text-align: center; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; font-size: 0.9rem; }
      .fe { color: var(--danger); font-size: 0.8rem; }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (e) => {
        this.error.set(e?.error?.error?.message ?? (e?.status === 401 ? 'Wrong email or password' : 'Login failed'));
        this.loading.set(false);
      },
    });
  }
}
