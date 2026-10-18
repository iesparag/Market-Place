import { haversineKm } from '../../common/geo.js';
import { sum } from '../../common/money.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { SettingsDoc } from '../settings/settings.model.js';

export interface VendorDeliveryCalculation {
  storeId: string;
  storeName: string;
  storeCity: string;
  customerCity: string;
  pickupCoords?: { lat: number; lng: number };
  dropCoords?: { lat: number; lng: number };
  distanceKm: number | null;
  isLocal: boolean;
  deliveryType: 'local_now' | 'third_party_courier';
  baseFee: number;
  baseKm?: number;
  perKmFee?: number;
  extraKm?: number;
  extraKmFee?: number;
  vendorDeliveryFee: number;
  calculationText: string;
}

export interface MultiVendorDeliveryBreakdown {
  totalDeliveryFee: number;
  finalDeliveryFee: number;
  isFreeDelivery: boolean;
  freeDeliveryAbove: number;
  freeDeliveryRemaining: number;
  vendors: VendorDeliveryCalculation[];
  rules: {
    localDeliveryBaseFee: number;
    localDeliveryBaseKm: number;
    localDeliveryPerKmFee: number;
    thirdPartyDeliveryFee: number;
    freeDeliveryAbove: number;
  };
}

export interface StoreInfoForDelivery {
  _id: unknown;
  name: string;
  address?: { city?: string | null; line1?: string | null } | null;
  city?: string | null;
  location?: { coordinates?: [number, number] } | null; // GeoJSON [lng, lat]
}

export interface ShippingAddressForDelivery {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export const deliveryPricingService = {
  calculate({
    stores,
    shippingAddress,
    itemsTotal,
    settings,
  }: {
    stores: StoreInfoForDelivery[];
    shippingAddress?: ShippingAddressForDelivery | null;
    itemsTotal: number;
    settings: Partial<SettingsDoc>;
  }): MultiVendorDeliveryBreakdown {
    const localDeliveryBaseFee = settings.localDeliveryBaseFee ?? 3000; // ₹30
    const localDeliveryBaseKm = settings.localDeliveryBaseKm ?? 3; // 3 km
    const localDeliveryPerKmFee = settings.localDeliveryPerKmFee ?? 1000; // ₹10/km
    const thirdPartyDeliveryFee = settings.thirdPartyDeliveryFee ?? 7000; // ₹70
    const freeDeliveryAbove = settings.freeDeliveryAbove ?? 50000; // ₹500

    const destLat = shippingAddress?.lat ?? undefined;
    const destLng = shippingAddress?.lng ?? undefined;
    const destCity = (shippingAddress?.city ?? '').trim().toLowerCase();
    const destPincode = (shippingAddress?.pincode ?? '').trim();

    const localRadiusKm = Math.max(env.SERVICEABLE_RADIUS_KM || 15, 25);
    const vendorCalculations: VendorDeliveryCalculation[] = [];

    for (const store of stores) {
      const storeIdStr = String(store._id);
      const storeName = store.name || 'Store';
      const storeCoords = store.location?.coordinates; // [lng, lat]
      const vendorLng = storeCoords?.[0];
      const vendorLat = storeCoords?.[1];
      const storeCity = (store.address?.city ?? store.city ?? '').trim().toLowerCase();

      let distanceKm: number | null = null;
      let isLocal = false;

      // 1. Precise GPS Distance if available
      if (destLat != null && destLng != null && vendorLat != null && vendorLng != null) {
        const d = haversineKm({ lat: destLat, lng: destLng }, { lat: vendorLat, lng: vendorLng });
        distanceKm = Math.round(d * 10) / 10;
        isLocal = distanceKm <= localRadiusKm;
      } else {
        // 2. City-based heuristic fallback
        if (destCity && storeCity) {
          isLocal = destCity === storeCity || destCity.includes(storeCity) || storeCity.includes(destCity);
        } else {
          isLocal = true; // fail-open local
        }
      }

      // Check pincode state prefix if available
      if (isLocal && destPincode.length >= 2 && storeCity.includes('ahmedabad')) {
        const isGujarat =
          destPincode.startsWith('36') ||
          destPincode.startsWith('37') ||
          destPincode.startsWith('38') ||
          destPincode.startsWith('39');
        if (!isGujarat) {
          isLocal = false;
        }
      }

      let vendorDeliveryFee = 0;
      let calculationText = '';
      let extraKm: number | undefined;
      let extraKmFee: number | undefined;

      if (isLocal) {
        if (distanceKm != null) {
          if (distanceKm <= localDeliveryBaseKm) {
            vendorDeliveryFee = localDeliveryBaseFee;
            calculationText = `Base ₹${(localDeliveryBaseFee / 100).toFixed(0)} (up to ${localDeliveryBaseKm} km)`;
          } else {
            extraKm = Math.round((distanceKm - localDeliveryBaseKm) * 10) / 10;
            extraKmFee = Math.round(extraKm * localDeliveryPerKmFee);
            vendorDeliveryFee = localDeliveryBaseFee + extraKmFee;
            calculationText = `Base ₹${(localDeliveryBaseFee / 100).toFixed(0)} (${localDeliveryBaseKm} km) + (${extraKm} km × ₹${(localDeliveryPerKmFee / 100).toFixed(0)}/km) = ₹${(vendorDeliveryFee / 100).toFixed(0)}`;
          }
        } else {
          vendorDeliveryFee = localDeliveryBaseFee;
          calculationText = `Local Base ₹${(localDeliveryBaseFee / 100).toFixed(0)}`;
        }
      } else {
        // Third-party courier delivery
        vendorDeliveryFee = thirdPartyDeliveryFee;
        const distTag = distanceKm != null ? ` (~${Math.round(distanceKm)} km)` : '';
        calculationText = `Third-Party Courier Standard${distTag} = ₹${(thirdPartyDeliveryFee / 100).toFixed(0)}`;
      }

      vendorCalculations.push({
        storeId: storeIdStr,
        storeName,
        storeCity: store.address?.city ?? store.city ?? '',
        customerCity: shippingAddress?.city ?? '',
        pickupCoords: vendorLat != null && vendorLng != null ? { lat: vendorLat, lng: vendorLng } : undefined,
        dropCoords: destLat != null && destLng != null ? { lat: destLat, lng: destLng } : undefined,
        distanceKm,
        isLocal,
        deliveryType: isLocal ? 'local_now' : 'third_party_courier',
        baseFee: isLocal ? localDeliveryBaseFee : thirdPartyDeliveryFee,
        baseKm: isLocal ? localDeliveryBaseKm : undefined,
        perKmFee: isLocal ? localDeliveryPerKmFee : undefined,
        extraKm,
        extraKmFee,
        vendorDeliveryFee,
        calculationText,
      });
    }

    const totalDeliveryFee = sum(vendorCalculations.map((v) => v.vendorDeliveryFee));
    const isFreeDelivery = itemsTotal >= freeDeliveryAbove;
    const finalDeliveryFee = isFreeDelivery ? 0 : totalDeliveryFee;
    const freeDeliveryRemaining = Math.max(0, freeDeliveryAbove - itemsTotal);

    // Comprehensive terminal & application logging for transparency
    console.log('================================================================================');
    console.log('🚚 [MULTI-VENDOR DELIVERY LOG] Calculating delivery charges');
    console.log(`📍 Destination Address: "${shippingAddress?.line1 || ''}, ${shippingAddress?.city || 'Unknown'}" (lat: ${destLat ?? 'N/A'}, lng: ${destLng ?? 'N/A'})`);
    console.log(`🛒 Cart Subtotal: ₹${(itemsTotal / 100).toFixed(2)}, Vendors Count: ${vendorCalculations.length}`);
    for (const v of vendorCalculations) {
      console.log(`  ├─ Vendor: "${v.storeName}" (${v.storeCity || 'City N/A'})`);
      console.log(`  │  Pickup: [${v.pickupCoords?.lat ?? 'N/A'}, ${v.pickupCoords?.lng ?? 'N/A'}] -> Drop: [${v.dropCoords?.lat ?? 'N/A'}, ${v.dropCoords?.lng ?? 'N/A'}]`);
      console.log(`  │  Distance: ${v.distanceKm != null ? `${v.distanceKm} km` : 'N/A'}`);
      console.log(`  │  Type: ${v.isLocal ? '⚡ Local Now Delivery' : '📦 Third-Party Courier (Intercity)'}`);
      console.log(`  │  Formula: ${v.calculationText}`);
      console.log(`  │  Vendor Delivery Charge: ₹${(v.vendorDeliveryFee / 100).toFixed(2)}`);
    }
    console.log(`📊 Total Delivery Charges across ${vendorCalculations.length} vendor(s): ₹${(totalDeliveryFee / 100).toFixed(2)}`);
    if (isFreeDelivery) {
      console.log(`🎉 Free Delivery Applied! (Cart ₹${(itemsTotal / 100).toFixed(2)} >= Threshold ₹${(freeDeliveryAbove / 100).toFixed(2)}) -> Final Delivery: ₹0`);
    } else {
      console.log(`💰 Final Delivery Charge: ₹${(finalDeliveryFee / 100).toFixed(2)} (Need ₹${(freeDeliveryRemaining / 100).toFixed(2)} more for Free Delivery)`);
    }
    console.log('================================================================================');

    logger.info(
      {
        destination: { city: shippingAddress?.city, lat: destLat, lng: destLng },
        vendors: vendorCalculations.map((v) => ({
          storeId: v.storeId,
          storeName: v.storeName,
          distanceKm: v.distanceKm,
          deliveryType: v.deliveryType,
          chargeRupees: v.vendorDeliveryFee / 100,
          formula: v.calculationText,
        })),
        totalDeliveryChargeRupees: totalDeliveryFee / 100,
        finalDeliveryRupees: finalDeliveryFee / 100,
        freeDeliveryApplied: isFreeDelivery,
      },
      'Multi-vendor delivery charge calculation completed',
    );

    return {
      totalDeliveryFee,
      finalDeliveryFee,
      isFreeDelivery,
      freeDeliveryAbove,
      freeDeliveryRemaining,
      vendors: vendorCalculations,
      rules: {
        localDeliveryBaseFee,
        localDeliveryBaseKm,
        localDeliveryPerKmFee,
        thirdPartyDeliveryFee,
        freeDeliveryAbove,
      },
    };
  },
};
