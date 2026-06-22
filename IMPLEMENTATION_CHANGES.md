# Manual Tenant Registration - Platform Admin

## Implemented

### Platform Admin tenant creation and editing
- Added a Platform Admin manual tenant creation flow.
- Added support for creating the first tenant admin user during manual tenant registration.
- Owner email is used as both login email and billing email.
- Creation is blocked when the owner email already exists anywhere in the user table.
- Added separate access and billing status handling:
  - Access status: `ACTIVE`, `SUSPENDED`, `CANCELLED`.
  - Billing status: `PENDING_PAYMENT`, `PAID`, `PAST_DUE`.
- Tenants can log in immediately when access status is `ACTIVE`, even if billing is still pending.
- Login is blocked for `SUSPENDED` and `CANCELLED` tenants.
- Added Platform Admin endpoints for manual creation, subscription editing, manual options, and resend invoice/payment link.
- Added audit logging for manual creation, subscription edits, and payment resends.

### Custom package support
- Added `CUSTOM` package support for Platform Admin only.
- Custom package supports:
  - custom package name,
  - monthly price,
  - yearly price,
  - selected billing interval,
  - custom user limit,
  - custom monthly SMS quota,
  - selected app/module functionality,
  - selected add-ons,
  - custom add-on prices,
  - free add-ons.
- Custom package details are stored as a tenant-specific snapshot so later global package changes do not automatically overwrite the custom agreement.
- Custom tenants are protected from normal self-service package upgrade/downgrade by using Platform Admin-controlled package data.

### Company details
- Manual tenant form uses the existing `Tip podjetja` concept from tenant account settings.
- The backend stores the selected value in the existing `MODULE_CONFIG_TYPE` setting.
- Manual tenant form includes owner/company/billing data: first name, last name, email, phone, company name, Tip podjetja, VAT ID, country, city, address, postal code.

### Billing and payment flow
- Bank transfer manual tenants:
  - tenant is created active immediately,
  - normal platform subscription invoice is created,
  - invoice is emailed through the existing billing email service,
  - invoice due date continues to use existing platform billing settings.
- Stripe/card manual tenants:
  - tenant is created active immediately,
  - first period one-time Stripe checkout link is created through the existing platform subscription billing flow,
  - link is emailed through the existing billing email service,
  - Platform Admin can copy/resend the payment link.
- Stripe webhook handling now marks platform subscription billing status as `PAID` when the matching platform subscription bill is paid.
- Added scheduled past-due scan: pending subscriptions become `PAST_DUE` after the configured grace period, default 30 days.

### SMS quota enforcement
- Added tenant SMS quota service.
- SMS quota uses `SIGNUP_SMS_COUNT` as monthly quota and `TENANCY_SMS_SENT_COUNT` as current usage.
- SMS sending is blocked once quota is reached.
- SMS usage is incremented through the new quota service for client messages and reminders.
- Added `/api/settings/sms-quota` endpoint.
- Frontend shows a warning when SMS quota is exhausted or when 50 or fewer messages remain, with an option to open `Upravljanje računa → Naročnina`.

### Frontend UI
- Added `+ Manual tenant` button in Platform Admin tenancy view.
- Added manual tenant modal with sections for:
  - owner and company details,
  - package, limits, payment and statuses,
  - custom package prices,
  - feature/module selection,
  - add-ons and custom add-on prices.
- Added subscription edit mode for existing tenants.
- Added resend invoice/payment link action.
- Added display of custom package and billing/access statuses in Platform Admin tenant details.

## Updated files

- `frontend/src/App.tsx`
- `frontend/src/pages/PlatformAdminPage.tsx`
- `backend/src/main/java/com/example/app/admin/PlatformAdminController.java`
- `backend/src/main/java/com/example/app/admin/ManualTenantService.java`
- `backend/src/main/java/com/example/app/auth/AuthController.java`
- `backend/src/main/java/com/example/app/entitlement/PackageAccessService.java`
- `backend/src/main/java/com/example/app/inbox/ClientMessageService.java`
- `backend/src/main/java/com/example/app/register/PlatformSubscriptionBillingService.java`
- `backend/src/main/java/com/example/app/reminder/ReminderService.java`
- `backend/src/main/java/com/example/app/settings/SettingKey.java`
- `backend/src/main/java/com/example/app/settings/SettingsController.java`
- `backend/src/main/java/com/example/app/settings/TenantSmsQuotaService.java`
- `backend/src/main/java/com/example/app/stripe/StripeWebhookService.java`

## Validation note

A full Maven build could not be run in this environment because the Maven wrapper needed to download Maven from the internet and the download failed; system `mvn` is not installed. A full frontend build could not be run because `node_modules` are not present in the extracted project. Static syntax checks and structural checks were performed on the modified files where possible.

## Follow-up recommendation

After applying these files, run:

```bash
cd backend
./mvnw -DskipTests package

cd ../frontend
npm install
npm run build:production
```

Then test:

1. Platform Admin manual tenant creation with bank transfer.
2. Platform Admin manual tenant creation with Stripe/card.
3. Duplicate owner email rejection.
4. Login with active/pending-payment tenant.
5. Login blocked after setting access status to `SUSPENDED`.
6. Custom package edit from Platform Admin.
7. SMS warning and SMS quota block.
8. Resend invoice/payment link.
