/** Room name builders — one place so server + emitters agree. */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  store: (storeId: string) => `store:${storeId}`,
  order: (orderId: string) => `order:${orderId}`,
  admin: () => 'admin',
  /** A rider's personal room — joined by their own rider-app socket connection. */
  rider: (riderId: string) => `rider:${riderId}`,
};
