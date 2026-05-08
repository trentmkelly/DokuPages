# URL Compatibility And Redirect Audit

This audit maps legacy DokuWiki entrypoints to the Pages-native route surface.

| Legacy URL                                          | Pages behavior                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `/`                                                 | Redirects to the configured start page.                             |
| `/index.php`                                        | Redirects to the configured start page.                             |
| `/doku.php?id=<page>`                               | Redirects to `/wiki/<page>`.                                        |
| `/doku.php?id=<page>&do=edit`                       | Redirects to the page edit route.                                   |
| `/doku.php?id=<page>&do=diff&rev=<rev>&rev2=<rev2>` | Redirects to the page diff route.                                   |
| `/doku.php?id=<page>&do=revisions`                  | Redirects to the page revision list.                                |
| `/doku.php?id=<page>&do=backlink`                   | Redirects to the page backlinks view.                               |
| `/doku.php?id=<page>&do=source`                     | Redirects to the page source view.                                  |
| `/doku.php?id=<page>&do=export_raw`                 | Redirects to the raw export route.                                  |
| `/doku.php?id=<page>&do=export_xhtml`               | Redirects to the XHTML export route.                                |
| `/doku.php?do=admin`                                | Redirects to `/admin`.                                              |
| `/doku.php?do=admin&page=acl`                       | Redirects to `/admin/acl`.                                          |
| `/doku.php?do=admin&page=config`                    | Redirects to `/admin/config`.                                       |
| `/doku.php?do=admin&page=info`                      | Redirects to `/diagnostics`.                                        |
| `/doku.php?do=admin&page=logviewer`                 | Redirects to `/admin/audit`.                                        |
| `/doku.php?do=admin&page=usermanager`               | Redirects to `/admin/users`.                                        |
| `/doku.php?do=admin&page=extension`                 | Returns explicit `501` JSON.                                        |
| `/doku.php?do=admin&page=popularity`                | Returns explicit `501` JSON.                                        |
| `/doku.php?do=admin&page=safefnrecode`              | Returns explicit `501` JSON.                                        |
| `/doku.php?do=admin&page=styling`                   | Returns explicit `501` JSON.                                        |
| `/doku.php?do=register`                             | Redirects to `/register`.                                           |
| `/doku.php?do=profile`                              | Redirects to `/profile`.                                            |
| `/doku.php?do=resendpwd`                            | Redirects to `/resendpwd`.                                          |
| `/feed.php`, `/feed`, `/feed.xml`                   | Serves RSS.                                                         |
| `/atom.xml`                                         | Serves Atom.                                                        |
| `/sitemap.xml`, `/sitemap`                          | Serves sitemap XML.                                                 |
| `/robots.txt`                                       | Serves robots policy with sitemap pointer.                          |
| `/lib/exe/fetch.php?media=<media>`                  | Redirects to `/media/<media>`.                                      |
| `/lib/exe/detail.php?id=<media>`                    | Redirects to `/media-detail/<media>`.                               |
| `/lib/exe/mediamanager.php?ns=<namespace>`          | Redirects to `/media-manager`.                                      |
| `/lib/exe/ajax.php?call=qsearch`                    | Serves native quick search markup.                                  |
| `/lib/exe/ajax.php?call=suggestions`                | Serves DokuWiki-compatible suggestion JSON.                         |
| `/lib/exe/ajax.php?call=linkwiz`                    | Serves native link wizard markup.                                   |
| `/lib/exe/ajax.php?call=index`                      | Serves namespace index markup.                                      |
| `/lib/exe/opensearch.php`, `/opensearch.xml`        | Serves OpenSearch XML.                                              |
| `/lib/exe/manifest.php`, `/manifest.webmanifest`    | Serves web manifest JSON.                                           |
| `/lib/exe/css.php`                                  | Redirects to `/dokuwiki.css`.                                       |
| `/lib/exe/js.php`, `/lib/exe/jquery.php`            | Redirects to `/dokuwiki.js`.                                        |
| `/lib/exe/xmlrpc.php`                               | Returns explicit `501` JSON.                                        |
| `/lib/exe/jsonrpc.php`                              | Returns explicit `501` JSON.                                        |
| `/lib/exe/openapi.php`                              | Returns explicit `501` JSON.                                        |
| `/lib/exe/indexer.php`                              | Returns explicit `501` JSON.                                        |
| `/lib/exe/taskrunner.php`                           | Returns `204` because there is no PHP task runner.                  |
| `/install.php`                                      | Returns explicit `410` JSON; production installs are not supported. |
| `/profile`                                          | Serves the native profile update form for authenticated users.      |
| `/api/auth/profile`                                 | Updates display name, email, and password for authenticated users.  |
| `/register`, `/resendpwd`, `/password-reset`        | Serve native registration and password reset forms.                 |
| `/api/auth/register`                                | Creates a native D1 user and session.                               |
| `/api/auth/password-reset`                          | Requests a password reset email.                                    |
| `/api/auth/password-reset/confirm`                  | Consumes a reset token and updates the password.                    |

Unsupported legacy executables are handled deliberately so old clients receive a
stable response instead of an ambiguous 404.
