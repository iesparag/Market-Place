import type { Category as CategoryInput } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import { Category } from './category.model.js';
import { Product } from '../products/product.model.js';

export const categoriesService = {
  async list() {
    return Category.find().lean();
  },
  async getById(id: string) {
    const cat = await Category.findById(id).lean();
    if (!cat) throw AppError.notFound('Category not found');
    return cat;
  },
  async create(input: CategoryInput) {
    return Category.create(input);
  },
  async update(id: string, input: Partial<CategoryInput>) {
    const cat = await Category.findByIdAndUpdate(id, input, { new: true });
    if (!cat) throw AppError.notFound('Category not found');
    return cat;
  },

  /**
   * Refused if any product still uses this category, or any sub-category still has it as
   * parent — deleting either would silently orphan data (a product's categoryId would point
   * nowhere and could never re-validate its attributes; a sub-category's parentId would break
   * the storefront mega-menu tree). Reassign or delete those first.
   */
  async remove(id: string) {
    const cat = await Category.findById(id).lean();
    if (!cat) throw AppError.notFound('Category not found');

    const productCount = await Product.countDocuments({ categoryId: id });
    if (productCount > 0)
      throw AppError.badRequest(
        'CATEGORY_IN_USE',
        `${productCount} product${productCount === 1 ? '' : 's'} still use this category. Move or delete them first.`,
      );

    const childCount = await Category.countDocuments({ parentId: id });
    if (childCount > 0)
      throw AppError.badRequest(
        'CATEGORY_HAS_CHILDREN',
        `This category has ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'}. Delete or move them first.`,
      );

    await Category.deleteOne({ _id: id });
    return { deleted: true };
  },
};
