import 'package:go_router/go_router.dart';
import 'features/shell/app_shell.dart';
import 'features/catalog/catalog_screen.dart';
import 'features/product/product_screen.dart';
import 'features/store/store_screen.dart';
import 'features/search/search_screen.dart';
import 'features/auth/login_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const AppShell()),
    GoRoute(
      path: '/catalog',
      builder: (_, s) => CatalogScreen(
        category: s.uri.queryParameters['category'],
        sort: s.uri.queryParameters['sort'],
        q: s.uri.queryParameters['q'],
        title: s.uri.queryParameters['title'],
      ),
    ),
    GoRoute(path: '/p/:slug', builder: (_, s) => ProductScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/store/:slug', builder: (_, s) => StoreScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
  ],
);
