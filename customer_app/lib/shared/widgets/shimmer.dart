import 'package:flutter/material.dart';

/// Lightweight shimmer placeholder (no extra package).
class Shimmer extends StatefulWidget {
  final double width;
  final double height;
  final double radius;
  const Shimmer({super.key, this.width = double.infinity, this.height = 14, this.radius = 8});

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final v = _c.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(-1 - 2 * v, 0),
              end: Alignment(1 - 2 * v, 0),
              colors: const [Color(0xFFECECEC), Color(0xFFF6F6F6), Color(0xFFECECEC)],
            ),
          ),
        );
      },
    );
  }
}

/// A skeleton card matching the product card layout.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE7E7EC)),
      ),
      padding: const EdgeInsets.all(10),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(aspectRatio: 1, child: Shimmer(radius: 10)),
          SizedBox(height: 10),
          Shimmer(height: 12),
          SizedBox(height: 8),
          Shimmer(height: 12, width: 90),
          SizedBox(height: 12),
          Shimmer(height: 16, width: 70, radius: 6),
        ],
      ),
    );
  }
}
