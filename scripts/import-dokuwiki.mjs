#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { gunzip } from "node:zlib";
import path from "node:path";
import { promisify, TextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { STOP_WORDS_BY_LANGUAGE } from "./stopwords-data.mjs";

const gunzipAsync = promisify(gunzip);
const DEFAULT_AUTH_GROUP = "user";
const DEFAULT_MIME_TYPES = new Map([
  ["gif", "image/gif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["txt", "text/plain"],
  ["webp", "image/webp"]
]);

export async function buildImportPlan(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const dataRoot = path.join(root, "data");
  const confRoot = path.join(root, "conf");
  const { configSettings, pluginConfigSettings } = await discoverConfigSettings([
    { file: path.join(confRoot, "dokuwiki.php"), layer: "default", locked: false },
    { file: path.join(confRoot, "local.php"), layer: "local", locked: false },
    { file: path.join(confRoot, "local.protected.php"), layer: "protected", locked: true }
  ]);
  const language = importedLanguage(configSettings);
  const fileNameEncoding = importedFileNameEncoding(configSettings);

  const pages = await discoverPages(path.join(dataRoot, "pages"), {
    fnencode: fileNameEncoding
  });
  const pageRevisions = await discoverPageRevisions(path.join(dataRoot, "attic"), {
    fnencode: fileNameEncoding
  });
  const pageChangelogEntries = await discoverChangelogEntries(
    path.join(dataRoot, "meta", "_dokuwiki.changes"),
    "page"
  );
  const pageMetadata = await discoverSerializedMetadata(path.join(dataRoot, "meta"), "page", {
    fnencode: fileNameEncoding
  });
  const media = await discoverMedia(path.join(dataRoot, "media"), {
    fnencode: fileNameEncoding
  });
  const mediaRevisions = await discoverMediaRevisions(path.join(dataRoot, "media_attic"), {
    fnencode: fileNameEncoding
  });
  const mediaChangelogEntries = await discoverChangelogEntries(
    path.join(dataRoot, "meta", "_media.changes"),
    "media"
  );
  const mediaMetadata = await discoverSerializedMetadata(
    path.join(dataRoot, "media_meta"),
    "media",
    {
      fnencode: fileNameEncoding
    }
  );
  const aclRules = await discoverAclRules(path.join(confRoot, "acl.auth.php"));
  const users = await discoverUsers(path.join(confRoot, "users.auth.php"));
  const pluginSettings = await discoverPluginSettings([
    { file: path.join(confRoot, "plugins.php"), layer: "default", locked: false },
    { file: path.join(confRoot, "plugins.local.php"), layer: "local", locked: false },
    { file: path.join(confRoot, "plugins.required.php"), layer: "required", locked: true }
  ]);
  const interwikiTemplates = await discoverInterwikiTemplates([
    path.join(confRoot, "interwiki.conf"),
    path.join(confRoot, "interwiki.local.conf")
  ]);
  const mimeTypes = await discoverMimeTypes([
    path.join(confRoot, "mime.conf"),
    path.join(confRoot, "mime.local.conf")
  ]);
  const schemeProtocols = await discoverSchemeProtocols([
    path.join(confRoot, "scheme.conf"),
    path.join(confRoot, "scheme.local.conf")
  ]);
  const entityReplacements = await discoverEntityReplacements([
    path.join(confRoot, "entities.conf"),
    path.join(confRoot, "entities.local.conf")
  ]);
  const smileyMappings = await discoverSmileyMappings([
    path.join(confRoot, "smileys.conf"),
    path.join(confRoot, "smileys.local.conf")
  ]);
  const acronymMappings = await discoverAcronymMappings([
    path.join(confRoot, "acronyms.conf"),
    path.join(confRoot, "acronyms.local.conf")
  ]);
  const wordblockPatterns = await discoverWordblockPatterns(path.join(confRoot, "wordblock.conf"));
  const customLanguageFiles = await discoverCustomLanguageFiles(path.join(confRoot, "lang"));
  const customTemplateFiles = await discoverCustomTemplateFiles(path.join(root, "lib", "tpl"));

  return {
    sourceRoot: root,
    generatedAt: new Date().toISOString(),
    language,
    counts: {
      pages: pages.length,
      pageRevisions: pageRevisions.length,
      pageChangelogEntries: pageChangelogEntries.length,
      pageMetadata: pageMetadata.length,
      media: media.length,
      mediaRevisions: mediaRevisions.length,
      mediaChangelogEntries: mediaChangelogEntries.length,
      mediaMetadata: mediaMetadata.length,
      aclRules: aclRules.length,
      users: users.length,
      configSettings: configSettings.length,
      pluginConfigSettings: pluginConfigSettings.length,
      pluginSettings: pluginSettings.length,
      interwikiTemplates: interwikiTemplates.length,
      mimeTypes: mimeTypes.length,
      schemeProtocols: schemeProtocols.length,
      entityReplacements: entityReplacements.length,
      smileyMappings: smileyMappings.length,
      acronymMappings: acronymMappings.length,
      wordblockPatterns: wordblockPatterns.length,
      customLanguageFiles: customLanguageFiles.length,
      customTemplateFiles: customTemplateFiles.length
    },
    pages,
    pageRevisions,
    pageChangelogEntries,
    pageMetadata,
    media,
    mediaRevisions,
    mediaChangelogEntries,
    mediaMetadata,
    aclRules,
    users,
    configSettings,
    pluginConfigSettings,
    pluginSettings,
    interwikiTemplates,
    mimeTypes,
    schemeProtocols,
    entityReplacements,
    smileyMappings,
    acronymMappings,
    wordblockPatterns,
    customLanguageFiles,
    customTemplateFiles
  };
}

export async function writePageImportSql(plan, outputFile) {
  const statements = ["-- Generated by scripts/import-dokuwiki.mjs"];
  const searchStopWords = stopWordsForLanguage(plan.language);
  const pageChangesByRevision = changelogEntriesByRevision(plan.pageChangelogEntries);

  for (const page of plan.pages) {
    const content = await fs.readFile(page.sourcePath, "utf8");
    const revisionId = `${page.id}@${page.modifiedAt}`;
    const revisionChange = revisionImportMetadata(pageChangesByRevision.get(revisionId), {
      summary: "Imported from DokuWiki flat files",
      changeType: "create",
      sizeChange: page.byteLength
    });
    const namespace = page.id.includes(":") ? page.id.slice(0, page.id.lastIndexOf(":")) : "";
    const title =
      extractTitle(content) ??
      (page.id.includes(":") ? page.id.slice(page.id.lastIndexOf(":") + 1) : page.id);

    statements.push(
      `insert into pages (id, namespace, title, current_revision_id, is_deleted, created_at, updated_at)
values (${sql(page.id)}, ${sql(namespace)}, ${sql(title)}, ${sql(revisionId)}, 0, ${sql(page.modifiedAt)}, ${sql(
        page.modifiedAt
      )})
on conflict(id) do update set
  namespace = excluded.namespace,
  title = excluded.title,
  current_revision_id = excluded.current_revision_id,
  is_deleted = excluded.is_deleted,
  updated_at = excluded.updated_at;`
    );

    statements.push(
      `insert or replace into page_revisions (
  id, page_id, content, content_hash, author_id, author_name, summary, change_type, size_change, created_at
) values (
  ${sql(revisionId)}, ${sql(page.id)}, ${sql(content)}, ${sql(page.contentHash)}, ${sql(
    revisionChange.authorId
  )}, ${sql(revisionChange.authorName)},
  ${sql(revisionChange.summary)}, ${sql(revisionChange.changeType)}, ${revisionChange.sizeChange}, ${sql(
    page.modifiedAt
  )}
);`
    );

    const searchTerms = buildSearchTermFrequencies(content, title, searchStopWords, page.id);
    statements.push(`delete from search_postings where page_id = ${sql(page.id)};`);

    for (const [term, frequency] of searchTerms) {
      statements.push(
        `insert into search_terms (term, term_length, document_count)
values (${sql(term)}, ${searchIndexWordLength(term)}, 0)
on conflict(term) do update set
  term_length = excluded.term_length;`
      );
      statements.push(
        `insert into search_postings (term, page_id, frequency, updated_at)
values (${sql(term)}, ${sql(page.id)}, ${frequency}, ${sql(page.modifiedAt)})
on conflict(term, page_id) do update set
  frequency = excluded.frequency,
  updated_at = excluded.updated_at;`
      );
    }
  }

  for (const revision of plan.pageRevisions) {
    const raw = await readMaybeCompressed(revision.sourcePath, revision.compression);
    const content = raw.toString("utf8");
    const createdAt = pageRevisionCreatedAt(revision);
    const revisionId = `${revision.pageId}@${createdAt}`;
    const revisionChange = revisionImportMetadata(pageChangesByRevision.get(revisionId), {
      summary: "Imported from DokuWiki attic",
      changeType: "edit",
      sizeChange: revision.byteLength
    });

    statements.push(
      `insert or replace into page_revisions (
  id, page_id, content, content_hash, author_id, author_name, summary, change_type, size_change, created_at
) values (
  ${sql(revisionId)}, ${sql(revision.pageId)}, ${sql(content)}, ${sql(revision.contentHash)}, ${sql(
    revisionChange.authorId
  )}, ${sql(revisionChange.authorName)},
  ${sql(revisionChange.summary)}, ${sql(revisionChange.changeType)}, ${revisionChange.sizeChange}, ${sql(
    createdAt
  )}
);`
    );
  }

  statements.push(
    `update search_terms
set document_count = (
  select count(*)
  from search_postings
  where search_postings.term = search_terms.term
);`
  );
  statements.push("delete from search_terms where document_count = 0;");

  for (const media of plan.media) {
    const revisionId = mediaRevisionId(media.id, media.modifiedAt);
    const namespace = mediaNamespace(media.id);
    const mimeType = mediaMimeType(media.id, plan.mimeTypes);

    statements.push(
      `insert into media (
  id, namespace, object_key, mime_type, byte_length, content_hash,
  current_revision_id, is_deleted, created_at, updated_at
) values (
  ${sql(media.id)}, ${sql(namespace)}, ${sql(media.objectKey)}, ${sql(mimeType)}, ${media.byteLength}, ${sql(
    media.contentHash
  )},
  ${sql(revisionId)}, 0, ${sql(media.modifiedAt)}, ${sql(media.modifiedAt)}
)
on conflict(id) do update set
  namespace = excluded.namespace,
  object_key = excluded.object_key,
  mime_type = excluded.mime_type,
  byte_length = excluded.byte_length,
  content_hash = excluded.content_hash,
  current_revision_id = excluded.current_revision_id,
  is_deleted = excluded.is_deleted,
  updated_at = excluded.updated_at;`
    );

    statements.push(
      `insert or replace into media_revisions (
  id, media_id, object_key, mime_type, byte_length, content_hash,
  author_id, summary, change_type, created_at
) values (
  ${sql(revisionId)}, ${sql(media.id)}, ${sql(media.objectKey)}, ${sql(mimeType)}, ${media.byteLength}, ${sql(
    media.contentHash
  )},
  null, 'Imported from DokuWiki media files', 'create', ${sql(media.modifiedAt)}
);`
    );
  }

  for (const revision of plan.mediaRevisions) {
    const createdAt = mediaRevisionCreatedAt(revision);
    const revisionId = mediaRevisionId(revision.mediaId, createdAt);
    const mimeType = mediaMimeType(revision.mediaId, plan.mimeTypes);

    statements.push(
      `insert or replace into media_revisions (
  id, media_id, object_key, mime_type, byte_length, content_hash,
  author_id, summary, change_type, created_at
) values (
  ${sql(revisionId)}, ${sql(revision.mediaId)}, ${sql(revision.objectKey)}, ${sql(mimeType)}, ${revision.byteLength}, ${sql(
    revision.contentHash
  )},
  null, 'Imported from DokuWiki media attic', 'edit', ${sql(createdAt)}
);`
    );
  }

  for (const entry of [...plan.pageMetadata, ...plan.mediaMetadata]) {
    statements.push(
      metadataStatement(
        entry.subjectType,
        entry.subjectId,
        "dokuwiki",
        entry.value,
        entry.modifiedAt
      )
    );
  }

  for (const entry of plan.customLanguageFiles) {
    statements.push(
      metadataStatement(
        "config",
        `language:${entry.relativePath}`,
        "dokuwiki_language_file",
        customFileMetadataValue(entry),
        entry.modifiedAt
      )
    );
  }

  for (const entry of plan.customTemplateFiles) {
    statements.push(
      metadataStatement(
        "config",
        `template:${entry.relativePath}`,
        "dokuwiki_template_file",
        customFileMetadataValue(entry),
        entry.modifiedAt
      )
    );
  }

  for (const change of [...plan.pageChangelogEntries, ...plan.mediaChangelogEntries]) {
    statements.push(
      `insert or replace into changelog (
  id, subject_type, subject_id, revision_id, user_id, user_name, ip,
  change_type, summary, size_change, created_at
) values (
  ${sql(change.id)}, ${sql(change.subjectType)}, ${sql(change.subjectId)}, ${sql(
    change.revisionId
  )}, ${sql(change.userName ? userId(change.userName) : null)}, ${sql(change.userName)}, ${sql(change.ip)},
  ${sql(change.changeType)}, ${sql(change.summary)}, ${change.sizeChange ?? 0}, ${sql(change.createdAt)}
);`
    );
  }

  for (const setting of plan.configSettings) {
    statements.push(
      metadataStatement("config", "dokuwiki", `conf:${setting.key}`, setting, plan.generatedAt)
    );
  }

  for (const setting of plan.pluginSettings) {
    statements.push(pluginSettingStatement(setting.plugin, "enabled", setting, plan.generatedAt));
  }

  for (const setting of plan.pluginConfigSettings) {
    statements.push(pluginSettingStatement(setting.plugin, setting.key, setting, plan.generatedAt));
  }

  for (const entry of plan.interwikiTemplates) {
    statements.push(
      metadataStatement("config", "interwiki", entry.shortcut, entry, plan.generatedAt)
    );
  }

  for (const entry of plan.mimeTypes) {
    statements.push(metadataStatement("config", "mime", entry.extension, entry, plan.generatedAt));
  }

  for (const entry of plan.schemeProtocols) {
    statements.push(metadataStatement("config", "scheme", entry.protocol, entry, plan.generatedAt));
  }

  for (const entry of plan.entityReplacements) {
    statements.push(metadataStatement("config", "entities", entry.token, entry, plan.generatedAt));
  }

  for (const entry of plan.smileyMappings) {
    statements.push(metadataStatement("config", "smileys", entry.token, entry, plan.generatedAt));
  }

  for (const entry of plan.acronymMappings) {
    statements.push(
      metadataStatement("config", "acronyms", entry.acronym, entry, plan.generatedAt)
    );
  }

  for (const entry of plan.wordblockPatterns) {
    statements.push(metadataStatement("config", "wordblock", entry.id, entry, plan.generatedAt));
  }

  for (const rule of plan.aclRules) {
    statements.push(
      `insert into acl_rules (id, scope, principal_type, principal, permission, created_at)
values (${sql(rule.id)}, ${sql(rule.scope)}, ${sql(rule.principalType)}, ${sql(rule.principal)}, ${rule.permission}, ${sql(
        rule.createdAt ?? plan.generatedAt
      )})
on conflict(id) do update set
  scope = excluded.scope,
  principal_type = excluded.principal_type,
  principal = excluded.principal,
  permission = excluded.permission,
  created_at = excluded.created_at;`
    );
  }

  for (const user of plan.users) {
    statements.push(
      `insert into users (
  id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
) values (
  ${sql(user.id)}, ${sql(user.username)}, ${sql(user.displayName)}, ${sql(user.email)}, ${sql(user.passwordHash)},
  ${user.isDisabled ? 1 : 0}, ${sql(user.createdAt)}, ${sql(user.updatedAt)}
)
on conflict(id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  email = excluded.email,
  password_hash = excluded.password_hash,
  is_disabled = excluded.is_disabled,
  updated_at = excluded.updated_at;`
    );
  }

  const groups = new Map();
  for (const user of plan.users) {
    for (const group of user.groups) {
      groups.set(group, user.createdAt);
    }
  }

  for (const [group, createdAt] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    statements.push(
      `insert into groups (id, name, created_at)
values (${sql(groupId(group))}, ${sql(group)}, ${sql(createdAt)})
on conflict(name) do nothing;`
    );
  }

  for (const user of plan.users) {
    for (const group of user.groups) {
      statements.push(
        `insert into user_groups (user_id, group_id, created_at)
values (${sql(user.id)}, ${sql(groupId(group))}, ${sql(user.createdAt)})
on conflict(user_id, group_id) do nothing;`
      );
    }
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${statements.join("\n\n")}\n`);
}

function metadataStatement(subjectType, subjectId, key, value, updatedAt) {
  return `insert or replace into metadata (subject_type, subject_id, key, value_json, updated_at)
values (${sql(subjectType)}, ${sql(subjectId)}, ${sql(key)}, ${sql(JSON.stringify(value))}, ${sql(
    updatedAt
  )});`;
}

function changelogEntriesByRevision(entries) {
  const byRevision = new Map();
  for (const entry of entries) {
    if (!byRevision.has(entry.revisionId)) byRevision.set(entry.revisionId, entry);
  }
  return byRevision;
}

function revisionImportMetadata(change, fallback) {
  return {
    authorId: change?.userName ? userId(change.userName) : null,
    authorName: change?.userName ?? null,
    summary: change ? change.summary : fallback.summary,
    changeType: change?.changeType ?? fallback.changeType,
    sizeChange: change?.sizeChange ?? fallback.sizeChange
  };
}

function pluginSettingStatement(plugin, key, value, updatedAt) {
  return `insert into plugin_settings (plugin, key, value_json, updated_at)
values (${sql(plugin)}, ${sql(key)}, ${sql(JSON.stringify(value))}, ${sql(updatedAt)})
on conflict(plugin, key) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at;`;
}

export async function writeMediaManifest(plan, outputFile) {
  const manifest = {
    generatedAt: plan.generatedAt,
    sourceRoot: plan.sourceRoot,
    objects: mediaImportObjects(plan)
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function writeHashManifest(plan, outputFile) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(buildImportHashManifest(plan), null, 2)}\n`);
}

export function buildImportHashManifest(plan) {
  return {
    generatedAt: plan.generatedAt,
    sourceRoot: plan.sourceRoot,
    pages: plan.pages.map((page) => ({
      id: page.id,
      revisionId: `${page.id}@${page.modifiedAt}`,
      sourcePath: page.sourcePath,
      byteLength: page.byteLength,
      contentHash: page.contentHash,
      modifiedAt: page.modifiedAt
    })),
    pageRevisions: plan.pageRevisions.map((revision) => {
      const createdAt = pageRevisionCreatedAt(revision);

      return {
        pageId: revision.pageId,
        revisionId: `${revision.pageId}@${createdAt}`,
        sourcePath: revision.sourcePath,
        compression: revision.compression,
        byteLength: revision.byteLength,
        contentHash: revision.contentHash,
        modifiedAt: revision.modifiedAt,
        createdAt
      };
    }),
    pageMetadata: plan.pageMetadata.map(importMetadataHashRecord),
    mediaObjects: mediaImportObjects(plan).map((object) => ({
      role: object.role,
      mediaId: object.mediaId,
      revisionId: object.revisionId,
      sourcePath: object.sourcePath,
      objectKey: object.objectKey,
      byteLength: object.byteLength,
      contentHash: object.contentHash,
      modifiedAt: object.modifiedAt
    })),
    mediaMetadata: plan.mediaMetadata.map(importMetadataHashRecord),
    customLanguageFiles: plan.customLanguageFiles.map(importFileHashRecord),
    customTemplateFiles: plan.customTemplateFiles.map(importFileHashRecord)
  };
}

function importMetadataHashRecord(entry) {
  return {
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    sourcePath: entry.sourcePath,
    byteLength: entry.byteLength,
    contentHash: entry.contentHash,
    modifiedAt: entry.modifiedAt
  };
}

function importFileHashRecord(entry) {
  return {
    kind: entry.kind,
    relativePath: entry.relativePath,
    sourcePath: entry.sourcePath,
    byteLength: entry.byteLength,
    contentHash: entry.contentHash,
    modifiedAt: entry.modifiedAt
  };
}

export async function discoverPages(pagesRoot, options = {}) {
  const files = await walkFiles(pagesRoot);
  const pages = [];

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const id = fileToPageId(pagesRoot, file, ".txt", options);

    pages.push({
      id,
      sourcePath: file,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return pages.sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverPageRevisions(atticRoot, options = {}) {
  const files = await walkFiles(atticRoot);
  const revisions = [];

  for (const file of files) {
    const match = file.match(/\.([0-9]{10,})\.txt(\.gz|\.bz2)?$/);
    if (!match) continue;

    const compression = match[2]?.slice(1) ?? "none";
    const pagePath = file
      .slice(atticRoot.length + 1)
      .replace(/\.([0-9]{10,})\.txt(\.gz|\.bz2)?$/, "");
    const id = pathWithoutExtensionToId(pagePath, options);
    const stat = await fs.stat(file);
    const raw = await readMaybeCompressed(file, compression);

    revisions.push({
      pageId: id,
      revision: match[1],
      sourcePath: file,
      compression,
      byteLength: raw.byteLength,
      contentHash: sha256(raw),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return revisions.sort((a, b) =>
    `${a.pageId}:${a.revision}`.localeCompare(`${b.pageId}:${b.revision}`)
  );
}

export async function discoverMedia(mediaRoot, options = {}) {
  const files = await walkFiles(mediaRoot);
  const media = [];

  for (const file of files) {
    if (path.basename(file).startsWith("_")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const id = pathWithoutExtensionToId(path.relative(mediaRoot, file), options);

    media.push({
      id,
      sourcePath: file,
      objectKey: `media/current/${id.replaceAll(":", "/")}`,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return media.sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverMediaRevisions(mediaAtticRoot, options = {}) {
  const files = await walkFiles(mediaAtticRoot);
  const revisions = [];

  for (const file of files) {
    if (path.basename(file).startsWith("_")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const relative = path.relative(mediaAtticRoot, file);
    const parsed = parseMediaRevisionPath(relative, options);

    revisions.push({
      mediaId: parsed.mediaId,
      revision: parsed.revision,
      sourcePath: file,
      objectKey: `media/revisions/${parsed.mediaId.replaceAll(":", "/")}/${parsed.revision}`,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return revisions.sort((a, b) =>
    `${a.mediaId}:${a.revision}`.localeCompare(`${b.mediaId}:${b.revision}`)
  );
}

function mediaImportObjects(plan) {
  return [
    ...plan.media.map((media) => ({
      role: "current",
      mediaId: media.id,
      revisionId: mediaRevisionId(media.id, media.modifiedAt),
      sourcePath: media.sourcePath,
      objectKey: media.objectKey,
      mimeType: mediaMimeType(media.id, plan.mimeTypes),
      byteLength: media.byteLength,
      contentHash: media.contentHash,
      modifiedAt: media.modifiedAt
    })),
    ...plan.mediaRevisions.map((revision) => {
      const createdAt = mediaRevisionCreatedAt(revision);

      return {
        role: "revision",
        mediaId: revision.mediaId,
        revisionId: mediaRevisionId(revision.mediaId, createdAt),
        sourcePath: revision.sourcePath,
        objectKey: revision.objectKey,
        mimeType: mediaMimeType(revision.mediaId, plan.mimeTypes),
        byteLength: revision.byteLength,
        contentHash: revision.contentHash,
        modifiedAt: revision.modifiedAt
      };
    })
  ];
}

function mediaNamespace(id) {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
}

function mediaMimeType(id, mimeTypes) {
  const extension = id.includes(".") ? id.slice(id.lastIndexOf(".") + 1).toLowerCase() : "";
  const configured = mimeTypes.find((entry) => entry.extension === extension);
  return configured?.mimeType ?? DEFAULT_MIME_TYPES.get(extension) ?? "application/octet-stream";
}

function mediaRevisionCreatedAt(revision) {
  if (/^\d{10,}$/.test(revision.revision)) {
    return new Date(Number.parseInt(revision.revision, 10) * 1000).toISOString();
  }

  return revision.modifiedAt;
}

function pageRevisionCreatedAt(revision) {
  if (/^\d{10,}$/.test(revision.revision)) {
    return new Date(Number.parseInt(revision.revision, 10) * 1000).toISOString();
  }

  return revision.modifiedAt;
}

function mediaRevisionId(id, createdAt) {
  return `${id}@${createdAt}`;
}

export async function discoverChangelogEntries(file, subjectType) {
  const text = await readTextIfExists(file);
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line, index) => parseChangelogLine(line, subjectType, index))
    .filter(Boolean);
}

function parseChangelogLine(line, subjectType, index) {
  if (!line.trim()) return null;

  const fields = line.replace(/\r?\n$/, "").split("\t");
  while (fields.length < 8) fields.push("");

  const [timestamp, ip, rawType, subjectId, userName, summary, extra, rawSizeChange] = fields;
  if (!timestamp || !subjectId) return null;

  const createdAt = new Date(Number.parseInt(timestamp, 10) * 1000).toISOString();

  return {
    id: `changelog:${subjectType}:${subjectId}:${timestamp}:${index + 1}`,
    subjectType,
    subjectId,
    revisionId: `${subjectId}@${createdAt}`,
    userName: userName || null,
    ip: ip || null,
    changeType: dokuChangeType(rawType),
    summary,
    extra,
    sizeChange: rawSizeChange === "" ? null : Number.parseInt(rawSizeChange, 10),
    createdAt
  };
}

function dokuChangeType(type) {
  switch (type) {
    case "C":
      return "create";
    case "e":
      return "minor";
    case "D":
      return "delete";
    case "R":
      return "revert";
    case "E":
    default:
      return "edit";
  }
}

export async function discoverSerializedMetadata(root, subjectType, options = {}) {
  const files = await walkFiles(root);
  const entries = [];

  for (const file of files) {
    if (!file.endsWith(".meta")) continue;

    const relative = path.relative(root, file).slice(0, -".meta".length);
    const stat = await fs.stat(file);
    const content = await fs.readFile(file);

    entries.push({
      subjectType,
      subjectId: pathWithoutExtensionToId(relative, options),
      sourcePath: file,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      value: parsePhpSerialized(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return entries.sort((a, b) => a.subjectId.localeCompare(b.subjectId));
}

export async function discoverCustomLanguageFiles(root) {
  return discoverImportFiles(root, (relativePath) => {
    const [language, ...parts] = relativePath.split("/");
    if (!language || parts.length === 0) return null;

    return {
      kind: "language",
      language,
      path: parts.join("/")
    };
  });
}

export async function discoverCustomTemplateFiles(root) {
  return discoverImportFiles(root, (relativePath) => {
    const [template, ...parts] = relativePath.split("/");
    if (!template || parts.length === 0) return null;

    return {
      kind: "template",
      template,
      path: parts.join("/")
    };
  });
}

async function discoverImportFiles(root, mapRelativePath) {
  const files = await walkFiles(root);
  const entries = [];

  for (const file of files) {
    if (shouldSkipImportFile(file)) continue;

    const relativePath = normalizeRelativePath(path.relative(root, file));
    const mapped = mapRelativePath(relativePath);
    if (!mapped) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);

    entries.push({
      ...mapped,
      relativePath,
      sourcePath: file,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString(),
      ...contentPayload(content)
    });
  }

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function shouldSkipImportFile(file) {
  const basename = path.basename(file);
  return basename.startsWith(".") || basename.endsWith("~") || basename === "Thumbs.db";
}

function customFileMetadataValue(entry) {
  const value = {
    kind: entry.kind,
    relativePath: entry.relativePath,
    path: entry.path,
    byteLength: entry.byteLength,
    contentHash: entry.contentHash,
    encoding: entry.encoding,
    content: entry.content
  };

  if (entry.kind === "language") value.language = entry.language;
  if (entry.kind === "template") value.template = entry.template;

  return value;
}

function contentPayload(content) {
  const text = content.toString("utf8");
  if (!text.includes("\u0000") && Buffer.from(text, "utf8").equals(content)) {
    return {
      encoding: "utf8",
      content: text
    };
  }

  return {
    encoding: "base64",
    content: content.toString("base64")
  };
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export async function discoverAclRules(file) {
  const text = await readTextIfExists(file);
  if (!text) return [];
  const stat = await fs.stat(file);
  const createdAt = stat.mtime.toISOString();

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const [scope, principal, permission] = line.split(/\s+/);
      const parsedPermission = Number.parseInt(permission, 10);
      if (!scope || !principal || !Number.isFinite(parsedPermission)) return null;

      return {
        id: `acl:${index + 1}`,
        scope,
        principalType: aclPrincipalType(principal),
        principal,
        permission: parsedPermission,
        createdAt
      };
    })
    .filter(Boolean);
}

function aclPrincipalType(principal) {
  if (principal === "@ALL") return "all";
  if (principal === "%GROUP%" || principal.startsWith("@")) return "group";
  return "user";
}

export async function discoverUsers(file) {
  const text = await readTextIfExists(file);
  if (!text) return [];
  const stat = await fs.stat(file);
  const createdAt = stat.mtime.toISOString();

  return text
    .split(/\r?\n/)
    .map((line) => parseUserLine(line, createdAt))
    .filter(Boolean);
}

function parseUserLine(line, createdAt) {
  const trimmed = line.replace(/(?<!\\)#.*$/, "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const row = splitEscapedUserLine(trimmed).map(unescapeUserField);
  while (row.length < 5) row.push("");

  const [username, passwordHash, displayName, email, rawGroups] = row;
  if (!username) return null;

  const groups = normalizeUserGroups(rawGroups);

  return {
    id: userId(username),
    username,
    passwordHash,
    displayName: safeDecodeURIComponent(displayName) || username,
    email: email || null,
    groups,
    isDisabled: false,
    createdAt,
    updatedAt: createdAt
  };
}

function splitEscapedUserLine(line) {
  const fields = [];
  let current = "";
  let escaped = false;

  for (const char of line) {
    if (char === ":" && !escaped && fields.length < 4) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }

  fields.push(current);
  return fields;
}

function unescapeUserField(value) {
  return value.replace(/\\:/g, ":").replace(/\\\\/g, "\\").replace(/\\#/g, "#");
}

function normalizeUserGroups(groups) {
  const normalized = groups
    .split(",")
    .map((group) => group.trim().replace(/^@+/, ""))
    .filter(Boolean);

  return [...new Set(normalized.length > 0 ? normalized : [DEFAULT_AUTH_GROUP])];
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function userId(username) {
  return `user:${username}`;
}

function groupId(group) {
  return `group:${group}`;
}

export async function discoverConfigSettings(sources) {
  const configSettings = new Map();
  const pluginConfigSettings = new Map();

  for (const source of sources) {
    const text = await readTextIfExists(source.file);
    if (!text) continue;

    for (const line of text.split(/\r?\n/)) {
      const assignment = parseConfAssignment(line, source);
      if (!assignment) continue;

      if (assignment.path[0] === "plugin" && assignment.path.length >= 3) {
        const plugin = assignment.path[1];
        const keyPath = assignment.path.slice(2);
        pluginConfigSettings.set(`${plugin}:${keyPath.join(".")}`, {
          plugin,
          key: keyPath.join("."),
          path: keyPath,
          value: assignment.value,
          rawValue: assignment.rawValue,
          source: assignment.source,
          layer: assignment.layer,
          locked: assignment.locked
        });
        continue;
      }

      configSettings.set(assignment.path.join("."), assignment);
    }
  }

  return {
    configSettings: [...configSettings.values()].sort((a, b) => a.key.localeCompare(b.key)),
    pluginConfigSettings: [...pluginConfigSettings.values()].sort(
      (a, b) => a.plugin.localeCompare(b.plugin) || a.key.localeCompare(b.key)
    )
  };
}

function parseConfAssignment(line, source) {
  const match = line.match(/^\s*\$conf((?:\[['"][^'"]+['"]\])+)\s*=\s*(.+?);\s*(?:(?:\/\/|#).*)?$/);
  if (!match) return null;

  const pathParts = [...match[1].matchAll(/\[['"]([^'"]+)['"]\]/g)].map((part) => part[1]);
  if (pathParts.length === 0) return null;

  const rawValue = match[2].trim();

  return {
    key: pathParts.join("."),
    path: pathParts,
    value: parsePhpConfigValue(rawValue),
    rawValue,
    source: path.basename(source.file),
    layer: source.layer,
    locked: source.locked
  };
}

function parsePhpConfigValue(rawValue) {
  const value = rawValue.trim();
  const lower = value.toLowerCase();

  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (isQuotedPhpString(value)) return unquotePhpString(value);

  return { raw: value };
}

function isQuotedPhpString(value) {
  return (
    (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))
  );
}

function unquotePhpString(value) {
  const quote = value[0];
  const body = value.slice(1, -1);

  if (quote === "'") {
    return body.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  return body
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

export async function discoverPluginSettings(sources) {
  const settings = new Map();

  for (const source of sources) {
    const text = await readTextIfExists(source.file);
    if (!text) continue;

    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/\$plugins\[['"](.+?)['"]\]\s*=\s*(0|1|true|false)\s*;/i);
      if (!match) continue;

      const plugin = match[1];
      const enabled = match[2] === "1" || match[2].toLowerCase() === "true";
      settings.set(plugin, {
        plugin,
        enabled,
        source: path.basename(source.file),
        layer: source.layer,
        locked: source.locked
      });
    }
  }

  return [...settings.values()].sort((a, b) => a.plugin.localeCompare(b.plugin));
}

export async function discoverInterwikiTemplates(files) {
  const templates = new Map();

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const [shortcut, rawTemplate] = line.split(/\s+/);
      if (!shortcut || !rawTemplate) continue;

      templates.set(shortcut.toLowerCase(), {
        shortcut: shortcut.toLowerCase(),
        template: decodeConfigEntities(rawTemplate)
      });
    }
  }

  return [...templates.values()].sort((a, b) => a.shortcut.localeCompare(b.shortcut));
}

export async function discoverMimeTypes(files) {
  const entries = new Map();

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const [rawExtension, rawMimeType] = line.split(/\s+/);
      if (!rawExtension || !rawMimeType) continue;

      const forceDownload = rawMimeType.startsWith("!");
      const mimeType = forceDownload ? rawMimeType.slice(1) : rawMimeType;
      const extension = rawExtension.toLowerCase();
      entries.set(extension, {
        extension,
        mimeType,
        forceDownload
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.extension.localeCompare(b.extension));
}

export async function discoverSchemeProtocols(files) {
  const entries = new Map();

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const remove = line.startsWith("!");
      const protocol = (remove ? line.slice(1) : line).trim().toLowerCase();
      if (!/^[a-z][a-z0-9+.-]*$/.test(protocol)) continue;

      if (remove) {
        entries.delete(protocol);
      } else {
        entries.set(protocol, {
          protocol,
          source: path.basename(file)
        });
      }
    }
  }

  return [...entries.values()].sort((a, b) => a.protocol.localeCompare(b.protocol));
}

export async function discoverEntityReplacements(files) {
  const entries = new Map();
  let nextOrder = 0;

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) continue;

      const token = match[1];
      const existing = entries.get(token);
      entries.set(token, {
        token,
        replacement: match[2],
        order: existing?.order ?? nextOrder,
        source: path.basename(file)
      });

      if (!existing) nextOrder += 1;
    }
  }

  return [...entries.values()].sort((a, b) => a.order - b.order);
}

export async function discoverSmileyMappings(files) {
  const entries = new Map();

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^(\S+)\s+(\S+)$/);
      if (!match) continue;

      entries.set(match[1], {
        token: match[1],
        filename: match[2],
        source: path.basename(file)
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.token.localeCompare(b.token));
}

export async function discoverAcronymMappings(files) {
  const entries = new Map();

  for (const file of files) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) continue;

      entries.set(match[1], {
        acronym: match[1],
        title: match[2],
        source: path.basename(file)
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.acronym.localeCompare(b.acronym));
}

function decodeConfigEntities(value) {
  return value.replaceAll("&amp;", "&");
}

function parsePhpSerialized(content) {
  const parser = new PhpSerializedParser(Buffer.isBuffer(content) ? content : Buffer.from(content));
  return parser.parse();
}

class PhpSerializedParser {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  parse() {
    const value = this.parseValue();
    this.skipWhitespace();

    if (this.offset !== this.buffer.length) {
      throw new Error(`Unexpected trailing PHP serialized data at byte ${this.offset}`);
    }

    return value;
  }

  parseValue() {
    const type = this.readAscii(1);

    if (type === "N") {
      this.expect(";");
      return null;
    }

    this.expect(":");

    if (type === "b") {
      const value = this.readUntil(";");
      return value === "1";
    }

    if (type === "i") {
      return Number.parseInt(this.readUntil(";"), 10);
    }

    if (type === "d") {
      return Number.parseFloat(this.readUntil(";"));
    }

    if (type === "s") {
      const length = Number.parseInt(this.readUntil(":"), 10);
      this.expect('"');
      const value = this.buffer.subarray(this.offset, this.offset + length).toString("utf8");
      this.offset += length;
      this.expect('"');
      this.expect(";");
      return value;
    }

    if (type === "a") {
      const count = Number.parseInt(this.readUntil(":"), 10);
      this.expect("{");
      const entries = [];

      for (let index = 0; index < count; index += 1) {
        entries.push([this.parseValue(), this.parseValue()]);
      }

      this.expect("}");
      return phpArrayToJs(entries);
    }

    throw new Error(`Unsupported PHP serialized type '${type}' at byte ${this.offset - 2}`);
  }

  readUntil(delimiter) {
    const start = this.offset;
    const delimiterCode = delimiter.charCodeAt(0);

    while (this.offset < this.buffer.length && this.buffer[this.offset] !== delimiterCode) {
      this.offset += 1;
    }

    if (this.offset >= this.buffer.length) {
      throw new Error(`Missing '${delimiter}' in PHP serialized data`);
    }

    const value = this.buffer.subarray(start, this.offset).toString("ascii");
    this.offset += 1;
    return value;
  }

  readAscii(length) {
    const value = this.buffer.subarray(this.offset, this.offset + length).toString("ascii");
    this.offset += length;
    return value;
  }

  expect(value) {
    const actual = this.readAscii(value.length);
    if (actual !== value) {
      throw new Error(
        `Expected '${value}' at byte ${this.offset - value.length}, received '${actual}'`
      );
    }
  }

  skipWhitespace() {
    while (
      this.offset < this.buffer.length &&
      /\s/.test(String.fromCharCode(this.buffer[this.offset]))
    ) {
      this.offset += 1;
    }
  }
}

function phpArrayToJs(entries) {
  const isList = entries.every(([key], index) => key === index);

  if (isList) {
    return entries.map(([, value]) => value);
  }

  return Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
}

export async function discoverWordblockPatterns(file) {
  const text = await readTextIfExists(file);
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((pattern, index) => ({
      id: `wordblock:${index + 1}`,
      pattern
    }));
}

async function walkFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readMaybeCompressed(file, compression) {
  const content = await fs.readFile(file);
  if (compression === "gz") return gunzipAsync(content);
  if (compression === "bz2") {
    return bunzip2Async(content);
  }
  return content;
}

async function bunzip2Async(content) {
  return new Promise((resolve, reject) => {
    const child = spawn("bzip2", ["-dc"], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      reject(new Error(`Unable to run bzip2 for compressed attic import: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(
          new Error(
            `Unable to decompress bzip2 attic revision: ${Buffer.concat(stderr).toString().trim()}`
          )
        );
      }
    });

    child.stdin.end(content);
  });
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function fileToPageId(root, file, extension, options = {}) {
  const relative = path.relative(root, file).slice(0, -extension.length);
  return pathWithoutExtensionToId(relative, options);
}

function pathWithoutExtensionToId(relative, options = {}) {
  return decodeDokuWikiFileName(relative.split(path.sep).join("/"), options.fnencode)
    .replaceAll("/", ":")
    .toLowerCase();
}

function parseMediaRevisionPath(relative, options = {}) {
  const id = pathWithoutExtensionToId(relative, options);
  const match = id.match(/^(.*)\.([0-9]{10,})\.([^.]+)$/);
  if (!match) {
    return {
      mediaId: id,
      revision: "current"
    };
  }

  return {
    mediaId: `${match[1]}.${match[3]}`,
    revision: match[2]
  };
}

function importedFileNameEncoding(configSettings) {
  const setting = configSettings.find((entry) => entry.key === "fnencode");
  return normalizeFileNameEncoding(setting?.value);
}

function importedLanguage(configSettings) {
  const setting = configSettings.find((entry) => entry.key === "lang");
  return normalizeLanguage(setting?.value || "en") || "en";
}

function normalizeLanguage(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFileNameEncoding(value) {
  return value === "safe" || value === "utf-8" ? value : "url";
}

function decodeDokuWikiFileName(filename, fnencode = "url") {
  if (fnencode === "utf-8") return filename;
  if (fnencode === "safe") return decodeSafeFileName(filename);

  try {
    return decodeURIComponent(filename.replace(/\+/g, "%20"));
  } catch {
    return filename;
  }
}

function decodeSafeFileName(filename) {
  const safe = filename.toLowerCase();
  let decoded = "";
  let converted = false;

  for (let index = 0; index < safe.length; ) {
    const char = safe[index];

    if (char === "%") {
      let end = index + 1;
      while (end < safe.length && safe[end] !== "%" && safe[end] !== "]") {
        end += 1;
      }

      if (end === index + 1) {
        decoded += "%";
      } else {
        const codepoint = 32 + Number.parseInt(safe.slice(index + 1, end), 36);
        decoded += String.fromCodePoint(codepoint);
      }
      converted = true;
      index = end;
      continue;
    }

    if (converted && char === "]") {
      converted = false;
      index += 1;
      continue;
    }

    decoded += char;
    converted = false;
    index += 1;
  }

  return decoded;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function extractTitle(content) {
  const match = content.match(/^(={2,6})\s*(.*?)\s*\1\s*$/m);
  return match?.[2]?.trim() || null;
}

const SEARCH_MIN_WORD_BYTES = 2;
const DOKUWIKI_SPECIAL_CHARS_PATTERN = /[^\p{L}\p{N}\p{M} ]+/gu;
const SEARCH_CORE_CHAR_PATTERN = /[\p{L}\p{N}]/u;
const ASIAN_WORD_PATTERN =
  /([\p{Script=Thai}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\u2e80-\u2eff\u3000-\u303f\u31f0-\u31ff\u3200-\u33ff\ufe30-\ufe4f])/gu;
const utf8Encoder = new TextEncoder();
const stopWordSetCache = new Map();

function buildSearchTermFrequencies(content, title, stopWords, pageId) {
  const terms = new Map();
  addTerms(terms, tokenizeSearchText(stripWikiSyntaxForSearch(content), stopWords), 1);

  if (title) {
    addTerms(terms, tokenizeSearchText(title, stopWords), 3);
  }

  if (pageId) {
    addTerms(terms, tokenizeSearchText(pageId.replace(/[:/_-]+/g, " "), stopWords), 2);
  }

  return terms;
}

function tokenizeSearchText(text, stopWords) {
  return prepareSearchText(text)
    .split(" ")
    .map((term) => term.toLowerCase())
    .filter((term) => isSearchToken(term) && !stopWords.has(term));
}

function stripWikiSyntaxForSearch(content) {
  return content
    .replace(/^={2,6}\s*(.*?)\s*={2,6}$/gm, "$1")
    .replace(/\[\[[^\]|]+?\|([^\]]+?)\]\]/g, "$1")
    .replace(/\[\[([^\]]+?)\]\]/g, "$1")
    .replace(/\{\{[^|}]+?\|([^}]+?)\}\}/g, "$1")
    .replace(/\{\{([^}]+?)\}\}/g, "$1")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<file[\s\S]*?<\/file>/gi, " ")
    .replace(/%%[\s\S]*?%%/g, " ")
    .replace(/[=*_/`~[\]{}|<>#]/g, " ");
}

function addTerms(target, terms, weight) {
  for (const term of terms) {
    target.set(term, (target.get(term) ?? 0) + weight);
  }
}

function stopWordsForLanguage(language) {
  const normalized = normalizeLanguage(language || "en") || "en";
  const key = Object.hasOwn(STOP_WORDS_BY_LANGUAGE, normalized) ? normalized : null;
  const cacheKey = key ?? `empty:${normalized}`;
  const cached = stopWordSetCache.get(cacheKey);
  if (cached) return cached;

  const words = new Set(key ? STOP_WORDS_BY_LANGUAGE[key] : []);
  stopWordSetCache.set(cacheKey, words);
  return words;
}

function prepareSearchText(text) {
  return separateAsianWords(text.normalize("NFC"))
    .replace(/[\r\n\t]/g, " ")
    .replace(/\u00ad/g, "")
    .replace(DOKUWIKI_SPECIAL_CHARS_PATTERN, " ");
}

function separateAsianWords(text) {
  return text.replace(ASIAN_WORD_PATTERN, " $1 ");
}

function isSearchToken(term) {
  if (!term || !SEARCH_CORE_CHAR_PATTERN.test(term)) return false;
  if (isNumericSearchToken(term)) return true;
  return utf8Encoder.encode(term).length >= SEARCH_MIN_WORD_BYTES;
}

function isNumericSearchToken(term) {
  if (term.trim() === "") return false;
  return Number.isFinite(Number(term));
}

function searchIndexWordLength(term) {
  const bytes = utf8Encoder.encode(term);
  let length = bytes.length;

  for (const byte of bytes) {
    if (byte >= 0xe2 && byte <= 0xef) {
      length += byte - 0xe1;
    }
  }

  return length;
}

function sql(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(argv) {
  const args = {
    source: "../dokuwiki",
    dryRun: false,
    sqlOut: "",
    mediaManifestOut: "",
    hashManifestOut: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = argv[++index];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--sql-out") {
      args.sqlOut = argv[++index];
    } else if (arg === "--media-manifest-out") {
      args.mediaManifestOut = argv[++index];
    } else if (arg === "--hash-manifest-out") {
      args.hashManifestOut = argv[++index];
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await buildImportPlan(args.source);
  logMigrationEvent("plan_built", {
    source: path.resolve(args.source),
    counts: plan.counts
  });

  if (args.sqlOut) {
    await writePageImportSql(plan, args.sqlOut);
    logMigrationEvent("sql_written", { output: args.sqlOut });
  }

  if (args.mediaManifestOut) {
    await writeMediaManifest(plan, args.mediaManifestOut);
    logMigrationEvent("media_manifest_written", { output: args.mediaManifestOut });
  }

  if (args.hashManifestOut) {
    await writeHashManifest(plan, args.hashManifestOut);
    logMigrationEvent("hash_manifest_written", { output: args.hashManifestOut });
  }

  console.log(JSON.stringify(plan, null, 2));

  if (!args.dryRun) {
    process.exitCode = 2;
    console.error("Only --dry-run mode is implemented in the import planner so far.");
  }
}

function logMigrationEvent(migrationEvent, details) {
  console.error(
    JSON.stringify({
      level: "info",
      event: "migration_event",
      migrationEvent,
      ...details
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
