import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../models/product.dart';
import '../../features/cart/cart_controller.dart';
import '../../features/wishlist/wishlist_controller.dart';
import 'veg_mark.dart';

class ProductCard extends ConsumerWidget {
  final Product product;
  const ProductCard({super.key, required this.product});

  Variant? get _cheapest =>
      product.variants.isEmpty ? null : product.variants.reduce((a, b) => a.price <= b.price ? a : b);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ft = foodTypeOf(product.attributes, product.foodType);
    final v = _cheapest;
    final single = product.variants.length == 1;
    ref.watch(cartProvider); // rebuild on cart changes
    final cart = ref.read(cartProvider.notifier);
    final qty = (single && v != null) ? cart.qtyOf(product.id, v.sku) : 0;

    return GestureDetector(
      onTap: () => context.push('/p/${product.slug}'),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: BrandColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image fills the remaining space → never overflows, whatever the card height.
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  product.firstImage != null
                      ? CachedNetworkImage(
                          imageUrl: product.firstImage!,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(color: const Color(0xFFF1F1F4)),
                          errorWidget: (_, __, ___) => const _ImgFallback(),
                        )
                      : const _ImgFallback(),
                  if (ft != null) Positioned(top: 8, left: 8, child: VegMark(type: ft, size: 18)),
                  Positioned(top: 6, right: 6, child: _WishHeart(productId: product.id)),
                ],
              ),
            ),
            // Body (fixed height, compact)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, height: 1.2),
                  ),
                  if (product.store != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('by ${product.store!.name}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: BrandColors.textMuted, fontSize: 11)),
                    ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(rupees(product.minPrice),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const Spacer(),
                      if (product.ratingCount > 0) ...[
                        const Icon(Icons.star_rounded, size: 14, color: BrandColors.star),
                        Text(product.ratingAvg.toStringAsFixed(1),
                            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 32,
                    child: qty > 0
                        ? _Stepper(
                            qty: qty,
                            onDec: () => cart.setQty('${product.id}|${v!.sku}', qty - 1),
                            onInc: () => cart.setQty('${product.id}|${v!.sku}', qty + 1),
                          )
                        : OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BrandColors.brand600,
                              side: const BorderSide(color: BrandColors.brand600),
                              padding: EdgeInsets.zero,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
                              textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                            ),
                            onPressed: () {
                              if (single && v != null) {
                                cart.add(CartLine(
                                  productId: product.id, variantSku: v.sku, title: product.title,
                                  image: product.firstImage, storeId: product.storeId,
                                  storeName: product.store?.name, price: v.price, qty: 1,
                                ));
                              } else {
                                context.push('/p/${product.slug}');
                              }
                            },
                            child: const Text('ADD'),
                          ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  final int qty;
  final VoidCallback onDec;
  final VoidCallback onInc;
  const _Stepper({required this.qty, required this.onDec, required this.onInc});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: BrandColors.brand600, borderRadius: BorderRadius.circular(9)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _btn(Icons.remove, onDec),
          Text('$qty', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          _btn(Icons.add, onInc),
        ],
      ),
    );
  }

  Widget _btn(IconData i, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: SizedBox(width: 38, height: 32, child: Icon(i, color: Colors.white, size: 18)),
      );
}

class _ImgFallback extends StatelessWidget {
  const _ImgFallback();
  @override
  Widget build(BuildContext context) =>
      Container(color: const Color(0xFFF1F1F4), child: const Center(child: Text('🛍️', style: TextStyle(fontSize: 28))));
}

class _WishHeart extends ConsumerWidget {
  final String productId;
  const _WishHeart({required this.productId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final on = ref.watch(wishlistProvider).contains(productId);
    return GestureDetector(
      onTap: () async {
        final ok = await ref.read(wishlistProvider.notifier).toggle(productId);
        if (!ok && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: const Text('Sign in to save to wishlist'),
            action: SnackBarAction(label: 'Sign in', onPressed: () => context.push('/login')),
          ));
        }
      },
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: const BoxDecoration(color: Color(0xE6FFFFFF), shape: BoxShape.circle),
        child: Icon(on ? Icons.favorite : Icons.favorite_border_rounded,
            size: 18, color: on ? BrandColors.danger : BrandColors.textMuted),
      ),
    );
  }
}
