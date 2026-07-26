// DNS-over-HTTPS support for the Dio client. Real impl on mobile/desktop
// (dart:io); a no-op on web where the browser handles DNS itself.
export 'doh_noop.dart' if (dart.library.io) 'doh_io.dart';
