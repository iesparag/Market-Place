import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'features/shell/app_shell.dart';
import 'features/now/now_screen.dart';
import 'shared/widgets/safe_pop_scope.dart';
import 'features/catalog/catalog_screen.dart';
import 'features/categories/categories_screen.dart';
import 'features/categories/department_screen.dart';
import 'features/product/product_screen.dart';
import 'features/store/store_screen.dart';
import 'features/stores/stores_list_screen.dart';
import 'features/search/search_screen.dart';
import 'features/cart/cart_screen.dart';
import 'features/checkout/checkout_screen.dart';
import 'features/checkout/addresses_screen.dart';
import 'features/account/account_screen.dart';
import 'features/orders/orders_screen.dart';
import 'features/orders/order_detail_screen.dart';
import 'features/orders/order_success_screen.dart';
import 'features/wishlist/wishlist_screen.dart';
import 'features/favourites/favourite_stores_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/vendor/become_vendor_screen.dart';
import 'features/support/support_screen.dart';
import 'features/splash/splash_screen.dart';
import 'features/splash/force_update_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/forgot_password_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(
      path: '/force-update',
      builder: (_, s) => ForceUpdateScreen(
        url: s.uri.queryParameters['url'] ?? '',
        message: s.uri.queryParameters['msg'] ??
            'Please update to the latest version.',
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
        products: s.uri.queryParameters['products'],
      ),
    ),
    GoRoute(
      path: '/products',
      redirect: (_, s) =>
          s.uri.hasQuery ? '/catalog?${s.uri.query}' : '/catalog',
    ),
    GoRoute(
      path: '/now',
      builder: (_, __) => const SafePopScope(
        child: Scaffold(
          body: NowScreen(),
          bottomNavigationBar: AppBottomNav(activeTab: 'Now'),
        ),
      ),
    ),
    GoRoute(path: '/categories', builder: (_, __) => const CategoriesScreen()),
    GoRoute(
        path: '/department/:slug',
        builder: (_, s) => DepartmentScreen(slug: s.pathParameters['slug']!)),
    GoRoute(
        path: '/p/:slug',
        builder: (_, s) => ProductScreen(slug: s.pathParameters['slug']!)),
    GoRoute(
        path: '/store/:slug',
        builder: (_, s) => StoreScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/stores', builder: (_, __) => const StoresListScreen()),
    GoRoute(
        path: '/search',
        builder: (_, s) =>
            SearchScreen(autoVoice: s.uri.queryParameters['voice'] == '1')),
    GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
    GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
    GoRoute(path: '/addresses', builder: (_, __) => const AddressesScreen()),
    GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(
        path: '/order/:id',
        builder: (_, s) => OrderDetailScreen(orderId: s.pathParameters['id']!)),
    GoRoute(
      path: '/order-success',
      builder: (_, s) => OrderSuccessScreen(
        number: s.uri.queryParameters['number'] ?? '',
        orderId: s.uri.queryParameters['id'] ?? '',
        paid: s.uri.queryParameters['paid'] == '1',
        cod: s.uri.queryParameters['cod'] == '1',
      ),
    ),
    GoRoute(path: '/wishlist', builder: (_, __) => const WishlistScreen()),
    GoRoute(
        path: '/favourite-stores',
        builder: (_, __) => const FavouriteStoresScreen()),
    GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen()),
    GoRoute(
        path: '/become-vendor', builder: (_, __) => const BecomeVendorScreen()),
    GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordScreen()),
  ],
);
