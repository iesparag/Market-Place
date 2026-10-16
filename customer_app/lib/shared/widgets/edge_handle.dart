import 'package:flutter/material.dart';
import '../../core/theme/theme.dart';

/// A small vertical pull-tab — like the Samsung Edge panel handle — used in place of
/// a chevron for category rail collapse/expand toggles in CatalogScreen and StoreScreen.
class EdgeHandle extends StatelessWidget {
  final bool collapsed;
  const EdgeHandle({super.key, this.collapsed = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 5,
      height: 48,
      decoration: BoxDecoration(
        color: collapsed ? context.brand.primary : const Color(0xFF94A3B8),
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [
          BoxShadow(
            color: Color(0x24000000),
            blurRadius: 4,
            offset: Offset(1, 1),
          ),
        ],
      ),
      child: Center(
        child: Container(
          width: 1.5,
          height: 16,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.8),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ),
    );
  }
}
