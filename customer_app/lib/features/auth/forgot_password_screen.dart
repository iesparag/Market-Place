import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';

/// Two-step password reset, mirroring the web flow:
///   1. enter the email  → the API mails a 6-digit code (valid 15 minutes)
///   2. enter code + new password → verified and replaced in one call
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  int _step = 1;
  bool _busy = false;
  String? _error;
  String? _info;
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  bool _looksLikeEmail(String v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v);

  Future<void> _sendCode({bool resend = false}) async {
    final email = _email.text.trim();
    if (!_looksLikeEmail(email)) {
      setState(() => _error = 'Enter a valid email address');
      return;
    }
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await ref.read(authProvider.notifier).forgotPassword(email);
      // Deliberately the same outcome whether or not the account exists.
      if (mounted) setState(() { _step = 2; _info = resend ? 'A new code is on its way.' : null; });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    final code = _code.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from your email');
      return;
    }
    if (_password.text.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters');
      return;
    }
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await ref.read(authProvider.notifier).resetPassword(_email.text.trim(), code, _password.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated. Sign in with your new password.')),
      );
      context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 56, height: 56,
              decoration: BoxDecoration(gradient: context.brand.gradient, borderRadius: BorderRadius.circular(16)),
              alignment: Alignment.center,
              child: const Icon(Icons.lock_reset, color: Colors.white, size: 30),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _step == 1 ? 'Forgot your password?' : 'Check your email',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            _step == 1
                ? "Enter your email and we'll send you a 6-digit reset code."
                : 'We sent a code to ${_email.text.trim()}. It expires in 15 minutes.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: BrandColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 24),
          if (_step == 1)
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
              onSubmitted: (_) => _busy ? null : _sendCode(),
            )
          else ...[
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Reset code', counterText: ''),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password', helperText: 'At least 8 characters'),
              onSubmitted: (_) => _busy ? null : _reset(),
            ),
          ],
          if (_info != null) ...[
            const SizedBox(height: 12),
            Text(_info!, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFFDECEC), borderRadius: BorderRadius.circular(10)),
              child: Text(_error!, style: const TextStyle(color: BrandColors.danger)),
            ),
          ],
          const SizedBox(height: 20),
          SizedBox(
            height: 50,
            child: ElevatedButton(
              onPressed: _busy ? null : (_step == 1 ? _sendCode : _reset),
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(_step == 1 ? 'Send reset code' : 'Reset password', style: const TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(height: 8),
          if (_step == 2)
            Center(
              child: TextButton(
                onPressed: _busy ? null : () => _sendCode(resend: true),
                child: const Text('Resend code'),
              ),
            ),
          Center(
            child: TextButton(
              onPressed: () => context.pop(),
              child: const Text('Back to sign in'),
            ),
          ),
        ],
      ),
    );
  }
}
