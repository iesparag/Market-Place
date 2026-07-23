import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth">
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>Create account</h1>
        <p class="muted">Shop across every vendor in one place.</p>
        @if (error()) { <div class="err">{{ error() }}</div> }
        <label class="label">Name</label>
        <input class="input" formControlName="name" placeholder="Your name" />
        @if (form.controls.name.touched && form.controls.name.invalid) { <div class="fe">Name is required</div> }
        <label class="label">Email</label>
        <input class="input" type="email" formControlName="email" placeholder="you@example.com" />
        @if (form.controls.email.touched && form.controls.email.invalid) { <div class="fe">Enter a valid email</div> }
        <label class="label">Password</label>
        <input class="input" type="password" formControlName="password" placeholder="min 8 chars" />
        @if (form.controls.password.touched && form.controls.password.invalid) { <div class="fe">At least 8 characters</div> }
        <button class="btn btn-primary" [disabled]="loading()">
          {{ loading() ? 'Creating…' : 'Create account' }}
        </button>
        <p class="muted foot">Already have an account? <a routerLink="/login">Sign in</a></p>
      </form>
    </div>
  `,
  styles: [
    `
      .auth { display: grid; place-items: center; min-height: 70vh; }
      form { width: 360px; display: grid; gap: 6px; }
      .label { margin-top: 10px; }
      .btn-primary { margin-top: 16px; }
      .foot { margin-top: 14px; text-align: center; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; font-size: 0.9rem; }
      .fe { color: var(--danger); font-size: 0.8rem; }
    `,
  ],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { name, email, password } = this.form.getRawValue();
    this.auth.register(name, email, password).subscribe({
      next: () => this.router.navigate(['/']),
      error: (e) => {
        this.error.set(e?.error?.error?.message ?? 'Registration failed');
        this.loading.set(false);
      },
    });
  }
}
