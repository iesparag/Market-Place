import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';

/// Global wishlist = set of product IDs. Backed by /wishlist when signed in.
class WishlistController extends StateNotifier<Set<String>> {
  final Ref ref;
  WishlistController(this.ref) : super({}) {
    load();
    // Reload whenever the user signs in / out.
    ref.listen(authProvider, (_, __) => load());
  }

  Future<void> load() async {
    if (ref.read(authProvider) == null) {
      state = {};
      return;
    }
    try {
      final data = await ref.read(apiClientProvider).get('/wishlist') as List;
      state = data.map((p) => (p['_id']).toString()).toSet();
    } catch (_) {/* ignore */}
  }

  bool has(String id) => state.contains(id);

  /// Returns false if the user isn't signed in (caller should prompt login).
  Future<bool> toggle(String id) async {
    if (ref.read(authProvider) == null) return false;
    final was = has(id);
    state = was ? ({...state}..remove(id)) : {...state, id}; // optimistic
    try {
      if (was) {
        await ref.read(apiClientProvider).delete('/wishlist/$id');
      } else {
        await ref.read(apiClientProvider).post('/wishlist', body: {'productId': id});
      }
    } catch (_) {
      state = was ? {...state, id} : ({...state}..remove(id)); // revert
    }
    return true;
  }
}

final wishlistProvider = StateNotifierProvider<WishlistController, Set<String>>((ref) => WishlistController(ref));
