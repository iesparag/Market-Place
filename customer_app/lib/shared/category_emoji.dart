// Single source of truth for the little category icons used in the left rails
// (store page + Products tab) and the home department strip.
const _catEmoji = {
  // fashion
  'shirts': '👔', 't-shirts': '👕', 'jeans': '👖', 'kurtis': '🥻', 'sarees': '🥻',
  'dresses': '👗', 'boys-clothing': '👦', 'girls-clothing': '👧', 'toys': '🧸',
  // electronics
  'smartphones': '📱', 'laptops': '💻', 'audio': '🎧', 'wrist-watches': '⌚',
  // pharmacy
  'medicines': '💊', 'wellness-otc': '🌿',
  // food
  'pizza': '🍕', 'burgers-wraps': '🍔', 'biryani': '🍛',
  // grocery
  'dals-pulses': '🫘', 'spices-masala': '🌶️', 'atta-flour': '🌾',
  'edible-oil': '🛢️', 'rice-grains': '🍚',
  // departments
  'fashion': '👗', 'electronics': '📱', 'watches': '⌚', 'pharmacy': '💊',
  'food-beverages': '🍔', 'food': '🍔', 'grocery-dept': '🛒',
  'kirana-grocery': '🛒', 'home-kitchen': '🍳', 'beauty': '💄',
};

/// Emoji for a category slug. `null`/unknown → a generic shopping-bag.
String categoryEmoji(String? slug) =>
    slug == null ? '🛍️' : (_catEmoji[slug] ?? '🛍️');
