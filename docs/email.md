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
- `EMAIL_TASK_TOKEN`: bearer token for scheduled digest execution.

The adapter never uses user-supplied addresses as the sender. User input can
only appear in recipients or escaped template body content.

Delivery records are stored in `email_deliveries` with kind, recipient, subject,
status, provider, provider message ID, and error text. Provider errors and
network failures are recorded as `failed`; missing configuration is recorded as
`skipped`.

Implemented templates:

- registration notification
- password reset
- page change notification
- digest

Deferred DokuWiki behaviors still being wired to routes and scheduled tasks:

- registration notification dispatch
- password reset email dispatch
- page change notification dispatch
- subscription management UI/actions
- digest scheduling
