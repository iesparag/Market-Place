import { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler.js';
import { catalogController } from './catalog.controller.js';

/** All public — no auth. The storefront reads from here. */
export const catalogRoutes = Router();

catalogRoutes.get('/home', asyncHandler(catalogController.home));
catalogRoutes.get('/products', asyncHandler(catalogController.listProducts));
catalogRoutes.get('/products/:slug', asyncHandler(catalogController.getProduct));
catalogRoutes.get('/categories', asyncHandler(catalogController.listCategories));
catalogRoutes.get('/category-tree', asyncHandler(catalogController.categoryTree));
catalogRoutes.get('/stores', asyncHandler(catalogController.listStores));
catalogRoutes.get('/stores/:slug', asyncHandler(catalogController.getStore));
