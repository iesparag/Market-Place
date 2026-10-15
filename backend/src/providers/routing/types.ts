/** [lng, lat] pairs — GeoJSON order, matches Store.location and the OSRM response shape. */
export type RouteCoordinate = [number, number];

export interface RouteResult {
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutingProvider {
  readonly name: string;
  route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult | null>;
}
