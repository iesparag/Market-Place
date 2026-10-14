import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/geo_suggestion.dart';

/// Free, debounced address search-as-you-type (backed by the `/geocode` proxy —
/// OpenStreetMap/Nominatim, no API key, no billing). Picking a suggestion hands the
/// full result back via [onPicked]; the caller fills its own line1/city/pincode
/// controllers and keeps them editable afterward.
class AddressSearchField extends ConsumerStatefulWidget {
  final ValueChanged<GeoSuggestion> onPicked;
  const AddressSearchField({super.key, required this.onPicked});

  @override
  ConsumerState<AddressSearchField> createState() => _AddressSearchFieldState();
}

class _AddressSearchFieldState extends ConsumerState<AddressSearchField> {
  final _controller = TextEditingController();
  List<GeoSuggestion> _results = [];
  bool _loading = false;
  int _requestId = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String q) async {
    final id = ++_requestId;
    if (q.trim().length < 3) {
      setState(() => _results = []);
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (id != _requestId || !mounted) return; // a newer keystroke superseded this one
    setState(() => _loading = true);
    try {
      final results = await ref.read(geocodeRepoProvider).search(q);
      if (id == _requestId && mounted) setState(() => _results = results);
    } catch (_) {
      if (id == _requestId && mounted) setState(() => _results = []);
    } finally {
      if (id == _requestId && mounted) setState(() => _loading = false);
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
                    child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : null,
          ),
        ),
        if (_results.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 6),
            constraints: const BoxConstraints(maxHeight: 220),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: BrandColors.border),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _results.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = _results[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.location_on_outlined, size: 20),
                  title: Text(r.label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                  onTap: () {
                    _controller.text = r.label;
                    setState(() => _results = []);
                    FocusScope.of(context).unfocus();
                    widget.onPicked(r);
                  },
                );
              },
            ),
          ),
      ],
    );
  }
}
