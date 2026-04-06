# Inbox messaging setup

This build uses **direct APIs**:
- Email via your existing SMTP setup
- WhatsApp via **Meta WhatsApp Cloud API**
- Viber via the **official Viber Bot API**

## Configuration → Notifications → Inbox channels

### WhatsApp Cloud API
Fill in:
- `Access token`
- `Phone number ID`
- `Business account ID`
- `Webhook verify token`
- `App secret`

### Viber Bot API
Fill in:
- `Bot token`
- `Bot name`
- `Bot avatar URL`

## Client record fields

Each client now supports:
- `Phone`
- `WhatsApp phone`
- `WhatsApp opt-in`
- `Viber user ID`
- `Viber connected`

### Channel rules
- Email: uses the email address
- WhatsApp: uses `WhatsApp phone` if present, otherwise `Phone`, and requires `WhatsApp opt-in = true`
- Viber: requires both `Viber user ID` and `Viber connected = true`

## Webhook URLs
Use the company-specific URLs shown on the configuration screen:
- `https://YOUR-BACKEND/api/inbox/webhooks/whatsapp/{companyId}`
- `https://YOUR-BACKEND/api/inbox/webhooks/viber/{companyId}`

## Recommended rollout
1. Configure Email + WhatsApp first
2. Mark WhatsApp opt-in on clients who consented
3. Add Viber only for clients who connected to your bot and for whom you saved the Viber user ID
