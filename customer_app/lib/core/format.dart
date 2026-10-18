/// Money is stored in paise (integer minor units) — same as the backend.
String rupees(num paise) {
  final p = paise.round();
  if (p % 100 == 0) {
    return '₹${_indianGroup((p / 100).round())}';
  } else {
    final rs = (p / 100).truncate();
    final rem = (p % 100).abs().toString().padLeft(2, '0');
    return '₹${_indianGroup(rs)}.$rem';
  }
}

/// Indian digit grouping: 1,899 · 12,34,567 (no external package → never crashes).
String _indianGroup(int n) {
  final neg = n < 0;
  final s = n.abs().toString();
  if (s.length <= 3) return '${neg ? '-' : ''}$s';
  final head = s.substring(0, s.length - 3);
  final tail = s.substring(s.length - 3);
  final parts = <String>[];
  var h = head;
  while (h.length > 2) {
    parts.insert(0, h.substring(h.length - 2));
    h = h.substring(0, h.length - 2);
  }
  if (h.isNotEmpty) parts.insert(0, h);
  return '${neg ? '-' : ''}${parts.join(',')},$tail';
}

String timeAgo(String? iso) {
  if (iso == null) return '';
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final sec = DateTime.now().difference(t).inSeconds;
  if (sec < 60) return 'just now';
  final m = sec ~/ 60;
  if (m < 60) return '${m}m ago';
  final h = m ~/ 60;
  if (h < 24) return '${h}h ago';
  return '${h ~/ 24}d ago';
}
