/** Attached to req by middleware/authenticateRider.ts. Deliberately not `AuthUser` — a rider is not a `User`. */
export interface RiderAuthPayload {
  riderId: string;
  tenantId: string;
  type: 'rider';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rider?: RiderAuthPayload;
    }
  }
}

export {};
