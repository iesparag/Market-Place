/** Re-export inferred types so apps can `import type { Product } from '@app/shared'`. */
export type { Role, VendorType, OrderStatus, SubOrderStatus, PaymentStatus, Currency, AttributeType } from '../enums/index.js';
export type { AttributeDef, Category } from '../schemas/category.js';
export type { Product, Variant, ModifierGroup } from '../schemas/product.js';
export type { RegisterInput, LoginInput, Me } from '../schemas/auth.js';
export type { ApiResponse, ApiSuccess, ApiError, PaginationMeta, PaginationQuery, ErrorCode } from '../api/index.js';
export type { Permission, NavSectionMeta, NavItemMeta } from '../permissions.js';
export type {
  SocketEvent,
  SocketEventPayloads,
  OrderStatusUpdated,
  SubOrderNew,
  DeliveryLocation,
  InventoryChanged,
  NotificationNew,
  ChatMessage,
} from '../events/index.js';
