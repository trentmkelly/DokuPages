# UI Surface

The current Pages build ports the visible DokuWiki shell with checked-in
template CSS, copied template images, page tools, site tools, media manager, and
admin surfaces.

Implemented UI areas:

- Default DokuWiki-style template shell with header, breadcrumbs, page ID,
  content area, page tools, footer, and copied default-template assets.
- User tools for login, logout, and current session display.
- Page tools for show, edit, revisions, backlinks, source, export, and cache
  purge actions where supported by the route.
- Media manager for namespace browsing, media search, upload, detail, delete,
  and revert workflows.
- Admin dashboard with diagnostics, ACL manager, audit log, media manager link,
  and search index rebuild action.

Deferred UI areas:

- Profile editing.
- User manager.
- Configuration editor.
- Runtime styling editor.
- Formal accessibility and visual regression test coverage.
