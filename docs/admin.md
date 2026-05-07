# Admin Operations

Native admin routes use D1-backed session principals and group membership.

- `/admin` is the admin dashboard and requires `manager` or `admin`.
- `/admin/acl` manages ACL rules and requires `admin`.
- `/doku.php?do=admin` redirects to `/admin`.
- `/doku.php?do=admin&page=acl` redirects to `/admin/acl`.

The dashboard links to diagnostics, ACL management for admin users, and the media manager. Manager users can view the dashboard but cannot edit ACL rules unless they also belong to the `admin` group.
