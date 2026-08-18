# WasteZero M4 — Developer B Integration Notes

This document describes the API contracts, model fields, and service interfaces
that Developer A has implemented, which Developer B's modules depend on.

---

## 1. Admin Service Interface (services/admin.service.js)

Developer B does NOT import `admin.service.js` directly but may use its outputs
indirectly. The following are relevant for analytics pipelines.

---

## 2. User Model — Suspension Fields

Developer B's aggregation pipelines should use these fields to filter analytics:

```js
// Filter out suspended users from analytics (if required by spec)
const activeUsers = await User.countDocuments({ isSuspended: false });

// Role breakdown (for admin dashboard stats — Developer B)
const roleBreakdown = await User.aggregate([
  { $group: { _id: '$role', count: { $sum: 1 } } }
]);
```

**Available fields on User:**
```
isSuspended: Boolean (default: false)
suspensionReason: String | null
suspendedAt: Date | null
suspendedBy: ObjectId → User | null
```

---

## 3. Opportunity Model — Soft-Delete Fields

Developer B's analytics should EXCLUDE admin-removed opportunities:

```js
// Always use this filter for public/analytics reads
const ACTIVE_FILTER = { isRemovedByAdmin: { $ne: true } };

const activeOpportunities = await Opportunity.countDocuments(ACTIVE_FILTER);
```

**Available fields on Opportunity:**
```
isRemovedByAdmin: Boolean (default: false)
removalReason: String | null
removedAt: Date | null
removedBy: ObjectId → User | null
```

---

## 4. AdminLog Model (models/admin-log.model.js)

Developer B may need to log `REPORT_DOWNLOADED` and `PICKUP_STATUS_OVERRIDE` actions.

**Usage:**
```js
const auditService = require('../services/audit.service');
const { ADMIN_LOG_ACTIONS } = require('../models/admin-log.model');

// In Developer B's report controller, after generating a report:
await auditService.logAction({
  adminId:    req.user.id,
  action:     'REPORT_DOWNLOADED',
  targetType: 'Report',
  targetId:   req.user.id,   // Use the admin's own ID as target for report downloads
  details:    `Report downloaded: ${reportType} format: ${format}`,
  req,
});
```

**auditService.logAction() signature:**
```js
await auditService.logAction({
  adminId,    // string — req.user.id
  action,     // string — from ADMIN_LOG_ACTIONS enum
  targetType, // string — from ADMIN_LOG_TARGET_TYPES enum
  targetId,   // string — ObjectId of affected resource
  details,    // string — max 500 chars
  before,     // object | null — pre-mutation snapshot
  after,      // object | null — post-mutation snapshot
  req,        // Express Request object — for IP + user-agent
});
```

> [!IMPORTANT]
> `auditService.logAction()` is **non-throwing**. If the AdminLog insert fails,
> it logs a console warning but never re-throws. Developer B can safely `await`
> it without a try/catch.

---

## 5. Admin Middleware (middlewares/rbac.middleware.js)

Developer B's admin routes MUST use this middleware:

```js
const { requireAdmin } = require('../middlewares/rbac.middleware');
const { protect } = require('../middlewares/auth.middleware');
const { adminLimiter, reportRateLimiter } = require('../middlewares/rateLimiter.middleware');

// Developer B route pattern:
router.get('/dashboard/stats', protect, requireAdmin, adminLimiter, dashboardController.getStats);
router.get('/reports/:type', protect, requireAdmin, reportRateLimiter, reportController.download);
```

> [!IMPORTANT]
> `requireAdmin` MUST be preceded by `protect`. It reads from `req.user`
> which is set by `protect`. Calling `requireAdmin` without `protect` will
> return 401 (req.user will be undefined).

---

## 6. Rate Limiters (middlewares/rateLimiter.middleware.js)

| Limiter | Use Case | Window | Max |
|---------|----------|--------|-----|
| `adminLimiter` | All admin CRUD + dashboard | 1 minute | 5 |
| `reportRateLimiter` | Report download endpoints | 1 hour | 5 |

```js
const { adminLimiter, reportRateLimiter } = require('../middlewares/rateLimiter.middleware');
```

---

## 7. Mounted Route Prefix

Developer A's admin routes are mounted at `/api/v1/admin`.

Developer B should mount dashboard and report routes at:
- `/api/v1/admin/dashboard` — or as a separate router
- `/api/v1/admin/reports`
- `/api/v1/stats`

> [!WARNING]
> Do NOT mount any Developer B routes at `/api/v1/admin/users`,
> `/api/v1/admin/opportunities`, or `/api/v1/admin/logs`.
> These paths are owned by Developer A.

---

## 8. WasteStats Model (models/wasteStats.model.js)

Developer B OWNS the write logic for `WasteStats`.
Developer A has created the schema — Developer B should add records when
a pickup is completed:

```js
const WasteStats = require('../models/wasteStats.model');

// Example: Developer B writes this in pickup completion handler
await WasteStats.create({
  user_id:     pickup.user_id,
  pickup_id:   pickup._id,
  category:    'Plastic',
  weight:      12.5,
  co2_saved_kg: co2Calculator.calculate('Plastic', 12.5),
  date:        new Date(),
});
```

**Enum values for `category`:**
```js
const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
// ['Plastic', 'Paper', 'Glass', 'E-Waste', 'Organic']
```

---

## 9. Pickup Model — Admin Override (Developer B owns pickup.routes.js)

The M4 spec includes `PATCH /api/v1/admin/pickups/:id/status` for admin status override.
This endpoint is in Developer B's scope (Developer B owns pickup.routes.js).

When implementing, Developer B should:
1. Log `PICKUP_STATUS_OVERRIDE` using `auditService.logAction()`
2. Use `protect + requireAdmin + adminLimiter` middleware chain
3. Mount under `/api/v1/admin/pickups`

---

## 10. Socket.IO — account:suspended Event

When Developer B needs to push real-time events, use the same `getIO()` pattern:

```js
const { getIO } = require('../sockets');
const { getUserRoom } = require('../sockets/rooms');

// Push to specific user
const io = getIO();
io.to(getUserRoom(userId)).emit('your:event', payload);
```

---

## Summary Table

| Interface | Developer A Provides | Developer B Uses |
|-----------|---------------------|-----------------|
| `requireAdmin` middleware | ✅ | Required in all admin routes |
| `adminLimiter` | ✅ | Required in admin dashboard routes |
| `reportRateLimiter` | ✅ | Required in report download routes |
| `auditService.logAction()` | ✅ | For REPORT_DOWNLOADED, PICKUP_STATUS_OVERRIDE |
| `User.isSuspended` field | ✅ | Filter analytics by active users |
| `Opportunity.isRemovedByAdmin` | ✅ | Filter analytics by active opportunities |
| `WasteStats` model | ✅ (schema) | B writes records, B builds aggregations |
| `ALLOWED_WASTE_TYPES` constant | ✅ | Category enum for grouping keys |
