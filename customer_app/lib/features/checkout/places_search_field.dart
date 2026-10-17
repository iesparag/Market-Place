import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/geo_suggestion.dart';
import '../../models/place_prediction.dart';

String _newSessionToken() {
  final rnd = Random.secure();
  return List.generate(32, (_) => rnd.nextInt(16).toRadixString(16)).join();
}

/// Google Places-backed address search — same debounce-and-list UX as
/// [AddressSearchField] (the free Nominatim one), same [onPicked] callback signature,
/// so it's a drop-in replacement at any existing call site. One session token is
/// generated per field instance and reused across every keystroke's autocomplete call
/// plus the final details call — Google's documented cost-saving mechanism for this
/// exact Autocomplete+Details pairing. A fresh token is generated after each pick so
/// the next address entry starts its own session.
class PlacesSearchField extends ConsumerStatefulWidget {
  final ValueChanged<GeoSuggestion> onPicked;
  const PlacesSearchField({super.key, required this.onPicked});

  @override
  ConsumerState<PlacesSearchField> createState() => _PlacesSearchFieldState();
}

class _PlacesSearchFieldState extends ConsumerState<PlacesSearchField> {
  final _controller = TextEditingController();
  List<PlacePrediction> _predictions = [];
  bool _loading = false;
  int _requestId = 0;
  String _sessionToken = _newSessionToken();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String q) async {
    final id = ++_requestId;
    if (q.trim().length < 3) {
      setState(() => _predictions = []);
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (id != _requestId || !mounted)
      return; // a newer keystroke superseded this one
    setState(() => _loading = true);
    try {
      final results =
          await ref.read(placesRepoProvider).autocomplete(q, _sessionToken);
      if (id == _requestId && mounted) setState(() => _predictions = results);
    } catch (_) {
      if (id == _requestId && mounted) setState(() => _predictions = []);
    } finally {
      if (id == _requestId && mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pick(PlacePrediction p) async {
    _controller.text = p.description;
    setState(() {
      _predictions = [];
      _loading = true;
    });
    FocusScope.of(context).unfocus();
    try {
      final details =
          await ref.read(placesRepoProvider).details(p.placeId, _sessionToken);
      if (details != null && mounted) widget.onPicked(details);
    } finally {
      if (mounted) setState(() => _loading = false);
      _sessionToken =
          _newSessionToken(); // discard — next address entry starts a new session
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _controller,
          onChanged: _onChanged,
          decoration: InputDecoration(
            labelText: 'Search a place, area, landmark…',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _loading
                ? const Padding(
                    padding: EdgeInsets.all(14),
                    child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : null,
          ),
        ),
        if (_predictions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 6),
            constraints: const BoxConstraints(maxHeight: 220),
            decoration: BoxDecoration(
              color: context.colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.colors.border),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _predictions.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = _predictions[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.location_on_outlined, size: 20),
                  title: Text(p.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13)),
                  onTap: () => _pick(p),
                );
              },
            ),
          ),
      ],
    );
  }
}
