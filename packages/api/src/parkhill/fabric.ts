import sql from 'mssql';
import { logger } from '@librechat/data-schemas';
import {
  AzureCliCredential,
  ChainedTokenCredential,
  ManagedIdentityCredential,
} from '@azure/identity';

import type { TokenCredential } from '@azure/identity';

import { getSafeErrorMetadata } from '~/utils/errors';

/** Official Parkhill project, as listed in the Fabric `project` table. */
export interface ParkhillProject {
  number: string;
  name: string;
}

export interface FabricConfig {
  server: string;
  database: string;
  table: string;
  cacheTtlMs: number;
  managedIdentityClientId?: string;
}

/** Loads the full active project list from wherever it lives. */
export interface ProjectSource {
  load(): Promise<ParkhillProject[]>;
}

export interface ProjectCatalog {
  getProjects(): Promise<ParkhillProject[]>;
  findProject(projectNumber: string): Promise<ParkhillProject | null>;
}

const DEFAULT_TABLE = 'DT_BRZ.project';
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const SQL_TOKEN_SCOPE = 'https://database.windows.net/.default';
/** Table names can't be parameterized, so only `schema.table` word characters are accepted. */
const TABLE_PATTERN = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/;

/**
 * Reads the Fabric connection from the environment. Returns `null` when
 * `FABRIC_SQL_SERVER` is unset, which turns the whole project feature off.
 */
export function getFabricConfig(env: NodeJS.ProcessEnv = process.env): FabricConfig | null {
  const server = env.FABRIC_SQL_SERVER?.trim();
  const database = env.FABRIC_SQL_DATABASE?.trim();
  if (!server || !database) {
    return null;
  }

  const table = env.FABRIC_PROJECTS_TABLE?.trim() || DEFAULT_TABLE;
  if (!TABLE_PATTERN.test(table)) {
    logger.error(
      '[parkhill] FABRIC_PROJECTS_TABLE must look like "schema.table"; feature disabled',
    );
    return null;
  }

  const ttl = Number(env.FABRIC_PROJECTS_CACHE_TTL_MS);
  return {
    server,
    database,
    table,
    cacheTtlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL_MS,
    managedIdentityClientId: env.FABRIC_MANAGED_IDENTITY_CLIENT_ID?.trim() || undefined,
  };
}

/** Sorts project numbers segment by segment, numerically where possible ("2.10" after "2.9"). */
export function compareProjectNumbers(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? '';
    const r = right[i] ?? '';
    const ln = Number(l);
    const rn = Number(r);
    const diff =
      l !== '' && r !== '' && Number.isFinite(ln) && Number.isFinite(rn)
        ? ln - rn
        : l.localeCompare(r);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * Explicit credential chain: managed identity in Azure, `az login` locally.
 * `DefaultAzureCredential` is avoided on purpose: stray `AZURE_CLIENT_*` env vars
 * would silently switch it to a different service principal.
 */
function createCredential(config: FabricConfig): TokenCredential {
  const managedIdentity = config.managedIdentityClientId
    ? new ManagedIdentityCredential({ clientId: config.managedIdentityClientId })
    : new ManagedIdentityCredential();
  return new ChainedTokenCredential(managedIdentity, new AzureCliCredential());
}

/** Read-only source backed by the Fabric Lakehouse SQL analytics endpoint. */
export function createFabricProjectSource(
  config: FabricConfig,
  credential: TokenCredential = createCredential(config),
): ProjectSource {
  const [, schema, table] = TABLE_PATTERN.exec(config.table) ?? [];
  const query = `
    SELECT RTRIM(CAST(WBS1 AS NVARCHAR(200))) AS number,
           RTRIM(CAST(Name AS NVARCHAR(400))) AS name
      FROM [${schema}].[${table}]
     WHERE Status = 'A' AND WBS2 = ' ' AND WBS3 = ' '`;

  return {
    async load() {
      const accessToken = await credential.getToken(SQL_TOKEN_SCOPE);
      if (!accessToken) {
        throw new Error('No access token for Fabric');
      }
      /** A fresh pool per load: queries are rare (cache TTL) and tokens expire hourly. */
      const pool = new sql.ConnectionPool({
        server: config.server,
        database: config.database,
        port: 1433,
        options: { encrypt: true },
        authentication: {
          type: 'azure-active-directory-access-token',
          options: { token: accessToken.token },
        },
        connectionTimeout: 30000,
        requestTimeout: 30000,
      });
      try {
        await pool.connect();
        const result = await pool.request().query<ParkhillProject>(query);
        return result.recordset
          .filter((row) => typeof row.number === 'string' && row.number.length > 0)
          .map((row) => ({ number: row.number, name: row.name ?? '' }))
          .sort((a, b) => compareProjectNumbers(a.number, b.number));
      } finally {
        await pool.close().catch(() => undefined);
      }
    },
  };
}

/**
 * In-memory cache over a project source. Concurrent callers share one load,
 * and an expired list keeps being served while a refresh runs or after it fails.
 */
export function createProjectCatalog(
  source: ProjectSource,
  ttlMs: number,
  now: () => number = Date.now,
): ProjectCatalog {
  let cache: {
    projects: ParkhillProject[];
    byNumber: Map<string, ParkhillProject>;
    at: number;
  } | null = null;
  let inflight: Promise<ParkhillProject[]> | null = null;

  const refresh = (): Promise<ParkhillProject[]> => {
    if (inflight) {
      return inflight;
    }
    inflight = source
      .load()
      .then((projects) => {
        cache = {
          projects,
          byNumber: new Map(projects.map((project) => [project.number, project])),
          at: now(),
        };
        return projects;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  async function getProjects(): Promise<ParkhillProject[]> {
    if (cache && now() - cache.at < ttlMs) {
      return cache.projects;
    }
    if (cache) {
      const stale = cache.projects;
      refresh().catch((error) => {
        logger.warn(
          '[parkhill] Project refresh failed; serving cached list',
          getSafeErrorMetadata(error),
        );
      });
      return stale;
    }
    return refresh();
  }

  async function findProject(projectNumber: string): Promise<ParkhillProject | null> {
    await getProjects();
    return cache?.byNumber.get(projectNumber) ?? null;
  }

  return { getProjects, findProject };
}
