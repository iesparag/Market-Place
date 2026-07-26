import 'package:flutter/material.dart';
import '../../core/theme/theme.dart';

/// India FSSAI marker: green dot (veg), red triangle (non-veg), orange dot (egg).
class VegMark extends StatelessWidget {
  final String type; // 'veg' | 'non_veg' | 'egg'
  final double size;
  const VegMark({super.key, required this.type, this.size = 16});

  Color get _color => switch (type) {
        'veg' => BrandColors.success,
        'egg' => const Color(0xFFF59E0B),
        _ => BrandColors.danger,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        border: Border.all(color: _color, width: 1.4),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Center(
        child: type == 'non_veg'
            ? CustomPaint(size: Size(size * 0.55, size * 0.55), painter: _TrianglePainter(_color))
            : Container(
                width: size * 0.5,
                height: size * 0.5,
                decoration: BoxDecoration(color: _color, shape: BoxShape.circle),
              ),
      ),
    );
  }
}

class _TrianglePainter extends CustomPainter {
  final Color color;
  _TrianglePainter(this.color);
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

String? foodTypeOf(Map<String, dynamic> attributes, String? foodType) {
  if (foodType != null && foodType.isNotEmpty) return foodType;
  if (attributes['veg'] == true) return 'veg';
  return null;
}
