import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../models/product.dart';
import '../../features/cart/cart_controller.dart';
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
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: BrandColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(13)),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: product.firstImage != null
                        ? CachedNetworkImage(
                            imageUrl: product.firstImage!,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(color: const Color(0xFFF1F1F4)),
                            errorWidget: (_, __, ___) => const _ImgFallback(),
                          )
                        : const _ImgFallback(),
                  ),
                ),
                if (ft != null)
                  Positioned(top: 8, left: 8, child: VegMark(type: ft, size: 18)),
              ],
            ),
            // Body
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.25),
                  ),
                  const SizedBox(height: 3),
                  if (product.store != null)
                    Text('by ${product.store!.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: BrandColors.textMuted, fontSize: 11.5)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(rupees(product.minPrice),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
                      const Spacer(),
                      if (product.ratingCount > 0) ...[
                        const Icon(Icons.star_rounded, size: 15, color: BrandColors.star),
                        Text(product.ratingAvg.toStringAsFixed(1),
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  qty > 0
                      ? _Stepper(
                          qty: qty,
                          onDec: () => cart.setQty('${product.id}|${v!.sku}', qty - 1),
                          onInc: () => cart.setQty('${product.id}|${v!.sku}', qty + 1),
                        )
                      : SizedBox(
                          width: double.infinity,
                          height: 34,
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BrandColors.brand600,
                              side: const BorderSide(color: BrandColors.brand600),
                              padding: EdgeInsets.zero,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
      height: 34,
      decoration: BoxDecoration(color: BrandColors.brand600, borderRadius: BorderRadius.circular(10)),
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
        child: SizedBox(width: 40, height: 34, child: Icon(i, color: Colors.white, size: 18)),
      );
}

class _ImgFallback extends StatelessWidget {
  const _ImgFallback();
  @override
  Widget build(BuildContext context) =>
      Container(color: const Color(0xFFF1F1F4), child: const Center(child: Text('🛍️', style: TextStyle(fontSize: 28))));
}
