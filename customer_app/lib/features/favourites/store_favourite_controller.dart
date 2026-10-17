import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';

/// Favourite STORES = set of store IDs, backed by /favourite-stores. Exact mirror of
/// WishlistController (features/wishlist/wishlist_controller.dart) — same optimistic
/// toggle + revert-on-error shape, kept as a separate controller rather than unifying
/// with the product wishlist since the two have no shared id-space.
class StoreFavouriteController extends StateNotifier<Set<String>> {
  final Ref ref;
  StoreFavouriteController(this.ref) : super({}) {
    load();
    ref.listen(authProvider, (_, __) => load());
  }

  Future<void> load() async {
    if (ref.read(authProvider) == null) {
      state = {};
      return;
    }
    try {
      final data =
          await ref.read(apiClientProvider).get('/favourite-stores') as List;
      state = data.map((s) => (s['_id']).toString()).toSet();
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
        await ref.read(apiClientProvider).delete('/favourite-stores/$id');
      } else {
        await ref
            .read(apiClientProvider)
            .post('/favourite-stores', body: {'storeId': id});
      }
    } catch (_) {
      state = was ? {...state, id} : ({...state}..remove(id)); // revert
    }
    return true;
  }
}

final favouriteStoresProvider =
    StateNotifierProvider<StoreFavouriteController, Set<String>>(
        (ref) => StoreFavouriteController(ref));
