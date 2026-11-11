export type KindShape = 'circle' | 'square' | 'diamond' | 'hexagon';

export interface KindDef {
  label: string;
  color: string;
  icon?: string;
  shape?: KindShape;
}

/** Fallback color for kinds declared without one. */
export const FALLBACK_KIND_COLOR = '#94a3b8';

/** Built-in service kinds. Colors are tuned for a dark background. */
export const DEFAULT_KINDS: Record<string, KindDef> = {
  bff: { label: 'BFF', color: '#38bdf8', shape: 'circle' },
  core: { label: 'Core API', color: '#34d399', shape: 'circle' },
  web: { label: 'Web', color: '#f472b6', shape: 'circle' },
  worker: { label: 'Worker', color: '#818cf8', shape: 'square' },
  webservice: { label: 'Webservice (SOAP)', color: '#2dd4bf', shape: 'diamond' },
  websocket: { label: 'WebSocket', color: '#a3e635', shape: 'circle' },
  grpc: { label: 'gRPC', color: '#22d3ee', shape: 'diamond' },
  graphql: { label: 'GraphQL', color: '#e879f9', shape: 'diamond' },
  queue: { label: 'Queue / Broker', color: '#fb923c', shape: 'hexagon' },
  database: { label: 'Database', color: '#60a5fa', shape: 'hexagon' },
  ftp: { label: 'FTP', color: '#c084fc', shape: 'square' },
  logs: { label: 'Logs', color: '#f87171', shape: 'square' },
  external: { label: 'External service', color: '#facc15', shape: 'circle' },
  legacy: { label: 'Legacy app', color: '#a8a29e', shape: 'square' },
};
