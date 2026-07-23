import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth">
      <div class="card">
        <h1>Reset password</h1>

        @if (step() === 1) {
          <p class="muted">Enter your email and we'll send a reset code.</p>
          @if (msg()) { <div class="err">{{ msg() }}</div> }
          <form [formGroup]="emailForm" (ngSubmit)="sendCode()">
            <label class="label">Email</label>
            <input class="input" type="email" formControlName="email" placeholder="you@example.com" />
            @if (emailForm.controls.email.touched && emailForm.controls.email.invalid) { <div class="fe">Enter a valid email</div> }
            <button class="btn btn-primary" [disabled]="emailForm.invalid || loading()">{{ loading() ? 'Sending…' : 'Send reset code' }}</button>
          </form>
        } @else {
          <p class="muted">We sent a 6-digit code to <b>{{ emailForm.controls.email.value }}</b> (dev: check backend console).</p>
          @if (msg()) { <div class="err">{{ msg() }}</div> }
          <form [formGroup]="resetForm" (ngSubmit)="reset()">
            <label class="label">Reset code</label>
            <input class="input" formControlName="code" placeholder="6-digit code" maxlength="6" />
            @if (resetForm.controls.code.touched && resetForm.controls.code.invalid) { <div class="fe">6-digit code required</div> }
            <label class="label">New password</label>
            <input class="input" type="password" formControlName="newPassword" placeholder="min 8 chars" />
            @if (resetForm.controls.newPassword.touched && resetForm.controls.newPassword.invalid) { <div class="fe">At least 8 characters</div> }
            <button class="btn btn-primary" [disabled]="resetForm.invalid || loading()">{{ loading() ? 'Resetting…' : 'Reset password' }}</button>
          </form>
        }

        <p class="muted foot">Remembered? <a routerLink="/login">Back to sign in</a></p>
      </div>
    </div>
  `,
  styles: [
    `
      .auth { display: grid; place-items: center; min-height: 70vh; }
      .card { width: 380px; }
      form { display: grid; gap: 6px; } .label { margin-top: 10px; } .btn-primary { margin-top: 16px; }
      .foot { margin-top: 14px; text-align: center; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; font-size: 0.9rem; margin: 8px 0; }
      .fe { color: var(--danger); font-size: 0.8rem; }
    `,
  ],
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  step = signal(1);
  loading = signal(false);
  msg = signal('');

  emailForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  resetForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  sendCode(): void {
    if (this.emailForm.invalid) return;
    this.loading.set(true); this.msg.set('');
    this.api.post('/auth/forgot-password', { email: this.emailForm.controls.email.value }).subscribe({
      next: () => { this.loading.set(false); this.step.set(2); },
      error: () => { this.loading.set(false); this.step.set(2); }, // don't leak existence
    });
  }

  reset(): void {
    if (this.resetForm.invalid) return;
    this.loading.set(true); this.msg.set('');
    const { code, newPassword } = this.resetForm.getRawValue();
    this.api.post('/auth/reset-password', { email: this.emailForm.controls.email.value, code, newPassword }).subscribe({
      next: () => this.router.navigate(['/login']),
      error: (e) => { this.msg.set(e?.error?.error?.message ?? 'Invalid or expired code'); this.loading.set(false); },
    });
  }
}
