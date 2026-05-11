# نظام Balance للتكاليف (Category-Based) — Cost Category Balance System

## الهدف

تطوير نظام التكاليف ليتبع نفس نمط "المزارع" و "العملاء"، حيث يكون لكل **تصنيف تكلفة (Cost Category)** رصيد حساب (Balance) يمثل المبالغ المستحقة لنا أو علينا لذلك التصنيف/المورد.

## التغييرات المطلوبة حسب توجيهات المستخدم

### 1. CostCategory Model — إضافة الرصيد الحالي
#### [MODIFY] [CostCategory.js](file:///c:/Users/EGYPT_LAPTOP/Desktop/learnJS/poultry-farm/backend/src/models/CostCategory.js)
- إضافة حقل `current_balance` (DECIMAL(12,2), default: 0).
- هذا الحقل سيحاكي `Farm.current_balance`.

### 2. DailyCost Model — تبسيط الحقول والمقارنة مع FarmTransaction
#### [MODIFY] [DailyCost.js](file:///c:/Users/EGYPT_LAPTOP/Desktop/learnJS/poultry-farm/backend/src/models/DailyCost.js)
- التأكد من عدم وجود حقل `balance` (تم طلبه بوضوح).
- الحفاظ على حقول المعاملة الحالية (`amount`, `paid_amount`).
- الحفاظ على `paid_by_person_id` و `received_by_person_id` (كما هو موجود في `FarmTransaction`).

### 3. CostDebtPayment Model — تحديث ليتناسب مع نمط DebtPayment
#### [MODIFY] [CostDebtPayment.js](file:///c:/Users/EGYPT_LAPTOP/Desktop/learnJS/poultry-farm/backend/src/models/CostDebtPayment.js)
- إضافة حقل `payment_direction` (ENUM: 'TO_CATEGORY', 'FROM_CATEGORY').
- **حذف** الحقول التالية:
    - `paid_by_user_id`
    - `paid_by_person_type`
    - `paid_by_person_id`
    - `received_by_person_id` (إذا أُضيف في مسودات سابقة)
- إضافة حقل `cost_category_id` (لربط الدفع بالتصنيف مباشرة بدلاً من تكلفة يومية محددة فقط، أو كلاهما).

---

## Proposed Changes (Components)

### Component 1: `CostCategory` Model Update
إضافة `current_balance` لتمثيل المديونية.

### Component 2: `CostDebtPayment` Model Refactoring
تحويله لنمط `FarmDebtPayment` بحذف تفاصيل "من دفع" والاعتماد على الـ Direction والـ Safe.

### Component 3: `operationController.js` Updates
- **`recordDailyCost`**: عند تسجيل تكلفة، يتم زيادة رصيد التصنيف (Debt increase).
- **`recordCostPayment`**: عند سداد مديونية، يتم تحديث رصيد التصنيف بناءً على الـ Direction.
- **إلغاء قيود الـ Overpayment**: السماح بدفع مبالغ أكبر من التكلفة المحددة.

### Component 4: `costCategoryController.js` (جديد/محدث)
بدلاً من رصيد الأشخاص، سنركز على أرصدة التصنيفات:
1. `getCategoryBalances`: قائمة التصنيفات وأرصدتها.
2. `getCategoryStatement`: كشف حساب لتصنيف معين.
3. `getCostBalanceSummary`: ملخص شامل (إجمالي الديون/المستحقات).

---

## Open Questions

> [!IMPORTANT]
> هل نربط `CostDebtPayment` بـ `daily_cost_id` (فاتورة محددة) أم بـ `cost_category_id` (على الحساب)؟
> في نظام المزارع، الـ `FarmDebtPayment` مرتبط بـ `farm_id`. لذا أقترح ربط `CostDebtPayment` بـ `cost_category_id`.

## Verification Plan

### Automated Tests
1. إنشاء تكلفة جديدة -> التحقق من زيادة رصيد التصنيف.
2. تسجيل سداد مديونية -> التحقق من نقص رصيد التصنيف.
3. التأكد من ظهور الأرصدة في الـ Controller الجديد.

### Manual Verification
- مراجعة قاعدة البيانات للتأكد من حذف الحقول غير المطلوبة من `CostDebtPayment`.
