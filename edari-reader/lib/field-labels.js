module.exports = {
  materialSections: {
    basic: {
      title: 'معلومات أساسية',
      fields: {
        Seq: 'المسلسل',
        Num: 'رقم المادة',
        Name1: 'الاسم',
        Name2: 'الاسم الثانوي',
        Barcode: 'الباركود',
        Father: 'المجموعة الأب',
        Dest: 'الوجهة',
        Remarks: 'ملاحظات',
        Regist: 'التسجيل',
        CatNum: 'رقم التصنيف',
        CustNum: 'رقم العميل',
        Supplier: 'المورد',
        Stored: 'مخزّن',
        Group1: 'مجموعة 1',
        Group2: 'مجموعة 2',
        Group3: 'مجموعة 3'
      }
    },
    quantities: {
      title: 'الكميات والمخزون',
      fields: {
        InTot: 'كمية واردة',
        OutTot: 'كمية صادرة',
        StockQty: 'الرصيد المتبقي',
        PurchaseTot: 'كمية مشتريات',
        SalesTot: 'كمية مبيعات',
        InBooked: 'محجوز وارد',
        OutBooked: 'محجوز صادر',
        Minimum: 'الحد الأدنى',
        Maximum: 'الحد الأقصى',
        OrderQ: 'كمية الطلب',
        TmpSellQu: 'بيع مؤقت',
        TmpReturnQu: 'مرتجع مؤقت',
        TmpOutQu: 'صادر مؤقت',
        ItemsInCart: 'في السلة',
        Carton: 'كرتون'
      }
    },
    purchasePrices: {
      title: 'أسعار الشراء والتكلفة',
      fields: {
        Avrg: 'متوسط التكلفة',
        CurAvrg: 'متوسط التكلفة الحالي',
        Top: 'أعلى سعر شراء',
        Last: 'آخر سعر شراء',
        CTop: 'أعلى تكلفة حالية',
        CLast: 'آخر تكلفة حالية',
        InAm: 'قيمة الوارد',
        PurchaseAm: 'قيمة المشتريات',
        OutAm: 'قيمة الصادر',
        PurchaseTot: 'إجمالي كمية مشتريات'
      }
    },
    sellPrices: {
      title: 'أسعار البيع',
      fields: {
        SellPr1: 'سعر بيع 1',
        SellPr2: 'سعر بيع 2',
        SellPr3: 'سعر بيع 3',
        SellPr4: 'سعر بيع 4',
        SellPr5: 'سعر بيع 5',
        SellType1: 'نوع بيع 1',
        SellType2: 'نوع بيع 2',
        SellType3: 'نوع بيع 3',
        SellType4: 'نوع بيع 4',
        SellType5: 'نوع بيع 5',
        SalesAm: 'قيمة المبيعات',
        SalesTot: 'إجمالي كمية مبيعات'
      }
    },
    units: {
      title: 'الوحدات',
      fields: {
        Unt1: 'الوحدة 1',
        Unt2: 'الوحدة 2',
        Unt3: 'الوحدة 3',
        DefUnit: 'الوحدة الافتراضية',
        UFactor2: 'معامل وحدة 2',
        UFactor3: 'معامل وحدة 3',
        FixedFactor: 'معامل ثابت',
        Point: 'نقطة 1',
        Point2: 'نقطة 2',
        Point3: 'نقطة 3'
      }
    },
    financial: {
      title: 'قيم مالية إضافية',
      fields: {
        Tot1: 'إجمالي 1',
        Tot2: 'إجمالي 2',
        Tot3: 'إجمالي 3',
        CurTot1: 'إجمالي عملة 1',
        CurTot2: 'إجمالي عملة 2',
        CurTot3: 'إجمالي عملة 3',
        Total: 'الإجمالي',
        MatCurr: 'عملة المادة',
        SellCurr: 'عملة البيع',
        Bonus: 'بonus',
        BonusDiv: 'bonus div',
        VAT: 'ضريبة',
        Comm: 'عمولة'
      }
    },
    physical: {
      title: 'المواصفات',
      fields: {
        Weight: 'الوزن',
        Length: 'الطول',
        Width: 'العرض',
        Height: 'الارتفاع',
        Horiz: 'أفقي',
        PlaceFnf: 'مكان'
      }
    }
  },

  materialListColumns: [
    { key: 'Num', label: 'الرقم' },
    { key: 'Name1', label: 'الاسم' },
    { key: 'Barcode', label: 'الباركود' },
    { key: 'StockQty', label: 'الرصيد', numeric: true },
    { key: 'InTot', label: 'واردة', numeric: true },
    { key: 'OutTot', label: 'صادرة', numeric: true },
    { key: 'Avrg', label: 'متوسط شراء', numeric: true },
    { key: 'CurAvrg', label: 'تكلفة حالية', numeric: true },
    { key: 'SellPr4', label: 'سعر البيع', numeric: true },
    { key: 'SellPr1', label: 'بيع 1 (داخلي)', numeric: true },
    { key: 'SellPr2', label: 'بيع 2', numeric: true },
    { key: 'SellPr3', label: 'بيع 3', numeric: true },
    { key: 'SellPr5', label: 'بيع 5', numeric: true },
    { key: 'PurchaseAm', label: 'قيمة شراء', numeric: true },
    { key: 'SalesAm', label: 'قيمة مبيعات', numeric: true },
    { key: 'Unt1', label: 'الوحدة' }
  ]
};
