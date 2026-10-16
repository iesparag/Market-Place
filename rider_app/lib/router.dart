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
    GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/', builder: (context, state) => const RiderShell()),
    GoRoute(path: '/offers', builder: (context, state) => const OffersScreen()),
    GoRoute(path: '/tasks', builder: (context, state) => const TasksScreen()),
    GoRoute(path: '/tasks/:id', builder: (context, state) => TaskDetailScreen(taskId: state.pathParameters['id']!)),
  ],
);
