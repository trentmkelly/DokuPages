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

export interface ImportedPluginConfigSetting {
  plugin: string;
  key: string;
  path: string[];
  value: unknown;
  rawValue: string | null;
  sensitive: boolean;
  source: string | null;
  layer: string | null;
  locked: boolean;
  updatedAt: string | null;
}

export interface ImportedPluginConfigSummary {
  total: number;
  plugins: number;
  locked: number;
}

export interface ImportedPluginEnablementSnapshot {
  sourceFiles: readonly string[];
  plugins: ImportedPluginEnablement[];
  summary: ImportedPluginEnablementSummary;
  configs: ImportedPluginConfigSetting[];
  configSummary: ImportedPluginConfigSummary;
}

interface PluginSettingRow {
  plugin: string;
  key: string;
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
  const [enablementResult, configResult] = await Promise.all([
    db
      .prepare(
        `select plugin, key, value_json, updated_at
       from plugin_settings
       where key = 'enabled'
       order by plugin asc`
      )
      .all<PluginSettingRow>(),
    db
      .prepare(
        `select plugin, key, value_json, updated_at
       from plugin_settings
       where key <> 'enabled'
       order by plugin asc, key asc`
      )
      .all<PluginSettingRow>()
  ]);
  const plugins = enablementResult.results.map(parsePluginEnablementRow);
  const configs = configResult.results
    .map(parsePluginConfigRow)
    .filter((setting): setting is ImportedPluginConfigSetting => Boolean(setting));

  return {
    sourceFiles: PLUGIN_ENABLEMENT_SOURCE_FILES,
    plugins,
    summary: {
      total: plugins.length,
      enabled: plugins.filter((plugin) => plugin.enabled).length,
      disabled: plugins.filter((plugin) => !plugin.enabled).length,
      locked: plugins.filter((plugin) => plugin.locked).length
    },
    configs,
    configSummary: {
      total: configs.length,
      plugins: new Set(configs.map((setting) => setting.plugin)).size,
      locked: configs.filter((setting) => setting.locked).length
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

function parsePluginConfigRow(row: PluginSettingRow): ImportedPluginConfigSetting | null {
  try {
    const parsed = JSON.parse(row.value_json) as Partial<ImportedPluginConfigSetting>;
    if (typeof parsed.source !== "string" && typeof parsed.layer !== "string") return null;
    const key = typeof parsed.key === "string" ? parsed.key : row.key;
    const sensitive = isSensitivePluginConfigKey(key);

    return {
      plugin: typeof parsed.plugin === "string" ? parsed.plugin : row.plugin,
      key,
      path: Array.isArray(parsed.path)
        ? parsed.path.filter((part): part is string => typeof part === "string")
        : [row.key],
      value: sensitive ? "[redacted]" : parsed.value,
      rawValue: sensitive ? null : typeof parsed.rawValue === "string" ? parsed.rawValue : null,
      sensitive,
      source: typeof parsed.source === "string" ? parsed.source : null,
      layer: typeof parsed.layer === "string" ? parsed.layer : null,
      locked: Boolean(parsed.locked),
      updatedAt: row.updated_at
    };
  } catch {
    return null;
  }
}

function isSensitivePluginConfigKey(key: string): boolean {
  return /(?:pass|password|secret|token|apikey|api_key|key|credential|bindpw)/i.test(key);
}
