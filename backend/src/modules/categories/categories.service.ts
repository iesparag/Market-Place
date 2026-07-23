import type { Category as CategoryInput } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import { Category } from './category.model.js';

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
};
