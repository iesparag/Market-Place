import 'package:intl/intl.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// Money is stored in paise (integer minor units) — same as the backend.
String rupees(num paise) => '₹${_inr.format((paise / 100).round())}';

String timeAgo(String? iso) {
  if (iso == null) return '';
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final s = DateTime.now().difference(t).inSeconds;
  if (s < 60) return 'just now';
  final m = s ~/ 60;
  if (m < 60) return '${m}m ago';
  final h = m ~/ 60;
  if (h < 24) return '${h}h ago';
  return '${h ~/ 24}d ago';
}
