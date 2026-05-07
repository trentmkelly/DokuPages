# Email

Email features are out of scope for the first Pages launch.

Deferred DokuWiki behaviors:

- registration notification emails
- password reset emails
- page change notifications
- subscriptions
- digest scheduling
- bounce-safe sender configuration

No Workers-compatible email provider has been selected because no launch route
sends mail. When email enters scope, the implementation should start with a
provider adapter behind a narrow interface, template tests, delivery failure
handling, and rate limits for user-triggered sends.
