import { describe, expect, it } from 'vitest';
import { deleteFileUrl, editFileUrl, MAX_URL_LENGTH, newFileUrl, repoFilePath } from '../src/propose/github.js';
import { serviceFromGraph } from '../src/propose/fromGraph.js';
import { edge, graph, node } from './fixture.js';

const target = { provider: 'github' as const, repo: 'acme/catalog', branch: 'main', path: 'map' };

describe('GitHub links', () => {
  it('joins the catalog path and the service file', () => {
    expect(repoFilePath(target, 'services/a.yaml')).toBe('map/services/a.yaml');
    expect(repoFilePath({ ...target, path: '' }, 'services/a.yaml')).toBe('services/a.yaml');
  });

  it('prefills new files', () => {
    const r = newFileUrl(target, 'services/new-api.yaml', 'id: new-api\nname: Novo "API"\n');
    expect(r.prefilled).toBe(true);
    const url = new URL(r.url);
    expect(url.origin + url.pathname).toBe('https://github.com/acme/catalog/new/main');
    expect(url.searchParams.get('filename')).toBe('map/services/new-api.yaml');
    expect(url.searchParams.get('value')).toBe('id: new-api\nname: Novo "API"\n');
  });

  it('drops the content when the link would be too long', () => {
    const r = newFileUrl(target, 'services/x.yaml', 'x'.repeat(MAX_URL_LENGTH));
    expect(r.prefilled).toBe(false);
    expect(new URL(r.url).searchParams.has('value')).toBe(false);
  });

  it('builds edit and delete links with encoded paths', () => {
    expect(editFileUrl(target, 'services/a b.yaml')).toBe('https://github.com/acme/catalog/edit/main/map/services/a%20b.yaml');
    expect(deleteFileUrl({ ...target, branch: 'release/2' }, 'services/a.yaml')).toBe('https://github.com/acme/catalog/delete/release/2/map/services/a.yaml');
  });
});

describe('serviceFromGraph', () => {
  it('rebuilds a service with its outgoing dependencies', () => {
    const g = graph(
      [node('a', { label: 'A', owner: 'team', hosts: ['a.internal'], tags: ['pii'], file: 'services/a.yaml' }), node('b')],
      [edge('a', 'b', { confidence: 'inferred', origin: 'agent', evidence: [{ file: 'x.cs', line: 3 }], note: 'n' }), edge('b', 'a', { id: 'b->a:http' })],
    );
    expect(serviceFromGraph(g, 'a')).toEqual({
      id: 'a', name: 'A', kind: 'core', owner: 'team', tech: [], hosts: ['a.internal'], tags: ['pii'], locked: false,
      dependsOn: [{ target: 'b', protocol: 'http', confidence: 'inferred', origin: 'agent', evidence: [{ file: 'x.cs', line: 3 }], note: 'n' }],
    });
  });
});
