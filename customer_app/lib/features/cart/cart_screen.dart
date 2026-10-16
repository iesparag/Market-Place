import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import 'cart_controller.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);
    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);

    // Grouped by vendor — a multi-vendor cart gets one instructions box per store, not
    // one note that would be shown to every vendor regardless of relevance.
    final groups = <String, List<CartLine>>{};
    for (final l in lines) {
      groups.putIfAbsent(l.storeId, () => []).add(l);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your cart'),
        actions: [
          if (lines.isNotEmpty)
            TextButton(onPressed: cart.clear, child: const Text('Clear')),
        ],
      ),
      body: lines.isEmpty
          ? _EmptyCart(onShop: () => context.go('/'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final entry in groups.entries) ...[
                  _VendorGroup(storeId: entry.key, lines: entry.value, cart: cart),
                  const SizedBox(height: 14),
                ],
              ],
            ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: BrandColors.border))),
                child: Row(children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Subtotal',
                          style: TextStyle(
                              color: BrandColors.textMuted, fontSize: 12)),
                      Text(rupees(subtotal),
                          style: const TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 18)),
                    ],
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        onPressed: () => context.push('/checkout'),
                        child: const Text('Proceed to checkout'),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}

class _VendorGroup extends ConsumerWidget {
  final String storeId;
  final List<CartLine> lines;
  final CartController cart;
  const _VendorGroup({required this.storeId, required this.lines, required this.cart});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeName = lines.first.storeName;
    final instructions = ref.watch(cartInstructionsProvider)[storeId] ?? '';
    return Container(
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: BrandColors.border)),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (storeName != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 2, 2, 8),
              child: Row(children: [
                const Icon(Icons.storefront_outlined, size: 15, color: BrandColors.textMuted),
                const SizedBox(width: 6),
                Text(storeName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              ]),
            ),
          for (final l in lines) ...[
            _CartLineRow(line: l, cart: cart),
            const SizedBox(height: 10),
          ],
          TextFormField(
            initialValue: instructions,
            maxLines: 2,
            minLines: 1,
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              isDense: true,
              labelText: storeName != null ? 'Instructions for $storeName (optional)' : 'Instructions for vendor (optional)',
              hintText: 'e.g. ring the bell, no onions, leave at the door…',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) => ref.read(cartInstructionsProvider.notifier).set(storeId, v),
          ),
        ],
      ),
    );
  }
}

class _CartLineRow extends StatelessWidget {
  final CartLine line;
  final CartController cart;
  const _CartLineRow({required this.line, required this.cart});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 64,
          height: 64,
          child: line.image != null
              ? CachedNetworkImage(imageUrl: line.image!, fit: BoxFit.cover)
              : Container(color: const Color(0xFFF1F1F4), child: const Icon(Icons.image_outlined)),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(line.title,
                maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
            const SizedBox(height: 6),
            Text(rupees(line.price), style: const TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
      _QtyBox(
        qty: line.qty,
        onDec: () => cart.setQty(line.key, line.qty - 1),
        onInc: () => cart.setQty(line.key, line.qty + 1),
      ),
    ]);
  }
}

class _QtyBox extends StatelessWidget {
  final int qty;
  final VoidCallback onDec, onInc;
  const _QtyBox({required this.qty, required this.onDec, required this.onInc});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Container(
      decoration: BoxDecoration(
          border: Border.all(color: b.primary),
          borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
            icon: const Icon(Icons.remove, size: 18),
            color: b.primary,
            onPressed: onDec,
            visualDensity: VisualDensity.compact),
        Text('$qty', style: const TextStyle(fontWeight: FontWeight.w800)),
        IconButton(
            icon: const Icon(Icons.add, size: 18),
            color: b.primary,
            onPressed: onInc,
            visualDensity: VisualDensity.compact),
      ]),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  final VoidCallback onShop;
  const _EmptyCart({required this.onShop});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 132,
            height: 132,
            decoration: BoxDecoration(color: b.soft, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: const Text('🛒', style: TextStyle(fontSize: 58)),
          ),
          const SizedBox(height: 22),
          const Text('Your cart is empty',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
          const SizedBox(height: 6),
          const Text('Add products to get started',
              style: TextStyle(color: BrandColors.textMuted, fontSize: 13.5)),
          const SizedBox(height: 24),
          SizedBox(
            height: 50,
            child: ElevatedButton.icon(
              onPressed: onShop,
              icon: const Icon(Icons.storefront_rounded, size: 19),
              label: const Text('Start shopping'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 30),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
