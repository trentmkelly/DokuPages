# URL Compatibility And Redirect Audit

This audit maps legacy DokuWiki entrypoints to the Pages-native route surface.

| Legacy URL                                          | Pages behavior                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `/`                                                 | Redirects to the configured start page.                            |
| `/index.php`                                        | Redirects to the configured start page.                            |
| `/doku.php?id=<page>`                               | Redirects to `/wiki/<page>`.                                       |
| `/doku.php?id=<page>&do=edit`                       | Redirects to the page edit route.                                  |
| `/doku.php?id=<page>&do=diff&rev=<rev>&rev2=<rev2>` | Redirects to the page diff route.                                  |
| `/doku.php?id=<page>&do=revisions`                  | Redirects to the page revision list.                               |
| `/doku.php?id=<page>&do=backlink`                   | Redirects to the page backlinks view.                              |
| `/doku.php?id=<page>&do=source`                     | Redirects to the page source view.                                 |
| `/doku.php?id=<page>&do=subscribe`                  | Redirects to the page subscription view.                           |
| `/doku.php?id=<page>&do=check`                      | Redirects to the native diagnostics-backed check action.           |
| `/doku.php?id=<page>&do=denied`                     | Redirects to the native denied-page action.                        |
| `/doku.php?id=<page>&do=locked`                     | Redirects to the native lock-status action.                        |
| `/doku.php?id=<page>&do=conflict`                   | Redirects to the native conflict action.                           |
| `/doku.php?id=<page>&do=cancel`                     | Redirects to the native cancel action.                             |
| `/doku.php?id=<page>&do=recover`                    | Redirects to the native draft recovery action.                     |
| `/doku.php?id=<page>&do=draftdel`                   | Redirects to the native draft deletion action.                     |
| `/doku.php?id=<page>&do=authtoken`                  | Redirects to the native unsupported auth-token action.             |
| `/doku.php?id=<page>&do=plugin`                     | Redirects to the native unsupported plugin action.                 |
| `/doku.php?id=<page>&do=media`                      | Redirects to the native media-manager action.                      |
| `POST /doku.php?id=<page>&do=save`                  | Saves through the native page save handler.                        |
| `POST /doku.php?id=<page>&do=preview`               | Renders through the native preview handler.                        |
| `POST /doku.php?id=<page>&do=draft`                 | Saves through the native draft handler.                            |
| `/doku.php?id=<page>&do=export_raw`                 | Redirects to the raw export route.                                 |
| `/doku.php?id=<page>&do=export_code`                | Redirects to the code-block download export route.                 |
| `/doku.php?id=<page>&do=export_xhtml`               | Redirects to the XHTML export route.                               |
| `/doku.php?id=<page>&do=export_metadata`            | Redirects to a no-body metadata export response.                   |
| `/doku.php?id=<page>&do=export_<renderer>`          | Redirects to a deliberate unsupported renderer response.           |
| `/doku.php?do=admin`                                | Redirects to `/admin`.                                             |
| `/doku.php?do=admin&page=acl`                       | Redirects to `/admin/acl`.                                         |
| `/doku.php?do=admin&page=config`                    | Redirects to `/admin/config`.                                      |
| `/doku.php?do=admin&page=info`                      | Redirects to `/diagnostics`.                                       |
| `/doku.php?do=admin&page=logviewer`                 | Redirects to `/admin/audit`.                                       |
| `/doku.php?do=admin&page=usermanager`               | Redirects to `/admin/users`.                                       |
| `/doku.php?do=admin&page=extension`                 | Returns explicit DokuWiki-styled `501` HTML, or JSON by request.   |
| `/doku.php?do=admin&page=popularity`                | Returns explicit DokuWiki-styled `501` HTML, or JSON by request.   |
| `/doku.php?do=admin&page=safefnrecode`              | Returns explicit DokuWiki-styled `501` HTML, or JSON by request.   |
| `/doku.php?do=admin&page=styling`                   | Returns explicit DokuWiki-styled `501` HTML, or JSON by request.   |
| `/doku.php?do=register`                             | Redirects to `/register`.                                          |
| `/doku.php?do=profile`                              | Redirects to `/profile`.                                           |
| `/doku.php?do=resendpwd`                            | Redirects to `/resendpwd`.                                         |
| `/feed.php`, `/feed`, `/feed.xml`                   | Serves RSS.                                                        |
| `/atom.xml`                                         | Serves Atom.                                                       |
| `/sitemap.xml`, `/sitemap`                          | Serves sitemap XML.                                                |
| `/robots.txt`                                       | Serves robots policy with sitemap pointer.                         |
| `/lib/exe/fetch.php?media=<media>`                  | Redirects to `/media/<media>`.                                     |
| `/lib/exe/detail.php?id=<media>`                    | Redirects to `/media-detail/<media>`.                              |
| `/media-detail/<media>?mediado=diff`                | Serves the native side-by-side media revision diff view.           |
| `/lib/exe/mediamanager.php?ns=<namespace>`          | Redirects to `/media-manager`.                                     |
| `/lib/exe/ajax.php?call=qsearch`                    | Serves native quick search markup.                                 |
| `/lib/exe/ajax.php?call=suggestions`                | Serves DokuWiki-compatible suggestion JSON.                        |
| `/lib/exe/ajax.php?call=linkwiz`                    | Serves native link wizard markup.                                  |
| `/lib/exe/ajax.php?call=index`                      | Serves namespace index markup.                                     |
| `/lib/exe/opensearch.php`, `/opensearch.xml`        | Serves OpenSearch XML.                                             |
| `/lib/exe/manifest.php`, `/manifest.webmanifest`    | Serves web manifest JSON.                                          |
| `/lib/exe/css.php`                                  | Redirects to `/dokuwiki.css`.                                      |
| `/lib/exe/js.php`, `/lib/exe/jquery.php`            | Redirects to `/dokuwiki.js`.                                       |
| `/lib/exe/xmlrpc.php`                               | Returns explicit `501` JSON.                                       |
| `/lib/exe/jsonrpc.php`                              | Returns explicit `501` JSON.                                       |
| `/lib/exe/openapi.php`                              | Returns explicit `501` JSON.                                       |
| `/lib/exe/indexer.php`                              | Returns explicit DokuWiki-styled `501` HTML, or JSON by request.   |
| `/lib/exe/taskrunner.php`                           | Returns `204` because there is no PHP task runner.                 |
| `/install.php`                                      | Returns explicit DokuWiki-styled `410` HTML, or JSON by request.   |
| `/profile`                                          | Serves the native profile update form for authenticated users.     |
| `/api/auth/profile`                                 | Updates display name, email, and password for authenticated users. |
| `/register`, `/resendpwd`, `/password-reset`        | Serve native registration and password reset forms.                |
| `/api/auth/register`                                | Creates a native D1 user and session.                              |
| `/api/auth/password-reset`                          | Requests a password reset email.                                   |
| `/api/auth/password-reset/confirm`                  | Consumes a reset token and updates the password.                   |
| `/wiki/<page>?do=subscribe`                         | Serves page and namespace subscription management.                 |
| `/api/subscriptions`                                | Updates authenticated user subscriptions.                          |
| `/api/tasks/email-digests`                          | Runs token-protected scheduled daily/weekly digest delivery.       |

Unsupported legacy executables are handled deliberately so old clients receive a
stable response instead of an ambiguous 404.
