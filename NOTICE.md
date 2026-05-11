# Notices

This port reuses and adapts visual structure, CSS concepts, and image assets from the upstream DokuWiki default template.

- Source project: DokuWiki
- Template: `lib/tpl/dokuwiki`
- Template name: DokuWiki Template
- Template author: Anika Henke
- Additional upstream template authors listed in source comments include Andreas Gohr and Clarence Lee.
- License: GNU General Public License version 2, included in `COPYING`.
- Upstream template page: https://www.dokuwiki.org/template:dokuwiki

Copied template image assets keep their upstream credits:

- Site/search icon assets: Dusseldorf icon set by pc.de, Creative Commons Attribution 3.0. The upstream notice is copied to `public/images/license.txt`.
- Page tool icons: iPhone toolbar icons by TheWorkingGroup.ca, Creative Commons Attribution-ShareAlike 3.0. The upstream notice is copied to `public/images/pagetools/license.txt`.
- The ACL fixture `test/fixtures/dokuwiki-conf/acl.auth.php.dist` is copied from upstream DokuWiki `conf/acl.auth.php.dist` under GPL-2.0 for importer and resolver parity tests.

The adapted Pages.dev implementation is not the original PHP template. It is a native TypeScript/Cloudflare Pages port that preserves the recognisable DokuWiki layout and styling where practical.
