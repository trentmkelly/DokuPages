export interface ImportedPluginEnablement {
  plugin: string;
  enabled: boolean;
  locked: boolean;
  source: string | null;
  layer: string | null;
  updatedAt: string | null;
}

export interface ImportedPluginEnablementSummary {
  total: number;
  enabled: number;
  disabled: number;
  locked: number;
}

export interface ImportedPluginEnablementSnapshot {
  sourceFiles: readonly string[];
  plugins: ImportedPluginEnablement[];
  summary: ImportedPluginEnablementSummary;
}

interface PluginSettingRow {
  plugin: string;
  value_json: string;
  updated_at: string;
}

export const PLUGIN_ENABLEMENT_SOURCE_FILES = [
  "conf/plugins.php",
  "conf/plugins.local.php",
  "conf/plugins.required.php"
] as const;

export async function readImportedPluginEnablement(
  db: D1Database
): Promise<ImportedPluginEnablementSnapshot> {
  const result = await db
    .prepare(
      `select plugin, value_json, updated_at
       from plugin_settings
       where key = 'enabled'
       order by plugin asc`
    )
    .all<PluginSettingRow>();
  const plugins = result.results.map(parsePluginEnablementRow);

  return {
    sourceFiles: PLUGIN_ENABLEMENT_SOURCE_FILES,
    plugins,
    summary: {
      total: plugins.length,
      enabled: plugins.filter((plugin) => plugin.enabled).length,
      disabled: plugins.filter((plugin) => !plugin.enabled).length,
      locked: plugins.filter((plugin) => plugin.locked).length
    }
  };
}

function parsePluginEnablementRow(row: PluginSettingRow): ImportedPluginEnablement {
  try {
    const parsed = JSON.parse(row.value_json) as Partial<ImportedPluginEnablement> | boolean;
    if (typeof parsed === "boolean") {
      return {
        plugin: row.plugin,
        enabled: parsed,
        locked: false,
        source: null,
        layer: null,
        updatedAt: row.updated_at
      };
    }

    return {
      plugin: String(parsed.plugin ?? row.plugin),
      enabled: Boolean(parsed.enabled),
      locked: Boolean(parsed.locked),
      source: typeof parsed.source === "string" ? parsed.source : null,
      layer: typeof parsed.layer === "string" ? parsed.layer : null,
      updatedAt: row.updated_at
    };
  } catch {
    return {
      plugin: row.plugin,
      enabled: false,
      locked: false,
      source: null,
      layer: null,
      updatedAt: row.updated_at
    };
  }
}
