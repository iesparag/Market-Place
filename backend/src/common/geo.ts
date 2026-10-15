/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Real delivery ETA from distance — replaces the old round-robin mock string.
 * Rounded to a 5-minute low bound with a 10-minute window, same visual shape as the
 * mock it replaces (e.g. "15-20 min") so no UI change is needed on the client. */
export function etaLabel(
  distanceKm: number,
  opts: { baseMinutes: number; avgSpeedKmh: number },
): string {
  const minutes = opts.baseMinutes + (distanceKm / opts.avgSpeedKmh) * 60;
  const low = Math.max(10, Math.round(minutes / 5) * 5 - 5);
  return `${low}-${low + 10} min`;
}
