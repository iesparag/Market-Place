import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';

/// Resolve hostnames via DNS-over-HTTPS (Cloudflare → Google), bypassing the
/// device's system resolver. On some ISPs / mobile networks the system resolver
/// fails to resolve certain hosts → Flutter throws "Failed host lookup", even
/// though the same host opens fine in Chrome (which uses its own DoH). This
/// brings that same reliability into the app, with a plain-DNS fallback so we
/// never make a working network worse.
class _CacheEntry {
  final String ip;
  final DateTime expiry;
  _CacheEntry(this.ip, this.expiry);
}

final _cache = <String, _CacheEntry>{};
final HttpClient _dohClient = HttpClient()
  ..connectionTimeout = const Duration(seconds: 8);

Future<String?> _dohQuery(String endpoint, String host) async {
  try {
    final req = await _dohClient.getUrl(Uri.parse('$endpoint?name=$host&type=A'));
    req.headers.set('accept', 'application/dns-json');
    final res = await req.close();
    if (res.statusCode != 200) return null;
    final body = await res.transform(utf8.decoder).join();
    final json = jsonDecode(body) as Map<String, dynamic>;
    final answers = (json['Answer'] as List?) ?? const [];
    for (final a in answers) {
      // type 1 = A record (IPv4).
      if (a is Map && a['type'] == 1 && a['data'] is String) {
        return a['data'] as String;
      }
    }
  } catch (_) {}
  return null;
}

Future<String?> _resolve(String host) async {
  if (InternetAddress.tryParse(host) != null) return host; // already an IP
  final hit = _cache[host];
  if (hit != null && hit.expiry.isAfter(DateTime.now())) return hit.ip;
  // IP-literal endpoints → we never need the system resolver to reach the resolver.
  final ip = await _dohQuery('https://1.1.1.1/dns-query', host) ??
      await _dohQuery('https://8.8.8.8/resolve', host);
  if (ip != null) {
    _cache[host] = _CacheEntry(ip, DateTime.now().add(const Duration(minutes: 10)));
  }
  return ip;
}

void configureDoh(Dio dio) {
  final adapter = IOHttpClientAdapter();
  adapter.createHttpClient = () {
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    client.connectionFactory = (uri, proxyHost, proxyPort) async {
      // Only override direct connections; the TLS handshake still uses uri.host
      // for SNI + certificate validation, so this stays secure.
      if (proxyHost == null) {
        final ip = await _resolve(uri.host);
        if (ip != null) {
          return await Socket.startConnect(InternetAddress(ip), uri.port);
        }
      }
      return await Socket.startConnect(uri.host, uri.port); // fallback: system DNS
    };
    return client;
  };
  dio.httpClientAdapter = adapter;
}
