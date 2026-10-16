import 'package:go_router/go_router.dart';
import 'features/splash/splash_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/rider_shell.dart';
import 'features/offers/offers_screen.dart';
import 'features/tasks/tasks_screen.dart';
import 'features/tasks/task_detail_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/', builder: (_, __) => const RiderShell()),
    GoRoute(path: '/offers', builder: (_, __) => const OffersScreen()),
    GoRoute(path: '/tasks', builder: (_, __) => const TasksScreen()),
    GoRoute(path: '/tasks/:id', builder: (_, s) => TaskDetailScreen(taskId: s.pathParameters['id']!)),
  ],
);
