import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <h1>Your account</h1>

    <div class="quick">
      <a class="card q" routerLink="/account/orders"><span>📦</span> Your orders</a>
      <a class="card q" routerLink="/account/addresses"><span>📍</span> Addresses</a>
      <a class="card q" routerLink="/account/wishlist"><span>♥</span> Wishlist</a>
    </div>

    <div class="grid">
      <!-- Profile -->
      <form class="card" [formGroup]="profile" (ngSubmit)="saveProfile()">
        <h3>Profile</h3>
        <label class="label">Name</label><input class="input" formControlName="name" />
        <label class="label">Phone</label><input class="input" formControlName="phone" placeholder="+91…" />
        <label class="label">Email</label>
        <div class="email">
          <input class="input" [value]="auth.user()?.email" disabled />
          @if (auth.user()?.emailVerified) { <span class="badge badge-success">verified</span> }
          @else { <span class="badge badge-warning">unverified</span> }
        </div>
        @if (pMsg()) { <div class="ok">{{ pMsg() }}</div> }
        <button class="btn btn-primary" [disabled]="profile.invalid || savingP()">{{ savingP() ? 'Saving…' : 'Save profile' }}</button>
      </form>

      <!-- Email verification -->
      @if (!auth.user()?.emailVerified) {
        <div class="card">
          <h3>Verify email</h3>
          <p class="muted">Confirm your email to secure your account.</p>
          @if (!otpSent()) {
            <button class="btn" (click)="sendOtp()">Send verification code</button>
          } @else {
            <p class="muted small">Code sent to {{ auth.user()?.email }} (dev: check backend console).</p>
            <input class="input" [class.err]="otpErr()" #code placeholder="6-digit code" maxlength="6" />
            <button class="btn btn-primary" (click)="verifyOtp(code.value)">Verify</button>
            @if (otpErr()) { <div class="errmsg">{{ otpErr() }}</div> }
          }
        </div>
      }

      <!-- Password -->
      <form class="card" [formGroup]="pwd" (ngSubmit)="changePwd()">
        <h3>Change password</h3>
        <label class="label">Current password</label><input class="input" type="password" formControlName="currentPassword" />
        <label class="label">New password</label><input class="input" type="password" formControlName="newPassword" placeholder="min 8 chars" />
        @if (pwdMsg()) { <div [class.ok]="pwdOk()" [class.errmsg]="!pwdOk()">{{ pwdMsg() }}</div> }
        <button class="btn btn-primary" [disabled]="pwd.invalid || savingPwd()">{{ savingPwd() ? 'Saving…' : 'Update password' }}</button>
      </form>
    </div>
  `,
  styles: [
    `
      .quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 24px; }
      .q { display: flex; align-items: center; gap: 10px; font-weight: 600; text-decoration: none; }
      .q span { font-size: 1.4rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; align-items: start; }
      form { display: grid; gap: 6px; } .label { margin-top: 10px; } .btn-primary { margin-top: 16px; }
      .email { display: flex; align-items: center; gap: 8px; }
      .small { font-size: 0.8rem; }
      .ok { color: var(--success); font-size: 0.9rem; margin-top: 8px; }
      .errmsg { color: var(--danger); font-size: 0.9rem; margin-top: 8px; }
      .input.err { border-color: var(--danger); }
    `,
  ],
})
export class AccountComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  savingP = signal(false); pMsg = signal('');
  savingPwd = signal(false); pwdMsg = signal(''); pwdOk = signal(false);
  otpSent = signal(false); otpErr = signal('');

  profile = this.fb.nonNullable.group({ name: ['', Validators.required], phone: [''] });
  pwd = this.fb.nonNullable.group({ currentPassword: ['', Validators.required], newPassword: ['', [Validators.required, Validators.minLength(8)]] });

  ngOnInit(): void {
    this.auth.refreshMe().subscribe({
      next: (me) => this.profile.patchValue({ name: me.name, phone: me.phone ?? '' }),
    });
  }

  saveProfile(): void {
    this.savingP.set(true); this.pMsg.set('');
    const { name, phone } = this.profile.getRawValue();
    this.auth.updateProfile(name, phone).subscribe({
      next: () => { this.pMsg.set('Profile saved ✓'); this.savingP.set(false); },
      error: () => this.savingP.set(false),
    });
  }

  sendOtp(): void {
    this.auth.sendOtp().subscribe({ next: () => this.otpSent.set(true) });
  }
  verifyOtp(code: string): void {
    this.otpErr.set('');
    this.auth.verifyOtp(code).subscribe({
      next: () => this.otpSent.set(false),
      error: (e) => this.otpErr.set(e?.message ?? 'Invalid code'),
    });
  }

  changePwd(): void {
    this.savingPwd.set(true); this.pwdMsg.set('');
    const { currentPassword, newPassword } = this.pwd.getRawValue();
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => { this.pwdOk.set(true); this.pwdMsg.set('Password updated ✓'); this.pwd.reset(); this.savingPwd.set(false); },
      error: (e) => { this.pwdOk.set(false); this.pwdMsg.set(e?.message ?? 'Failed'); this.savingPwd.set(false); },
    });
  }
}
