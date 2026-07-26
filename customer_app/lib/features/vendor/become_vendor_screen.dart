import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';

class BecomeVendorScreen extends ConsumerStatefulWidget {
  const BecomeVendorScreen({super.key});
  @override
  ConsumerState<BecomeVendorScreen> createState() => _BecomeVendorScreenState();
}

class _BecomeVendorScreenState extends ConsumerState<BecomeVendorScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _store = TextEditingController();
  final _city = TextEditingController();
  final _gstin = TextEditingController();
  String _type = 'grocery';
  bool _busy = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _phone, _store, _city, _gstin]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || _email.text.trim().isEmpty || _password.text.length < 8 || _store.text.trim().isEmpty) {
      setState(() => _error = 'Fill name, email, store name, and an 8+ char password.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).registerVendor(
            name: _name.text.trim(), email: _email.text.trim(), password: _password.text,
            phone: _phone.text.trim(), storeName: _store.text.trim(), vendorType: _type,
            gstin: _gstin.text.trim(), city: _city.text.trim(),
          );
      if (mounted) setState(() { _busy = false; _done = true; });
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return Scaffold(
        appBar: AppBar(title: const Text('Become a vendor')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 88, height: 88, decoration: const BoxDecoration(color: Color(0xFFE7F8EE), shape: BoxShape.circle), child: const Icon(Icons.check_rounded, color: BrandColors.success, size: 50)),
              const SizedBox(height: 18),
              const Text('Application received! 🎉', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text('Your store "${_store.text.trim()}" is created and pending approval. Once approved, manage products & orders from the seller dashboard.',
                  textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted)),
              const SizedBox(height: 24),
              SizedBox(width: double.infinity, height: 50, child: ElevatedButton(onPressed: () => context.go('/'), child: const Text('Back to shopping'))),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Become a vendor')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Start selling on Marketplace', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('Create your seller account + store. We review and approve it shortly.', style: TextStyle(color: BrandColors.textMuted)),
          const SizedBox(height: 20),
          _label('Your name *'), _field(_name),
          _label('Email *'), _field(_email, keyboard: TextInputType.emailAddress),
          _label('Password * (min 8 chars)'), _field(_password, obscure: true),
          _label('Phone'), _field(_phone, keyboard: TextInputType.phone),
          const Divider(height: 32),
          _label('Store name *'), _field(_store),
          _label('Store type'),
          DropdownButtonFormField<String>(
            initialValue: _type,
            items: const [
              DropdownMenuItem(value: 'grocery', child: Text('Grocery / Kirana')),
              DropdownMenuItem(value: 'food', child: Text('Food / Restaurant')),
              DropdownMenuItem(value: 'fashion', child: Text('Fashion')),
              DropdownMenuItem(value: 'generic', child: Text('Electronics / Other')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'grocery'),
          ),
          const SizedBox(height: 12),
          _label('City'), _field(_city),
          _label('GSTIN (optional)'), _field(_gstin),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFDECEC), borderRadius: BorderRadius.circular(10)), child: Text(_error!, style: const TextStyle(color: BrandColors.danger))),
          ],
          const SizedBox(height: 20),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Submit application', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(top: 12, bottom: 6), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)));
  Widget _field(TextEditingController c, {bool obscure = false, TextInputType? keyboard}) =>
      TextField(controller: c, obscureText: obscure, keyboardType: keyboard);
}
