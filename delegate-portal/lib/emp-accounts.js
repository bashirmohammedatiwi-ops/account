function empAccounts() {
  return [
    {
      username: process.env.EMP_USER || 'صلاح',
      password: process.env.EMP_PASS || '5910',
      name: 'صلاح',
      role: 'employee'
    },
    {
      username: process.env.EMP_RECEIPT_USER || 'omer',
      password: process.env.EMP_RECEIPT_PASS || '0123',
      name: 'omer',
      role: 'receipt'
    },
    {
      username: process.env.EMP_MANAGER_USER || 'مدير',
      password: process.env.EMP_MANAGER_PASS || '8386',
      name: 'مدير',
      role: 'manager'
    }
  ];
}

function findEmpAccount(username, password) {
  const u = String(username || '').trim();
  const p = String(password || '');
  return empAccounts().find((a) => a.username === u && a.password === p) || null;
}

function empRoleOf(employee) {
  return String(employee?.empRole || employee?.role || 'employee').trim().toLowerCase();
}

function isEmpManager(employee) {
  return empRoleOf(employee) === 'manager';
}

function isEmpReceipt(employee) {
  return empRoleOf(employee) === 'receipt';
}

function isEmpReceiptOnly(employee) {
  return isEmpReceipt(employee);
}

function canEmpPrepConfirm(employee) {
  const role = empRoleOf(employee);
  return role === 'manager' || role === 'receipt';
}

function prepConfirmLabels(employee) {
  if (isEmpReceipt(employee)) {
    return {
      pending: 'تم انشاء وصل',
      confirmed: 'تم انشاء وصل',
      subtitlePending: 'اضغط بعد إنشاء وصل التجهيز',
      subtitleConfirmed: 'اضغط لإلغاء إنشاء الوصل'
    };
  }
  return {
    pending: 'تأكيد اكتمال التجهيز',
    confirmed: 'تم تأكيد التجهيز',
    subtitlePending: 'اضغط عند الانتهاء من التجهيز',
    subtitleConfirmed: 'اضغط لإلغاء التأكيد'
  };
}

function empRoleLabel(role) {
  const r = String(role || 'employee').trim().toLowerCase();
  if (r === 'manager') return 'مدير';
  if (r === 'receipt') return 'إنشاء وصل';
  return 'موظف تجهيز';
}

function mapEmployeeProfile(employee) {
  const role = empRoleOf(employee);
  const labels = prepConfirmLabels(employee);
  return {
    username: employee?.username || '',
    name: employee?.name || 'موظف التجهيز',
    role,
    roleLabel: empRoleLabel(role),
    isManager: role === 'manager',
    isReceiptOnly: isEmpReceiptOnly(employee),
    canPrepConfirm: canEmpPrepConfirm(employee),
    prepConfirmPendingLabel: labels.pending,
    prepConfirmConfirmedLabel: labels.confirmed,
    prepConfirmSubtitlePending: labels.subtitlePending,
    prepConfirmSubtitleConfirmed: labels.subtitleConfirmed
  };
}

function assertNotReceiptOnly(employee, actionLabel = 'هذا الحساب') {
  if (isEmpReceiptOnly(employee)) {
    throw new Error(`${actionLabel} لا يملك هذه الصلاحية`);
  }
}

function assertCanPrepConfirm(employee) {
  if (!canEmpPrepConfirm(employee)) {
    throw new Error('لا تملك صلاحية تأكيد التجهيز');
  }
}

module.exports = {
  empAccounts,
  findEmpAccount,
  empRoleOf,
  isEmpManager,
  isEmpReceipt,
  isEmpReceiptOnly,
  canEmpPrepConfirm,
  prepConfirmLabels,
  empRoleLabel,
  mapEmployeeProfile,
  assertNotReceiptOnly,
  assertCanPrepConfirm
};
