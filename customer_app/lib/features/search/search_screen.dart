import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/suggestion.dart';

class SearchScreen extends ConsumerStatefulWidget {
  final bool autoVoice; // opened via the mic → start listening immediately
  const SearchScreen({super.key, this.autoVoice = false});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  Suggestion? _sugg;
  bool _loading = false;

  // Voice search
  final SpeechToText _speech = SpeechToText();
  bool _speechReady = false;
  bool _listening = false;

  @override
  void initState() {
    super.initState();
    if (widget.autoVoice) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _toggleMic());
    }
  }

  void _onType(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() => _sugg = null);
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final r = await ref.read(catalogRepoProvider).suggest(v.trim());
        if (mounted) {
          setState(() {
            _sugg = r;
            _loading = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  // ── Voice ──────────────────────────────────────────────────────────────────
  Future<void> _toggleMic() async {
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    if (!_speechReady) {
      _speechReady = await _speech.initialize(
        onStatus: (s) {
          if ((s == 'done' || s == 'notListening') && mounted) {
            setState(() => _listening = false);
          }
        },
        onError: (_) {
          if (mounted) setState(() => _listening = false);
        },
      );
    }
    if (!_speechReady) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Mic unavailable — allow microphone permission')));
      }
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      onResult: _onSpeechResult,
      listenOptions: SpeechListenOptions(
        listenFor: const Duration(seconds: 20),
        pauseFor: const Duration(seconds: 3),
        localeId: 'en_IN',
        partialResults: true,
      ),
    );
  }

  void _onSpeechResult(SpeechRecognitionResult r) {
    final words = r.recognizedWords;
    _ctrl.value = TextEditingValue(
      text: words,
      selection: TextSelection.collapsed(offset: words.length),
    );
    _onType(words);
    if (r.finalResult && mounted) {
      setState(() => _listening = false);
    }
  }

  void _seeAll() {
    final q = _ctrl.text.trim();
    if (q.isNotEmpty) context.push('/catalog?q=${Uri.encodeComponent(q)}');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _speech.stop();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = _sugg;
    final b = context.brand;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _ctrl,
          autofocus: !widget.autoVoice,
          textInputAction: TextInputAction.search,
          onChanged: _onType,
          onSubmitted: (_) => _seeAll(),
          style: const TextStyle(color: BrandColors.ink),
          cursorColor: b.primary,
          decoration: const InputDecoration(
            hintText: 'Search products, brands, stores…',
            hintStyle: TextStyle(color: BrandColors.textMuted),
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
          ),
        ),
        actions: [
          IconButton(
            tooltip: _listening ? 'Stop' : 'Voice search',
            icon: Icon(_listening ? Icons.mic : Icons.mic_none_rounded,
                color: _listening ? b.primary : BrandColors.textMuted),
            onPressed: _toggleMic,
          ),
          IconButton(icon: const Icon(Icons.search), onPressed: _seeAll),
        ],
      ),
      body: _listening
          ? _ListeningView(heard: _ctrl.text)
          : _loading && s == null
              ? const Center(child: CircularProgressIndicator())
              : s == null
                  ? const _Hint()
                  : (s.isEmpty
                      ? const Center(
                          child: Text('No matches',
                              style: TextStyle(color: BrandColors.textMuted)))
                      : ListView(
                          children: [
                            if (s.stores.isNotEmpty) ...[
                              const _GroupLabel('Stores'),
                              ...s.stores.map((st) => _StoreTile(store: st)),
                            ],
                            if (s.products.isNotEmpty) ...[
                              const _GroupLabel('Products'),
                              ...s.products.map((p) => _ProductTile(product: p)),
                            ],
                            ListTile(
                              title: Text(
                                  'See all results for "${_ctrl.text.trim()}"',
                                  style: TextStyle(
                                      color: b.primaryDark,
                                      fontWeight: FontWeight.w700)),
                              trailing: Icon(Icons.arrow_forward_rounded,
                                  color: b.primaryDark),
                              onTap: _seeAll,
                            ),
                          ],
                        )),
    );
  }
}

class _ListeningView extends StatelessWidget {
  final String heard;
  const _ListeningView({required this.heard});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 96,
          height: 96,
          decoration: BoxDecoration(color: b.soft, shape: BoxShape.circle),
          child: Icon(Icons.mic_rounded, size: 46, color: b.primary),
        ),
        const SizedBox(height: 18),
        Text(heard.isEmpty ? 'Listening…' : heard,
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w800, color: BrandColors.ink)),
        const SizedBox(height: 6),
        const Text('Speak now — tap the mic to stop',
            style: TextStyle(color: BrandColors.textMuted)),
      ]),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  final String label;
  const _GroupLabel(this.label);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
        child: Text(label.toUpperCase(),
            style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: BrandColors.textMuted,
                letterSpacing: 0.6)),
      );
}

class _StoreTile extends StatelessWidget {
  final SuggestStore store;
  const _StoreTile({required this.store});
  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(
          backgroundColor: context.brand.primary,
          backgroundImage: store.logo != null
              ? CachedNetworkImageProvider(store.logo!)
              : null,
          child: store.logo == null
              ? Text(store.name.isNotEmpty ? store.name[0] : '?',
                  style: const TextStyle(color: Colors.white))
              : null,
        ),
        title: Text(store.name,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: const Text('Visit store'),
        onTap: () => context.push('/store/${store.slug}'),
      );
}

class _ProductTile extends StatelessWidget {
  final SuggestProduct product;
  const _ProductTile({required this.product});
  @override
  Widget build(BuildContext context) => ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 44,
            height: 44,
            child: product.image != null
                ? CachedNetworkImage(
                    imageUrl: product.image!, fit: BoxFit.cover)
                : Container(
                    color: const Color(0xFFF1F1F4),
                    child: const Icon(Icons.image_outlined, size: 18)),
          ),
        ),
        title: Text(product.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle:
            Text('${product.storeName ?? ''} · ${rupees(product.minPrice)}'),
        onTap: () => context.push('/p/${product.slug}'),
      );
}

class _Hint extends StatelessWidget {
  const _Hint();
  @override
  Widget build(BuildContext context) => const Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.search_rounded, size: 48, color: BrandColors.textMuted),
          SizedBox(height: 8),
          Text('Search across all vendors',
              style: TextStyle(color: BrandColors.textMuted)),
          SizedBox(height: 4),
          Text('or tap the mic to search by voice',
              style: TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
        ]),
      );
}
