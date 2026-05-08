# Email

Outbound email uses a narrow Resend-compatible HTTP adapter. The adapter is
disabled unless a provider token and configured sender are present, so local
development and existing deployments do not send mail accidentally.

Selected provider:

- `EMAIL_PROVIDER=resend`
- API endpoint: `https://api.resend.com/emails`
- Authentication: bearer token from `RESEND_API_KEY`, with `EMAIL_API_TOKEN`
  accepted as a generic fallback.

Required sender configuration:

- `EMAIL_FROM`: the fixed sender used for every outbound message.
- `RESEND_API_KEY` or `EMAIL_API_TOKEN`: provider token.

Optional sender configuration:

- `EMAIL_PROVIDER_ENDPOINT`: override for a Resend-compatible endpoint.
- `EMAIL_REPLY_TO`: fixed reply-to address.
- `EMAIL_RETURN_PATH`: fixed return-path value passed in provider headers.
- `EMAIL_BASE_URL`: public wiki base URL for email links.
- `EMAIL_REGISTRATION_NOTIFY`: comma-separated notification recipients.
- `AUTOPASSWD`: enables generated-password registration emails when set to `1`.
- `EMAIL_TASK_TOKEN`: bearer token for scheduled digest execution.

The adapter never uses user-supplied addresses as the sender. User input can
only appear in recipients or escaped template body content.

Delivery records are stored in `email_deliveries` with kind, recipient, subject,
status, provider, provider message ID, and error text. Provider errors and
network failures are recorded as `failed`; missing configuration is recorded as
`skipped`.

Implemented flows and templates:

- native registration form and `/api/auth/register`
- registration notification
- generated registration password
- native password reset request and confirmation forms
- password reset
- page change notification
- page and namespace subscription management from `?do=subscribe`
- immediate page-change dispatch from page save and revert workflows
- digest

Subscription and digest routes:

- `/api/subscriptions`: authenticated CSRF-protected form endpoint for
  subscribing, updating delivery cadence, or unsubscribing.
- `/api/tasks/email-digests`: token-protected JSON endpoint for scheduled
  daily/weekly digest execution. Send `Authorization: Bearer <EMAIL_TASK_TOKEN>`
  from the scheduler. The default task processes `daily` subscriptions; use
  `?interval=weekly` for weekly schedules or `?interval=all` for manual catch-up.

Subscription state is stored in `subscriptions`. Page saves and reverts append
`email_notification_events`; immediate deliveries and digest deliveries are
deduplicated through `email_digest_deliveries`.
