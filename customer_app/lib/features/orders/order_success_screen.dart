import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';

class OrderSuccessScreen extends StatelessWidget {
  final String number;
  /// True when the money is already collected; false for cash on delivery.
  final bool paid;
  final bool cod;
  const OrderSuccessScreen({super.key, required this.number, this.paid = false, this.cod = false});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 96, height: 96,
                decoration: const BoxDecoration(color: Color(0xFFE7F8EE), shape: BoxShape.circle),
                child: Icon(cod ? Icons.local_shipping_rounded : Icons.check_rounded,
                    color: BrandColors.success, size: 56),
              ),
              const SizedBox(height: 20),
              Text(
                cod ? 'Order confirmed! 🎉' : paid ? 'Payment successful! 🎉' : 'Order placed! 🎉',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text(
                cod
                    ? 'Keep the cash ready — you will pay the delivery agent when it arrives.'
                    : paid
                        ? 'Thank you — your order is confirmed and paid.'
                        : 'Thank you — we are confirming your payment.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.textMuted),
              ),
              if (number.isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(10)),
                  child: Text('Order $number', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                ),
              ],
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity, height: 50,
                child: ElevatedButton(onPressed: () => context.go('/orders'), child: const Text('View my orders')),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity, height: 50,
                child: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Continue shopping')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
