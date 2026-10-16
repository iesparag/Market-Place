import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/store.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/error_view.dart';
import '../favourites/store_favourite_controller.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

/// The "Stores" tab — shows all marketplace stores with distance and delivery badges.
/// Local stores show instant/same-day delivery; intercity stores show standard 5-6 days delivery.
class StoresListScreen extends ConsumerStatefulWidget {
  final bool embedded;
  const StoresListScreen({super.key, this.embedded = false});

  @override
  ConsumerState<StoresListScreen> createState() => _StoresListScreenState();
}

class _StoresListScreenState extends ConsumerState<StoresListScreen> {
  final _searchCtrl = TextEditingController();
  String _selectedCategory = 'All';

  static const _categories = ['All', 'Grocery', 'Fashion', 'Food', 'Tech', 'Pharmacy'];

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final async = ref.watch(vendorsProvider);

    final scaffold = Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        leading: widget.embedded ? null : const AppBackButton(),
        titleSpacing: widget.embedded ? 12 : 0,
        title: Container(
          height: 42,
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(22),
          ),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Search stores & categories…',
              hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
              prefixIcon: const Icon(Icons.search_rounded, size: 20, color: Color(0xFF64748B)),
              suffixIcon: _searchCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear_rounded, size: 18),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() {});
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
            ),
          ),
        ),
        actions: const [WishlistButton(), CartButton()],
      ),
      body: Column(
        children: [
          // Quick Category Filters
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: _categories.map((cat) {
                  final sel = _selectedCategory == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(cat),
                      selected: sel,
                      onSelected: (_) => setState(() => _selectedCategory = cat),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: sel ? Colors.white : const Color(0xFF475569),
                      ),
                      selectedColor: b.primary,
                      backgroundColor: const Color(0xFFF1F5F9),
                      side: BorderSide(
                        color: sel ? b.primary : const Color(0xFFE2E8F0),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Store list
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(error: e),
              data: (vendors) {
                final filtered = vendors.where((v) {
                  final matchesCat = _selectedCategory == 'All' ||
                      v.vendorType.toLowerCase().contains(_selectedCategory.toLowerCase());
                  final q = _searchCtrl.text.trim().toLowerCase();
                  final matchesSearch = q.isEmpty ||
                      v.name.toLowerCase().contains(q) ||
                      v.vendorType.toLowerCase().contains(q);
                  return matchesCat && matchesSearch;
                }).toList();

                if (vendors.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(vendorsProvider),
                    child: ListView(
                      padding: const EdgeInsets.all(24),
                      children: const [
                        SizedBox(height: 60),
                        Center(child: Text('🏬', style: TextStyle(fontSize: 48))),
                        SizedBox(height: 12),
                        Center(
                          child: Text(
                            'No stores available',
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                          ),
                        ),
                        SizedBox(height: 6),
                        Center(
                          child: Text(
                            'Check back soon as new vendors join the marketplace.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: BrandColors.textMuted, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(vendorsProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: filtered.length + 1,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      if (i == 0) {
                        return Padding(
                          padding: const EdgeInsets.only(left: 4, bottom: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${filtered.length} Marketplace Store${filtered.length == 1 ? '' : 's'}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: Color(0xFF334155),
                                ),
                              ),
                              const Text(
                                'Pan-India Delivery',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0284C7),
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      return _StoreRow(vendor: filtered[i - 1]);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: widget.embedded
          ? null
          : const AppBottomNav(activeTab: 'Stores'),
    );

    if (widget.embedded) return scaffold;
    return SafePopScope(child: scaffold);
  }
}

class _StoreRow extends ConsumerWidget {
  final Vendor vendor;
  const _StoreRow({required this.vendor});

  String get _distanceLabel {
    final m = vendor.distanceMeters;
    if (m == null) return '';
    if (m < 1000) return '${m.round()} m away';
    return '${(m / 1000).toStringAsFixed(1)} km away';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = context.brand;
    final isFav = ref.watch(favouriteStoresProvider).contains(vendor.id);

    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x06000000),
              blurRadius: 8,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Store logo container with BoxFit.contain so logos are NEVER cut off
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  clipBehavior: Clip.antiAlias,
                  padding: const EdgeInsets.all(4),
                  child: vendor.logo != null
                      ? CachedNetworkImage(
                          imageUrl: vendor.logo!,
                          fit: BoxFit.contain,
                        )
                      : Container(
                          decoration: BoxDecoration(gradient: b.gradient),
                          child: Center(
                            child: Text(
                              vendor.name.isNotEmpty ? vendor.name[0] : '🏬',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 22,
                              ),
                            ),
                          ),
                        ),
                ),
                const SizedBox(width: 12),

                // Name & details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        vendor.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15.5,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${vendor.productCount} products · ${vendor.vendorType}',
                        style: const TextStyle(
                          color: BrandColors.textMuted,
                          fontSize: 12.5,
                        ),
                      ),
                      if (vendor.ratingCount > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Row(
                            children: [
                              const Icon(Icons.star_rounded, size: 14, color: BrandColors.star),
                              Text(
                                ' ${vendor.ratingAvg.toStringAsFixed(1)} (${vendor.ratingCount})',
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF334155),
                                ),
                              ),
                              if (_distanceLabel.isNotEmpty) ...[
                                const Text(' · ', style: TextStyle(color: Color(0xFF94A3B8))),
                                Text(
                                  _distanceLabel,
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                ),
                              ],
                            ],
                          ),
                        ),
                    ],
                  ),
                ),

                // Favourite toggle
                IconButton(
                  icon: Icon(
                    isFav ? Icons.favorite : Icons.favorite_border_rounded,
                    color: isFav ? const Color(0xFFE11D48) : BrandColors.textMuted,
                    size: 20,
                  ),
                  onPressed: () async {
                    final ok = await ref.read(favouriteStoresProvider.notifier).toggle(vendor.id);
                    if (!ok && context.mounted) context.push('/login');
                  },
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Delivery Badge Row
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: vendor.isNowEligible
                    ? const Color(0xFFFEF3C7)
                    : (vendor.isLocal ? const Color(0xFFDCFCE7) : const Color(0xFFE0F2FE)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    vendor.isNowEligible ? '⚡' : (vendor.isLocal ? '⚡' : '📦'),
                    style: const TextStyle(fontSize: 11),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    vendor.estimatedDelivery ??
                        (vendor.isLocal ? '⚡ Instant Delivery' : '📦 Standard Delivery · 5–6 days'),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: vendor.isNowEligible
                          ? const Color(0xFF92400E)
                          : (vendor.isLocal ? const Color(0xFF16A34A) : const Color(0xFF0369A1)),
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
