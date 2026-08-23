/// سطر مسودة الفاتورة — كمية + هدية + تيستر
typedef DraftLine = ({num quant, num bonus, num tester});

DraftLine emptyDraftLine() => (quant: 0, bonus: 0, tester: 0);

bool draftLineActive(DraftLine? line) {
  if (line == null) return false;
  return line.quant > 0 || line.bonus > 0 || line.tester > 0;
}
