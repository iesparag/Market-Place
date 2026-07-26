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
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: const Color(0xFFE2E8E4)),
          boxShadow: const [
            BoxShadow(
                color: Color(0x0F000000), blurRadius: 10, offset: Offset(0, 3)),
          ],
        ),
        child: Row(children: [
          Icon(Icons.search_rounded, color: context.brand.primary, size: 21),
          const SizedBox(width: 9),
          Expanded(child: Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13.5, fontWeight: FontWeight.w500))),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => context.push('/search?voice=1'),
            child: Icon(Icons.mic_rounded, color: context.brand.primary, size: 20),
          ),
        ]),
      ),
    );
  }
}
