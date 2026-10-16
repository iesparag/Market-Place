import 'dart:math' as math;
import '../../models/address.dart';
import '../../models/store.dart';

class DeliverabilityResult {
  final bool isLocal;
  final double? distanceKm;
  final String estimatedSLA; // e.g. "⚡ 15–30 mins", "📦 5–7 business days"
  final String description;

  const DeliverabilityResult({
    required this.isLocal,
    this.distanceKm,
    required this.estimatedSLA,
    required this.description,
  });
}

double haversineDistanceKm(double lat1, double lon1, double lat2, double lon2) {
  const p = 0.017453292519943295; // Math.PI / 180
  final a = 0.5 -
      math.cos((lat2 - lat1) * p) / 2 +
      math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2;
  return 12742 * math.asin(math.sqrt(a)); // 2 * R; R = 6371 km
}

/// Evaluates deliverability for a vendor against a destination delivery address.
///
/// Rules:
/// 1. If both destination and vendor have GPS coords, check haversine <= 15 km.
/// 2. If coords unavailable, check city and pincode:
///    - If cities differ (e.g. Ahmedabad vs Belai/Banda), it is strictly NON-LOCAL (Standard Courier).
///    - If pincode state prefix differs (e.g. 38xxxx Gujarat vs 47xxxx MP), strictly NON-LOCAL.
/// 3. Non-local orders are fulfilled via Standard Courier (5–7 business days).
DeliverabilityResult evaluateDeliverability({
  required Address? address,
  required Vendor? vendor,
}) {
  if (vendor == null) {
    return const DeliverabilityResult(
      isLocal: false,
      estimatedSLA: '5–7 business days',
      description: 'Standard Delivery',
    );
  }

  // 1. If no address selected yet, check vendor flag and prompt for address
  if (address == null) {
    final local = vendor.isLocal;
    return DeliverabilityResult(
      isLocal: local,
      estimatedSLA: local ? (vendor.isOpenNow ? '15–30 mins' : 'Next 1–3 days') : '5–7 business days',
      description: local ? 'Select address to confirm delivery time' : 'Standard Courier Delivery',
    );
  }

  // 2. Exact GPS Distance
  if (address.lat != null && address.lng != null && vendor.lat != null && vendor.lng != null) {
    final dist = haversineDistanceKm(address.lat!, address.lng!, vendor.lat!, vendor.lng!);
    final isWithinRadius = dist <= 15.0; // 15 km local threshold
    if (isWithinRadius) {
      return DeliverabilityResult(
        isLocal: true,
        distanceKm: dist,
        estimatedSLA: vendor.isOpenNow ? '15–30 mins' : 'Next 1–3 days',
        description: '⚡ Local Delivery (${dist.toStringAsFixed(1)} km away)',
      );
    } else {
      return DeliverabilityResult(
        isLocal: false,
        distanceKm: dist,
        estimatedSLA: '5–7 business days',
        description: '📦 Intercity Courier (${dist.toStringAsFixed(0)} km away)',
      );
    }
  }

  // 3. Fallback: City and Pincode Analysis
  final addrCity = address.city.trim().toLowerCase();
  final vendorCity = (vendor.city ?? 'Ahmedabad').trim().toLowerCase();
  final addrPin = (address.pincode ?? '').trim();

  // If address has city and vendor has city
  if (addrCity.isNotEmpty && vendorCity.isNotEmpty) {
    final cityMatches = addrCity == vendorCity ||
        addrCity.contains(vendorCity) ||
        vendorCity.contains(addrCity);

    if (!cityMatches) {
      return DeliverabilityResult(
        isLocal: false,
        estimatedSLA: '5–7 business days',
        description: '📦 Standard Courier Delivery (${address.city})',
      );
    }
  }

  // 4. Pincode regional prefix check
  if (addrPin.length >= 2) {
    // If vendor is in Ahmedabad/Gujarat (postal prefix 36-39) but destination is outside (e.g. 47xxxx MP)
    if (vendorCity.contains('ahmedabad') || vendor.city == null || vendor.city!.isEmpty) {
      final isGujarat = addrPin.startsWith('36') ||
          addrPin.startsWith('37') ||
          addrPin.startsWith('38') ||
          addrPin.startsWith('39');
      if (!isGujarat) {
        return DeliverabilityResult(
          isLocal: false,
          estimatedSLA: '5–7 business days',
          description: '📦 Standard Courier Delivery (${address.city} · ${address.pincode})',
        );
      }
    }
  }

  // 5. Vendor itself flagged as non-local
  if (!vendor.isLocal) {
    return const DeliverabilityResult(
      isLocal: false,
      estimatedSLA: '5–7 business days',
      description: '📦 Standard Courier Delivery',
    );
  }

  // 6. Same city match
  return DeliverabilityResult(
    isLocal: true,
    estimatedSLA: vendor.isOpenNow ? '15–30 mins' : 'Next 1–3 days',
    description: '⚡ Local Delivery (${address.city.isNotEmpty ? address.city : "Same City"})',
  );
}
