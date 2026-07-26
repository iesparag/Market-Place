import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';

/// Tappable search field → opens the search screen. Consistent across tabs.
class SearchBarPill extends StatelessWidget {
  final String hint;
  const SearchBarPill({super.key, this.hint = 'Search products, brands, stores…'});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/search'),
      child: Container(
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(11)),
        child: Row(children: [
          const Icon(Icons.search_rounded, color: BrandColors.textMuted, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13.5))),
        ]),
      ),
    );
  }
}
