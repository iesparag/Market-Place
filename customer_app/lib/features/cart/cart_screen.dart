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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your cart'),
        actions: [
          if (lines.isNotEmpty)
            TextButton(onPressed: cart.clear, child: const Text('Clear', style: TextStyle(color: Colors.white))),
        ],
      ),
      body: lines.isEmpty
          ? _EmptyCart(onShop: () => context.go('/'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final l = lines[i];
                return Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
                  child: Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: SizedBox(
                        width: 64, height: 64,
                        child: l.image != null
                            ? CachedNetworkImage(imageUrl: l.image!, fit: BoxFit.cover)
                            : Container(color: const Color(0xFFF1F1F4), child: const Icon(Icons.image_outlined)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                          if (l.storeName != null)
                            Text(l.storeName!, style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                          const SizedBox(height: 6),
                          Text(rupees(l.price), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                    _QtyBox(
                      qty: l.qty,
                      onDec: () => cart.setQty(l.key, l.qty - 1),
                      onInc: () => cart.setQty(l.key, l.qty + 1),
                    ),
                  ]),
                );
              },
            ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: BrandColors.border))),
                child: Row(children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Subtotal', style: TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                      Text(rupees(subtotal), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
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

class _QtyBox extends StatelessWidget {
  final int qty;
  final VoidCallback onDec, onInc;
  const _QtyBox({required this.qty, required this.onDec, required this.onInc});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(border: Border.all(color: BrandColors.brand600), borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(icon: const Icon(Icons.remove, size: 18), color: BrandColors.brand600, onPressed: onDec, visualDensity: VisualDensity.compact),
        Text('$qty', style: const TextStyle(fontWeight: FontWeight.w800)),
        IconButton(icon: const Icon(Icons.add, size: 18), color: BrandColors.brand600, onPressed: onInc, visualDensity: VisualDensity.compact),
      ]),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  final VoidCallback onShop;
  const _EmptyCart({required this.onShop});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🛒', style: TextStyle(fontSize: 56)),
          const SizedBox(height: 12),
          const Text('Your cart is empty', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 6),
          const Text('Add products to get started', style: TextStyle(color: BrandColors.textMuted)),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: onShop, child: const Text('Start shopping')),
        ],
      ),
    );
  }
}
