import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'shop_branch_picker_screen.dart';
import 'shop_catalog_screen.dart';

/// بوابة المنتجات — اختيار القسم ثم الكتالوج
class ShopHubScreen extends ConsumerWidget {
  const ShopHubScreen({super.key, this.branchId, this.sectionId});

  final int? branchId;
  final int? sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (branchId == null) {
      return const ShopBranchPickerScreen();
    }
    return ShopCatalogScreen(
      key: ValueKey('catalog-$branchId-${sectionId ?? 0}'),
      initialBranchId: branchId,
      initialSectionId: sectionId,
    );
  }
}
