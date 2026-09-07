function empAccounts() {
  return [
    {
      username: process.env.EMP_USER || 'allemp',
      password: process.env.EMP_PASS || '000000',
      name: 'موظف التجهيز',
      role: 'employee'
    },
    {
      username: process.env.EMP_MANAGER_USER || 'مدير',
      password: process.env.EMP_MANAGER_PASS || '000000',
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

function isEmpManager(employee) {
  const role = String(employee?.empRole || employee?.role || 'employee').trim().toLowerCase();
  return role === 'manager';
}

function empRoleLabel(role) {
  return role === 'manager' ? 'مدير' : 'موظف تجهيز';
}

module.exports = {
  empAccounts,
  findEmpAccount,
  isEmpManager,
  empRoleLabel
};
