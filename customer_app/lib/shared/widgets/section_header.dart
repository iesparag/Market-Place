import 'package:flutter/material.dart';
import '../../core/theme/theme.dart';

class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  const SectionHeader(
      {super.key,
      required this.title,
      this.subtitle,
      this.actionLabel,
      this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 15, 10, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 4,
            height: subtitle != null && subtitle!.isNotEmpty ? 30 : 18,
            margin: const EdgeInsets.only(right: 9),
            decoration: BoxDecoration(
                gradient: context.brand.gradient,
                borderRadius: BorderRadius.circular(3)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 17.5,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.2,
                        height: 1.05)),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(subtitle!,
                        style: const TextStyle(
                            color: BrandColors.textMuted, fontSize: 12)),
                  ),
              ],
            ),
          ),
          if (actionLabel != null)
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(34, 32),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: onAction,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(actionLabel!,
                    style: TextStyle(
                        color: context.brand.primaryDark,
                        fontWeight: FontWeight.w800,
                        fontSize: 13)),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: context.brand.primaryDark),
              ]),
            ),
        ],
      ),
    );
  }
}
