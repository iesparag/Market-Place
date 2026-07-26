import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/theme.dart';

/// Shown when the installed version is below the backend's minVersion. Blocks the app until updated.
class ForceUpdateScreen extends StatelessWidget {
  final String url;
  final String message;
  const ForceUpdateScreen({super.key, required this.url, required this.message});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // user can't dismiss — must update
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 96, height: 96,
                  decoration: const BoxDecoration(color: Color(0xFFFFF1E9), shape: BoxShape.circle),
                  child: const Icon(Icons.system_update_rounded, size: 52, color: BrandColors.brand600),
                ),
                const SizedBox(height: 22),
                const Text('Update required', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                Text(message, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted, height: 1.4)),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity, height: 52,
                  child: ElevatedButton(
                    onPressed: url.isEmpty
                        ? null
                        : () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
                    child: const Text('Update now', style: TextStyle(fontSize: 16)),
                  ),
                ),
                if (url.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text('Update link not configured yet.', style: TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
