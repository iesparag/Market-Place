import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/product.dart';
import '../cart/cart_controller.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/veg_mark.dart';

class ProductScreen extends ConsumerStatefulWidget {
  final String slug;
  const ProductScreen({super.key, required this.slug});
  @override
  ConsumerState<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends ConsumerState<ProductScreen> {
  int _variant = 0;
  int _image = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productProvider(widget.slug));
    return Scaffold(
      appBar: AppBar(
          title: const Text('Product'),
          actions: const [WishlistButton(), CartButton()]),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('$e',
                style: const TextStyle(color: BrandColors.textMuted))),
        data: (p) => _content(context, p),
      ),
    );
  }

  Widget _content(BuildContext context, Product p) {
    final ft = foodTypeOf(p.attributes, p.foodType);
    final vi = _variant.clamp(0, p.variants.length - 1).toInt();
    final v = p.variants.isNotEmpty ? p.variants[vi] : null;
    ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);
    final qty = v != null ? cart.qtyOf(p.id, v.sku) : 0;

    return Column(
      children: [
        Expanded(
          child: ListView(
            children: [
              // Gallery
              if (p.images.isNotEmpty)
                Column(children: [
                  SizedBox(
                    height: 320,
                    child: PageView.builder(
                      onPageChanged: (i) => setState(() => _image = i),
                      itemCount: p.images.length,
                      itemBuilder: (_, i) => CachedNetworkImage(
                          imageUrl: p.images[i], fit: BoxFit.cover),
                    ),
                  ),
                  if (p.images.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(
                            p.images.length,
                            (i) => Container(
                                  width: i == _image ? 20 : 6,
                                  height: 6,
                                  margin:
                                      const EdgeInsets.symmetric(horizontal: 3),
                                  decoration: BoxDecoration(
                                      color: i == _image
                                          ? context.brand.primary
                                          : BrandColors.border,
                                      borderRadius: BorderRadius.circular(3)),
                                )),
                      ),
                    ),
                ])
              else
                Container(
                    height: 260,
                    color: const Color(0xFFF1F1F4),
                    child: const Center(
                        child: Text('🛍️', style: TextStyle(fontSize: 44)))),

              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (p.store != null)
                      GestureDetector(
                        onTap: () => context.push('/store/${p.store!.slug}'),
                        child: Text('${p.store!.name} ›',
                            style: TextStyle(
                                color: context.brand.primaryDark,
                                fontWeight: FontWeight.w600)),
                      ),
                    const SizedBox(height: 6),
                    Text(p.title,
                        style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            height: 1.25)),
                    if (p.code != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('Product code: ${p.code}',
                            style: const TextStyle(
                                color: BrandColors.textMuted, fontSize: 12)),
                      ),
                    const SizedBox(height: 8),
                    Row(children: [
                      if (ft != null) ...[
                        VegMark(type: ft, size: 16),
                        const SizedBox(width: 8)
                      ],
                      if (p.ratingCount > 0) ...[
                        const Icon(Icons.star_rounded,
                            size: 18, color: BrandColors.star),
                        Text(
                            ' ${p.ratingAvg.toStringAsFixed(1)} · ${p.ratingCount} ratings',
                            style: const TextStyle(
                                fontSize: 13, color: BrandColors.textMuted)),
                      ],
                    ]),
                    const SizedBox(height: 12),
                    Text(rupees(v?.price ?? p.minPrice),
                        style: const TextStyle(
                            fontSize: 26, fontWeight: FontWeight.w900)),

                    // Variants
                    if (p.variants.length > 1) ...[
                      const SizedBox(height: 16),
                      const Text('Choose an option',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: List.generate(p.variants.length, (i) {
                          final label =
                              p.variants[i].optionValues.values.join(' / ');
                          return ChoiceChip(
                            label:
                                Text(label.isEmpty ? p.variants[i].sku : label),
                            selected: _variant == i,
                            selectedColor: const Color(0x26EA580C),
                            onSelected: (_) => setState(() => _variant = i),
                          );
                        }),
                      ),
                    ],

                    if (p.description.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const Text('Description',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 6),
                      Text(p.description,
                          style: const TextStyle(
                              color: BrandColors.textMuted, height: 1.4)),
                    ],

                    // Specs (from category attribute defs)
                    if (p.attributeDefs.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const Text('Specifications',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 8),
                      ...p.attributeDefs
                          .where((d) =>
                              d.key != 'veg' && p.attributes[d.key] != null)
                          .map((d) => Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 4),
                                child: Row(children: [
                                  SizedBox(
                                      width: 130,
                                      child: Text(d.label,
                                          style: const TextStyle(
                                              color: BrandColors.textMuted))),
                                  Expanded(
                                      child: Text('${p.attributes[d.key]}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600))),
                                ]),
                              )),
                    ],
                  ],
                ),
              ),

              // Related
              if (p.related.isNotEmpty) ...[
                const Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Text('You may also like',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16))),
                SizedBox(
                  height: 272,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: p.related.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 12),
                    itemBuilder: (_, i) => SizedBox(
                        width: 156, child: ProductCard(product: p.related[i])),
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),

        // Sticky add-to-cart bar
        SafeArea(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: BrandColors.border))),
            child: v == null
                ? const Text('Unavailable')
                : qty > 0
                    ? Row(children: [
                        const Text('In cart',
                            style: TextStyle(color: BrandColors.textMuted)),
                        const Spacer(),
                        Container(
                          decoration: BoxDecoration(
                              color: context.brand.primary,
                              borderRadius: BorderRadius.circular(12)),
                          child: Row(children: [
                            IconButton(
                                icon: const Icon(Icons.remove,
                                    color: Colors.white),
                                onPressed: () =>
                                    cart.setQty('${p.id}|${v.sku}', qty - 1)),
                            Text('$qty',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16)),
                            IconButton(
                                icon:
                                    const Icon(Icons.add, color: Colors.white),
                                onPressed: () =>
                                    cart.setQty('${p.id}|${v.sku}', qty + 1)),
                          ]),
                        ),
                      ])
                    : SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: () {
                            cart.add(CartLine(
                              productId: p.id,
                              variantSku: v.sku,
                              title: p.title,
                              image: p.firstImage,
                              storeId: p.storeId,
                              storeName: p.store?.name,
                              price: v.price,
                              qty: 1,
                            ));
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Added to cart'),
                                    duration: Duration(milliseconds: 900)));
                          },
                          child: const Text('Add to cart',
                              style: TextStyle(fontSize: 16)),
                        ),
                      ),
          ),
        ),
      ],
    );
  }
}
