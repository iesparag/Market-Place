import 'package:go_router/go_router.dart';
import 'features/shell/app_shell.dart';
import 'features/catalog/catalog_screen.dart';
import 'features/categories/categories_screen.dart';
import 'features/categories/department_screen.dart';
import 'features/product/product_screen.dart';
import 'features/store/store_screen.dart';
import 'features/search/search_screen.dart';
import 'features/cart/cart_screen.dart';
import 'features/checkout/checkout_screen.dart';
import 'features/checkout/addresses_screen.dart';
import 'features/orders/orders_screen.dart';
import 'features/orders/order_success_screen.dart';
import 'features/wishlist/wishlist_screen.dart';
import 'features/vendor/become_vendor_screen.dart';
import 'features/splash/splash_screen.dart';
import 'features/splash/force_update_screen.dart';
import 'features/auth/login_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(
      path: '/force-update',
      builder: (_, s) => ForceUpdateScreen(
        url: s.uri.queryParameters['url'] ?? '',
        message: s.uri.queryParameters['msg'] ?? 'Please update to the latest version.',
      ),
    ),
    GoRoute(path: '/', builder: (_, __) => const AppShell()),
    GoRoute(
      path: '/catalog',
      builder: (_, s) => CatalogScreen(
        category: s.uri.queryParameters['category'],
        dept: s.uri.queryParameters['dept'],
        sort: s.uri.queryParameters['sort'],
        q: s.uri.queryParameters['q'],
        title: s.uri.queryParameters['title'],
      ),
    ),
    GoRoute(path: '/categories', builder: (_, __) => const CategoriesScreen()),
    GoRoute(path: '/department/:slug', builder: (_, s) => DepartmentScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/p/:slug', builder: (_, s) => ProductScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/store/:slug', builder: (_, s) => StoreScreen(slug: s.pathParameters['slug']!)),
    GoRoute(
        path: '/search',
        builder: (_, s) =>
            SearchScreen(autoVoice: s.uri.queryParameters['voice'] == '1')),
    GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
    GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
    GoRoute(path: '/addresses', builder: (_, __) => const AddressesScreen()),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(path: '/order-success', builder: (_, s) => OrderSuccessScreen(number: s.uri.queryParameters['number'] ?? '')),
    GoRoute(path: '/wishlist', builder: (_, __) => const WishlistScreen()),
    GoRoute(path: '/become-vendor', builder: (_, __) => const BecomeVendorScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
  ],
);
