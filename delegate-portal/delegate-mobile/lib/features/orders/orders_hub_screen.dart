import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../commerce/commerce_screens.dart';
import '../home/home_screen.dart';

/// iPad: قائمة الطلبات + التفاصيل جنباً إلى جنب
class OrdersHubScreen extends ConsumerWidget {
  const OrdersHubScreen({super.key, this.orderId});

  final int? orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (EdLayout.of(context).isWide) {
      return AppPage(
        title: 'طلباتي',
        kicker: 'الطلبات',
        subtitle: 'متابعة حالة الطلبات',
        showBack: true,
        onBack: () => context.go('/home'),
        actions: [
          EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(ordersProvider)),
        ],
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: EdLayout.of(context).sidePanelWidth + 40,
              child: OrdersListPanel(
                selectedId: orderId,
                onSelect: (id) => context.go('/orders/$id'),
              ),
            ),
            const VerticalDivider(width: 1, color: AppColors.border),
            Expanded(
              child: orderId != null
                  ? OrderDetailBody(id: orderId!)
                  : const EmptyState(message: 'اختر طلباً', icon: Icons.receipt_long_outlined),
            ),
          ],
        ),
      );
    }

    if (orderId != null) return OrderDetailScreen(id: orderId!);
    return const OrdersScreen();
  }
}

class OrdersListPanel extends ConsumerWidget {
  const OrdersListPanel({super.key, required this.onSelect, this.selectedId});

  final ValueChanged<int> onSelect;
  final int? selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(ordersProvider);

    return ColoredBox(
      color: AppColors.surfaceMuted,
      child: ordersAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الطلبات...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(ordersProvider)),
        data: (orders) {
          if (orders.isEmpty) return const EmptyState(message: 'لا توجد طلبات', icon: Icons.receipt_long_outlined);
          return ListView.separated(
            padding: const EdgeInsets.all(10),
            itemCount: orders.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final o = orders[i];
              return EdSideNavItem(
                icon: Icons.receipt_long_outlined,
                title: 'طلب #${o.id}',
                subtitle: '${o.customerName ?? '—'} · ${fmtDate(o.createdAt)}',
                trailing: fmtMoney(o.totalAmount),
                accent: AppTheme.orderStatusColor(o.status),
                selected: o.id == selectedId,
                onTap: () => onSelect(o.id),
              );
            },
          );
        },
      ),
    );
  }
}
