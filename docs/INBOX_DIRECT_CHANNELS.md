# Direct channel notes

This package removes the Inbox dependency on Infobip for WhatsApp and Viber.

## WhatsApp
Outbound uses Meta Cloud API `/{version}/{phone-number-id}/messages`.
Inbound uses the company-specific webhook endpoint and validates Meta's verify token.
If an app secret is configured, the webhook also validates `X-Hub-Signature-256`.

## Viber
Outbound uses `https://chatapi.viber.com/pa/send_message` with `X-Viber-Auth-Token`.
Inbound uses the company-specific Viber webhook endpoint.
Client matching is done by `viberUserId`, which is why Viber is treated as an opt-in connected channel.


## Consultant phone

Configuration → Consultants now keeps a single phone field. The app uses that consultant phone as the sender reference shown in the UI, while actual WhatsApp delivery always uses the company WhatsApp Cloud API phone number ID configured in Configuration → Notifications → Inbox channels. The client WhatsApp target always uses the client phone number. Viber user IDs remain internal and are not entered manually on the client form.
