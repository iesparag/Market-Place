import 'package:dio/dio.dart';

/// Web (and any non-dart:io platform) already uses the browser's networking
/// stack (which does its own DoH), so there's nothing to override here.
void configureDoh(Dio dio) {}
