import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/address.dart';
import '../cart/cart_controller.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String? _selectedId;
  bool _placing = false;

  Address? _pick(List<Address> list) {
    if (list.isEmpty) return null;
    if (_selectedId != null) {
      final m = list.where((a) => a.id == _selectedId);
      if (m.isNotEmpty) return m.first;
    }
    final def = list.where((a) => a.isDefault);
    return def.isNotEmpty ? def.first : list.first;
  }

  Future<void> _place(List<CartLine> lines, Address? addr) async {
    if (addr == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a delivery address first')));
      return;
    }
    setState(() => _placing = true);
    try {
      final repo = ref.read(checkoutRepoProvider);
      final order = await repo.placeOrder(lines: lines, address: addr);
      await repo.payOrder(order.id); // demo payment — marks the order paid
      ref.read(cartProvider.notifier).clear();
      if (mounted) context.go('/order-success?number=${Uri.encodeComponent(order.number)}');
    } catch (e) {
      if (mounted) {
        setState(() => _placing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Order failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lock_outline_rounded, size: 48, color: BrandColors.textMuted),
            const SizedBox(height: 10),
            const Text('Sign in to checkout', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 14),
            ElevatedButton(onPressed: () => context.push('/login'), child: const Text('Sign in')),
          ]),
        ),
      );
    }

    final lines = ref.watch(cartProvider);
    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);
    final addressesAsync = ref.watch(addressesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Address
          Row(children: [
            const Text('Delivery address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const Spacer(),
            TextButton.icon(onPressed: _addAddressSheet, icon: const Icon(Icons.add, size: 18), label: const Text('Add')),
          ]),
          addressesAsync.when(
            loading: () => const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
            error: (e, _) => Text('$e', style: const TextStyle(color: BrandColors.textMuted)),
            data: (list) {
              if (list.isEmpty) {
                return _dashedBox('No saved address — tap "Add" to enter your delivery address.');
              }
              final selected = _pick(list);
              return Column(
                children: list.map((a) => _AddressCard(
                      address: a,
                      selected: a.id == selected?.id,
                      onTap: () => setState(() => _selectedId = a.id),
                    )).toList(),
              );
            },
          ),

          const SizedBox(height: 20),
          const Text('Order summary', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          ...lines.map((l) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  Expanded(child: Text('${l.title}  ×${l.qty}', maxLines: 1, overflow: TextOverflow.ellipsis)),
                  Text(rupees(l.lineTotal), style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              )),
          const Divider(height: 24),
          _row('Subtotal', rupees(subtotal)),
          _row('Delivery', 'FREE', valueColor: BrandColors.success),
          const SizedBox(height: 6),
          _row('Total', rupees(subtotal), bold: true),
        ],
      ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _placing ? null : () => _place(lines, _pick(addressesAsync.valueOrNull ?? [])),
                    child: _placing
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Place order · ${rupees(subtotal)}', style: const TextStyle(fontSize: 16)),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _row(String k, String v, {bool bold = false, Color? valueColor}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, fontSize: bold ? 16 : 14)),
          const Spacer(),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 16 : 14, color: valueColor)),
        ]),
      );

  Widget _dashedBox(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: BrandColors.border)),
        child: Text(msg, style: const TextStyle(color: BrandColors.textMuted)),
      );

  void _addAddressSheet() {
    final label = TextEditingController(text: 'Home');
    final line1 = TextEditingController();
    final city = TextEditingController();
    final pincode = TextEditingController();
    final phone = TextEditingController();
    bool saving = false;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + MediaQuery.of(sheetCtx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 14),
              TextField(controller: label, decoration: const InputDecoration(labelText: 'Label (Home / Work)')),
              const SizedBox(height: 10),
              TextField(controller: line1, decoration: const InputDecoration(labelText: 'Address line')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(controller: city, decoration: const InputDecoration(labelText: 'City'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: pincode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Pincode'))),
              ]),
              const SizedBox(height: 10),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity, height: 48,
                child: ElevatedButton(
                  onPressed: saving
                      ? null
                      : () async {
                          if (line1.text.trim().isEmpty || city.text.trim().isEmpty) {
                            ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(content: Text('Address line & city required')));
                            return;
                          }
                          setSheet(() => saving = true);
                          try {
                            final a = await ref.read(checkoutRepoProvider).addAddress(
                                  label: label.text.trim().isEmpty ? 'Home' : label.text.trim(),
                                  line1: line1.text.trim(), city: city.text.trim(),
                                  pincode: pincode.text.trim(), phone: phone.text.trim(),
                                  isDefault: true,
                                );
                            ref.invalidate(addressesProvider);
                            if (mounted) setState(() => _selectedId = a.id);
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                          } catch (e) {
                            setSheet(() => saving = false);
                            if (sheetCtx.mounted) ScaffoldMessenger.of(sheetCtx).showSnackBar(SnackBar(content: Text('$e')));
                          }
                        },
                  child: saving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Save address'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  final Address address;
  final bool selected;
  final VoidCallback onTap;
  const _AddressCard({required this.address, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? BrandColors.brandSoft : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? BrandColors.brand600 : BrandColors.border, width: selected ? 1.5 : 1),
        ),
        child: Row(children: [
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? BrandColors.brand600 : BrandColors.textMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text(address.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                  if (address.isDefault) ...[
                    const SizedBox(width: 8),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1), decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(4)), child: const Text('Default', style: TextStyle(fontSize: 10, color: BrandColors.textMuted))),
                  ],
                ]),
                const SizedBox(height: 2),
                Text(address.oneLine, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
                if (address.phone != null && address.phone!.isNotEmpty)
                  Text('📞 ${address.phone}', style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}
