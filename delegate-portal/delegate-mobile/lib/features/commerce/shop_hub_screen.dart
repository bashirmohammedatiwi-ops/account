import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'commerce_screens.dart';

/// صفحات منفصلة: فروع → أقسام → منتجات
class ShopHubScreen extends ConsumerWidget {
  const ShopHubScreen({super.key, this.branchId, this.sectionId});

  final int? branchId;
  final int? sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (branchId != null && sectionId != null) {
      return ShopProductsScreen(branchId: branchId!, sectionId: sectionId!);
    }
    if (branchId != null) return ShopSectionsScreen(branchId: branchId!);
    return const ShopBranchesScreen();
  }
}
