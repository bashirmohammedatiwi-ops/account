module.exports = {
  sections: {
    identity: {
      title: 'الهوية والتصنيف',
      fields: {
        Seq: 'المسلسل',
        Num: 'رقم الحساب',
        Name1: 'الاسم',
        Name2: 'الاسم الثانوي',
        OfficialName: 'الاسم الرسمي',
        Cod: 'الرمز',
        Prefix: 'بادئة',
        Sufix: 'لاحقة',
        PrevYearNum: 'رقم السنة السابقة',
        AccGroup: 'مجموعة الحساب',
        PrGrpN: 'مجموعة أسعار',
        SelType: 'نوع',
        Sub: 'فرعي'
      }
    },
    tree: {
      title: 'الشجرة والفروع',
      fields: {
        Master: 'Seq الأب',
        MasterName: 'الحساب الأب',
        SubCount: 'عدد الفروع المباشرة',
        DescendantsCount: 'إجمالي الفروع',
        HideSubs: 'إخفاء الفروع',
        HideName: 'إخفاء الاسم',
        HideDay: 'إخفاء اليوم'
      }
    },
    balances: {
      title: 'الأرصدة والديون',
      fields: {
        Bal: 'الرصيد الحالي',
        Tot1: 'إجمالي 1',
        Tot2: 'إجمالي 2',
        CBal: 'رصيد العملة',
        CTot1: 'إجمالي عملة 1',
        CTot2: 'إجمالي عملة 2',
        BalSee: 'رصيد مرئي',
        FixBal: 'رصيد التثبيت',
        FrstStck: 'رصيد افتتاحي',
        Budjet: 'موازنة',
        Cieling: 'سقف',
        ExpectedPayment: 'الدفعة المتوقعة',
        Delay: 'التأخير',
        DebtStatus: 'حالة الدين'
      }
    },
    registration: {
      title: 'التسجيل والتثبيت',
      fields: {
        FixDate: 'تاريخ التثبيت',
        FixTime: 'وقت التثبيت',
        FixUser: 'المستخدم',
        FixRems: 'ملاحظات التثبيت',
        Idx: 'الفهرس',
        Exp: 'Exp'
      }
    },
    contact: {
      title: 'العناوين والوكلاء',
      fields: {
        Address: 'العنوان',
        Address2: 'العنوان 2',
        Agent: 'الوكيل',
        AgentComm: 'عمولة الوكيل',
        Dest: 'الوجهة',
        Remarks: 'ملاحظات'
      }
    },
    accounting: {
      title: 'إعدادات محاسبية',
      fields: {
        Dept: 'مدين',
        CloseAcc: 'حساب مغلق',
        CloseMatAcc: 'إغلاق حساب مواد',
        Acur: 'عملة',
        AEqua: 'معادلة عملة',
        PayTypeIdx: 'نوع الدفع',
        GatherTypeIdx: 'نوع التحصيل',
        Thurs: 'خميس',
        Extra1: 'إضافي 1',
        Extra2: 'إضافي 2',
        Extra3: 'إضافي 3'
      }
    }
  },

  statementColumns: [
    { key: 'debit', label: 'مدين', numeric: true },
    { key: 'credit', label: 'دائن', numeric: true },
    { key: 'description', label: 'البيان' },
    { key: 'date', label: 'التاريخ' },
    { key: 'balance', label: 'حركة الرصيد', numeric: true }
  ],

  branchColumns: [
    { key: 'depth', label: 'المستوى' },
    { key: 'Num', label: 'الرقم' },
    { key: 'Name1', label: 'الاسم' },
    { key: 'Bal', label: 'الرصيد', numeric: true },
    { key: 'Tot1', label: 'إجمالي 1', numeric: true },
    { key: 'Tot2', label: 'إجمالي 2', numeric: true },
    { key: 'FixDate', label: 'تاريخ التثبيت' },
    { key: 'ExpectedPayment', label: 'دفعة متوقعة', numeric: true },
    { key: 'Delay', label: 'تأخير' },
    { key: 'SubCount', label: 'فروع' },
    { key: 'Remarks', label: 'ملاحظات' }
  ]
};
