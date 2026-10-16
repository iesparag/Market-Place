import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import 'places_search_field.dart';

const _addressTypes = ['Home', 'Work', 'Other'];

class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Addresses')),
      floatingActionButton: user == null ? null : FloatingActionButton.extended(
        onPressed: () => _addSheet(context, ref),
        backgroundColor: context.brand.primary,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Add new address', style: TextStyle(color: Colors.white)),
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
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final a = list[i];
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Icon(
                                a.label.toLowerCase() == 'work' ? Icons.work_outline_rounded : Icons.location_on_outlined,
                                color: context.brand.primary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(children: [
                                    Text(a.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                                    if (a.isDefault) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(color: const Color(0xFFE7F6EC), borderRadius: BorderRadius.circular(5)),
                                        child: const Text('DEFAULT', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: BrandColors.success)),
                                      ),
                                    ],
                                  ]),
                                  if (a.recipientName != null && a.recipientName!.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Text(a.recipientName!, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                    ),
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Text(a.oneLine, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
                                  ),
                                  if (a.phone != null && a.phone!.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Text('📞 ${a.phone}', style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
                                    ),
                                  if (a.lat == null || a.lng == null)
                                    const Padding(
                                      padding: EdgeInsets.only(top: 6),
                                      child: Row(children: [
                                        Icon(Icons.warning_amber_rounded, size: 14, color: Color(0xFFB45309)),
                                        SizedBox(width: 4),
                                        Text('No exact location — delivery may be delayed',
                                            style: TextStyle(fontSize: 11.5, color: Color(0xFFB45309), fontWeight: FontWeight.w600)),
                                      ]),
                                    ),
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
    final recipientName = TextEditingController();
    final phone = TextEditingController();
    final pincode = TextEditingController();
    final line2 = TextEditingController();
    final line1 = TextEditingController();
    final landmark = TextEditingController();
    final city = TextEditingController();
    final state = TextEditingController();
    final addressType = ValueNotifier<String>('Home');
    final locating = ValueNotifier<bool>(false);
    final saving = ValueNotifier<bool>(false);
    final formKey = GlobalKey<FormState>();
    double? lat;
    double? lng;
    final hasLocation = ValueNotifier<bool>(false);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Add new address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 14),
                ValueListenableBuilder<bool>(
                  valueListenable: locating,
                  builder: (_, isLocating, __) => OutlinedButton.icon(
                    onPressed: isLocating
                        ? null
                        : () async {
                            locating.value = true;
                            try {
                              final pos = await ref.read(deviceLocationServiceProvider).current();
                              if (pos == null) {
                                if (sheetCtx.mounted) {
                                  ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(
                                      content: Text('Could not get your location — check location permission.')));
                                }
                                return;
                              }
                              final hit = await ref.read(geocodeRepoProvider).reverse(pos.lat, pos.lng);
                              if (hit == null) {
                                if (sheetCtx.mounted) {
                                  ScaffoldMessenger.of(sheetCtx)
                                      .showSnackBar(const SnackBar(content: Text('Could not resolve an address here.')));
                                }
                                return;
                              }
                              line1.text = hit.line1;
                              city.text = hit.city;
                              if (hit.state != null && hit.state!.isNotEmpty) state.text = hit.state!;
                              if (hit.pincode != null && hit.pincode!.isNotEmpty) pincode.text = hit.pincode!;
                              lat = hit.lat;
                              lng = hit.lng;
                              hasLocation.value = true;
                            } finally {
                              locating.value = false;
                            }
                          },
                    icon: isLocating
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.my_location_rounded, size: 18),
                    label: Text(isLocating ? 'Locating…' : 'Use current location'),
                  ),
                ),
                const SizedBox(height: 10),
                PlacesSearchField(onPicked: (r) {
                  line1.text = r.line1;
                  city.text = r.city;
                  if (r.state != null && r.state!.isNotEmpty) state.text = r.state!;
                  if (r.pincode != null && r.pincode!.isNotEmpty) pincode.text = r.pincode!;
                  lat = r.lat;
                  lng = r.lng;
                  hasLocation.value = true;
                }),
                const SizedBox(height: 6),
                ValueListenableBuilder<bool>(
                  valueListenable: hasLocation,
                  builder: (_, has, __) => Container(
                    margin: const EdgeInsets.only(top: 4, bottom: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: has ? const Color(0xFFE7F6EC) : const Color(0xFFFFF7E6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      Icon(has ? Icons.check_circle_rounded : Icons.info_outline_rounded,
                          size: 16, color: has ? BrandColors.success : const Color(0xFF92610A)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          has
                              ? 'Exact location set — delivery will be precise'
                              : 'Search above or use current location so delivery is accurate',
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: has ? BrandColors.success : const Color(0xFF92610A)),
                        ),
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 10),
                const Text('Contact', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                TextFormField(
                  controller: recipientName,
                  decoration: const InputDecoration(labelText: 'Receiver name'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone number'),
                  validator: (v) {
                    final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                    return digits.length == 10 ? null : 'Enter a valid 10-digit phone number';
                  },
                ),
                const SizedBox(height: 16),
                const Text('Address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                TextFormField(
                  controller: pincode,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Pincode'),
                  validator: (v) {
                    final digits = (v ?? '').trim();
                    return digits.length == 6 ? null : 'Enter a valid 6-digit pincode';
                  },
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: line2,
                  decoration: const InputDecoration(labelText: 'Flat / House no., Building, Company'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: line1,
                  decoration: const InputDecoration(labelText: 'Area, Street, Sector, Village'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextField(controller: landmark, decoration: const InputDecoration(labelText: 'Landmark (optional)')),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: TextFormField(
                      controller: city,
                      decoration: const InputDecoration(labelText: 'City'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextFormField(
                      controller: state,
                      decoration: const InputDecoration(labelText: 'State'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                    ),
                  ),
                ]),
                const SizedBox(height: 16),
                const Text('Save address as', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                ValueListenableBuilder<String>(
                  valueListenable: addressType,
                  builder: (_, selected, __) => Wrap(
                    spacing: 8,
                    children: _addressTypes.map((t) {
                      final sel = t == selected;
                      return ChoiceChip(
                        label: Text(t),
                        selected: sel,
                        onSelected: (_) => addressType.value = t,
                        selectedColor: context.brand.soft,
                        labelStyle: TextStyle(
                            color: sel ? context.brand.primaryDark : BrandColors.ink,
                            fontWeight: sel ? FontWeight.w800 : FontWeight.w500),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity, height: 48,
                  child: ValueListenableBuilder<bool>(
                    valueListenable: saving,
                    builder: (_, isSaving, __) => ElevatedButton(
                      onPressed: isSaving
                          ? null
                          : () async {
                              if (!(formKey.currentState?.validate() ?? false)) return;
                              if (lat == null || lng == null) {
                                ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(
                                    content: Text('Please search for your address or use current location first — exact location is required.')));
                                return;
                              }
                              saving.value = true;
                              try {
                                await ref.read(checkoutRepoProvider).addAddress(
                                      label: addressType.value,
                                      recipientName: recipientName.text.trim(),
                                      line1: line1.text.trim(),
                                      line2: line2.text.trim(),
                                      landmark: landmark.text.trim(),
                                      city: city.text.trim(),
                                      state: state.text.trim(),
                                      pincode: pincode.text.trim(),
                                      phone: phone.text.trim(),
                                      lat: lat, lng: lng,
                                    );
                                ref.invalidate(addressesProvider);
                                if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                              } finally {
                                saving.value = false;
                              }
                            },
                      child: Text(isSaving ? 'Saving…' : 'Save address'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
