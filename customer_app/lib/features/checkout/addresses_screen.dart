import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Addresses')),
      floatingActionButton: user == null ? null : FloatingActionButton.extended(
        onPressed: () => _addSheet(context, ref),
        backgroundColor: BrandColors.brand600,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Add', style: TextStyle(color: Colors.white)),
      ),
      body: user == null
          ? Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Sign in to manage addresses', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                ElevatedButton(onPressed: () => context.push('/login'), child: const Text('Sign in')),
              ]),
            )
          : ref.watch(addressesProvider).when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
              data: (list) => list.isEmpty
                  ? const Center(child: Text('No saved addresses', style: TextStyle(color: BrandColors.textMuted)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final a = list[i];
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
                          child: Row(children: [
                            const Icon(Icons.location_on_outlined, color: BrandColors.brand600),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(a.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                                  Text(a.oneLine, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline_rounded, color: BrandColors.textMuted),
                              onPressed: () async {
                                await ref.read(checkoutRepoProvider).deleteAddress(a.id);
                                ref.invalidate(addressesProvider);
                              },
                            ),
                          ]),
                        );
                      },
                    ),
            ),
    );
  }

  void _addSheet(BuildContext context, WidgetRef ref) {
    final label = TextEditingController(text: 'Home');
    final line1 = TextEditingController();
    final city = TextEditingController();
    final pincode = TextEditingController();
    final phone = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 14),
            TextField(controller: label, decoration: const InputDecoration(labelText: 'Label')),
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
                onPressed: () async {
                  if (line1.text.trim().isEmpty || city.text.trim().isEmpty) return;
                  await ref.read(checkoutRepoProvider).addAddress(
                        label: label.text.trim().isEmpty ? 'Home' : label.text.trim(),
                        line1: line1.text.trim(), city: city.text.trim(),
                        pincode: pincode.text.trim(), phone: phone.text.trim(),
                      );
                  ref.invalidate(addressesProvider);
                  if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                },
                child: const Text('Save address'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
