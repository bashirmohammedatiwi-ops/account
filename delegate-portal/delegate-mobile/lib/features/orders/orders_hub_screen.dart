import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../commerce/commerce_screens.dart';

class OrdersHubScreen extends ConsumerWidget {
  const OrdersHubScreen({super.key, this.orderId});

  final int? orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (orderId != null) return OrderDetailScreen(id: orderId!);
    return const OrdersScreen();
  }
}
