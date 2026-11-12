/** Kind of the stub service created for a host reached through this protocol. */
export function kindForProtocol(protocol: string): string {
  if (protocol === 'sql' || protocol === 'mongodb' || protocol === 'redis') return 'database';
  if (protocol === 'logs') return 'logs';
  return 'external';
}

/** Product name from a provider name (`providerName` in Web.config) or a connection string shape. */
export function providerFrom(providerName: string | undefined, connection: string): string | undefined {
  const p = providerName ?? '';
  if (/sqlclient|sqlserver/i.test(p)) return 'SQL Server';
  if (/npgsql|postgres/i.test(p)) return 'PostgreSQL';
  if (/mysql|mariadb/i.test(p)) return 'MySQL';
  if (/oracle/i.test(p)) return 'Oracle';
  if (/mongo/i.test(p)) return 'MongoDB';
  if (/redis/i.test(p)) return 'Redis';
  if (/^\s*mongodb(\+srv)?:/i.test(connection)) return 'MongoDB';
  if (/^\s*rediss?:/i.test(connection)) return 'Redis';
  if (/^\s*(jdbc:)?postgres(ql)?:/i.test(connection)) return 'PostgreSQL';
  if (/^\s*(jdbc:)?mysql:/i.test(connection)) return 'MySQL';
  if (/^\s*(jdbc:)?(sqlserver|microsoft:sqlserver):/i.test(connection)) return 'SQL Server';
  if (/^\s*[\w.-]+(:\d+)?\s*,\s*(password|ssl|abortconnect|defaultdatabase)\s*=/i.test(connection)) return 'Redis';
  if (/\(DESCRIPTION\s*=|\(ADDRESS\s*=/i.test(connection)) return 'Oracle';
  if (/(^|;)\s*host\s*=/i.test(connection) && /(^|;)\s*(username|user id)\s*=/i.test(connection)) return 'PostgreSQL';
  if (/(^|;)\s*(initial catalog|integrated security|trusted_connection|multipleactiveresultsets)\s*=/i.test(connection)) return 'SQL Server';
  return undefined;
}

export function protocolForProvider(provider: string | undefined): string {
  if (provider === 'MongoDB') return 'mongodb';
  if (provider === 'Redis') return 'redis';
  return 'sql';
}
