import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export function offlinePlugin() {
  return {
    name: 'health-offline-shell',
    async generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(name => !name.endsWith('.map'));
      const version = createHash('sha256').update(files.map(name => {
        const file = bundle[name];
        return file.type === 'chunk' ? file.code : String(file.source);
      }).join('\n')).digest('hex').slice(0, 16);
      const template = await readFile(new URL('./worker-template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(['/', ...files.map(name => '/' + name), '/icon.svg', '/manifest.webmanifest'])) });
    },
  };
}
