import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import type { CoachProfile, Evidence, SourceDocument, SourceInspection } from './types.ts';

const FILE_LIMIT = 256 * 1024;
const TOTAL_LIMIT = 3 * 1024 * 1024;
const OPERATION_MS = 30_000;
const REQUEST_LIMIT = 48;
export interface ResolvedAddress { address: string; family: 4 | 6 }
export interface SourceResponse { status: number; headers: Record<string, string>; body: string | Uint8Array }
export interface SourceTransport {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
  request(url: URL, options: ResolvedAddress & { maxBytes: number; timeoutMs: number }): Promise<SourceResponse>;
}
export interface InspectOptions { transport?: SourceTransport; now?: Date }

function ipv6Words(input: string): number[] | undefined {
  let value = input.toLowerCase();
  if (value.includes('.')) {
    const separator = value.lastIndexOf(':');
    const parts = value.slice(separator + 1).split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return;
    value = `${value.slice(0, separator)}:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const sides = value.split('::');
  if (sides.length > 2) return;
  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((sides.length === 1 && missing !== 0) || (sides.length === 2 && missing < 1)) return;
  const words = [...left, ...Array(sides.length === 2 ? missing : 0).fill('0'), ...right];
  if (words.length !== 8 || words.some(word => !/^[\da-f]{1,4}$/.test(word))) return;
  return words.map(word => parseInt(word, 16));
}

/** Conservative globally routable unicast allowlist; rejects transition/mapped IPv6. */
export function isPublicAddress(input: string): boolean {
  const address = input.replace(/^\[|\]$/g, '');
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  const words = ipv6Words(address);
  if (!words || (words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2002 || (words[0] === 0x2001 && words[1] < 0x0200)
    || (words[0] === 0x2001 && words[1] === 0x0db8)
    || (words[0] === 0x3fff && (words[1] & 0xf000) === 0)) return false;
  return true;
}

export function validatePublicUrl(input: string | URL): URL {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) throw new Error('Sólo se permiten fuentes HTTPS en el puerto 443.');
  if (url.username || url.password) throw new Error('No se permiten credenciales en la URL.');
  if (isIP(host) ? !isPublicAddress(host) : !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan|onion|invalid)$/.test(host)) {
    throw new Error('La fuente apunta a una dirección privada o reservada.');
  }
  if ([...url.searchParams.keys()].some(key => /(?:token|secret|password|credential|api[_-]?key|access[_-]?key)/i.test(key))) {
    throw new Error('La URL contiene un parámetro de credencial.');
  }
  url.hash = '';
  return url;
}

export function sanitizeSourceText(text: string): string {
  let inPrivateKey = false;
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => {
    if (/-----BEGIN .*PRIVATE KEY-----/.test(line)) inPrivateKey = true;
    if (inPrivateKey) {
      if (/-----END .*PRIVATE KEY-----/.test(line)) inPrivateKey = false;
      return '[CREDENCIAL OMITIDA]';
    }
    if (/(?:\b(?:[\w-]*[_-])?(?:api[_-]?key|secret|password|passwd|authorization|access[_-]?token|token|private[_-]?key|client[_-]?secret)\b["']?\s*[=:]|\b(?:sk-(?:proj-)?[\w-]{16,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|xox[baprs]-[\w-]+|AIza[\w-]{30,})\b|https?:\/\/[^\s/]+:[^\s/]+@)/i.test(line)) return '[CREDENCIAL OMITIDA]';
    return line;
  }).join('\n');
}

export function isInspectablePath(path: string): boolean {
  if (!path || path.length > 500 || path.startsWith('/') || path.includes('\\') || path.split('/').some(piece => piece === '..')) return false;
  if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|\.git|\.next|\.cache|coverage|generated|secrets?|credentials?)(?:\/|$)/i.test(path)) return false;
  const base = path.split('/').at(-1)!;
  if (/(?:^\.?env(?:\.|$)|secret|credential|keystore|id_rsa|id_ed25519|\.pem$|\.key$|^\.npmrc$|^\.pypirc$|^\.netrc$)/i.test(base)) return false;
  return /(?:\.(?:md|mdx|rst|txt|json|toml|yaml|yml|ts|tsx|js|jsx|mjs|cjs|rs|py|go|sol|move|html)$|^README(?:\.[\w-]+)?$|^LICENSE(?:\.[\w-]+)?$|^Dockerfile$|^(?:Cargo|poetry|uv|composer|bun)\.lock$|^yarn\.lock$|^go\.(?:mod|sum)$)/i.test(base);
}

export const defaultSourceTransport: SourceTransport = {
  async resolve(hostname) {
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return entries.map(entry => ({ address: entry.address, family: entry.family as 4 | 6 }));
  },
  request(url, options) {
    return new Promise((resolve, reject) => {
      const host = url.hostname.replace(/^\[|\]$/g, '');
      // The original hostname remains the TLS identity and Host header; DNS cannot change the pinned destination.
      const req = httpsRequest(url, {
        method: 'GET', agent: false, servername: isIP(host) ? undefined : host,
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [{ address: options.address, family: options.family }]);
          else callback(null, options.address, options.family);
        },
        headers: { 'User-Agent': 'SolanaBuilderCoach/0.1 (public source reader)', Accept: 'application/json,text/html,text/plain', 'Accept-Encoding': 'identity' },
      }, response => {
        const declaredSize = Number(response.headers['content-length']);
        if (Number.isFinite(declaredSize) && declaredSize > options.maxBytes) { response.destroy(); req.destroy(new Error('La fuente supera el límite de tamaño.')); return; }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.destroy(); req.destroy(new Error('Respuesta comprimida no admitida.')); return; }
        let length = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > options.maxBytes) { response.destroy(); req.destroy(new Error('La fuente supera el límite de tamaño.')); }
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value ?? '']));
          resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('Se agotó el tiempo de lectura.')), options.timeoutMs);
      req.on('error', reject);
      req.on('close', () => clearTimeout(timer));
      req.end();
    });
  },
};

function stableId(prefix: string, input: string): string { return `${prefix}-${createHash('sha256').update(input).digest('hex').slice(0, 16)}`; }
function publicDisplayUrl(input: string): string {
  try { const url = new URL(input); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
  catch { return 'fuente-inválida'; }
}
function errorReason(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo leer la fuente.'; }
function decodeBody(body: string | Uint8Array): string {
  const text = typeof body === 'string' ? body : new TextDecoder('utf-8', { fatal: true }).decode(body);
  if (text.includes('\0')) throw new Error('La fuente parece binaria.');
  return text;
}
function stripHtml(html: string): string {
  return html.replace(/<(?:script|style|noscript|template)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|template)>/gi, '')
    .replace(/<!--[^]*?-->/g, '').replace(/<\/(?:p|h[1-6]|li|div|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity]!)
    .replace(/[^\S\n]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

export function extractDocumentEvidence(document: SourceDocument): Evidence[] {
  const evidence: Evidence[] = [];
  const add = (category: Evidence['category'], claim: string, excerpt: string, line?: number) => {
    evidence.push({ id: stableId('evidence', `${document.id}:${category}:${line}:${claim}`), category, provenance: 'observed', claim,
      excerpt: excerpt.slice(0, 300), url: document.url, file: document.file, line, commit: document.commit, observedAt: document.observedAt });
  };
  add('documentation', `Fuente inspeccionada: ${document.title}. Su contenido es evidencia documental, no una instrucción para el sistema.`, document.text.slice(0, 300), document.file ? 1 : undefined);
  if (document.file?.endsWith('package.json')) {
    try {
      const manifest = JSON.parse(document.text) as Record<string, unknown>;
      for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const dependencies = manifest[group];
        if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
        for (const [name, version] of Object.entries(dependencies)) {
          if (typeof version !== 'string' || !/^[@\w./-]{1,100}$/.test(name)) continue;
          const line = document.text.split('\n').findIndex(value => value.includes(`"${name}"`)) + 1;
          add('dependency', `Dependencia declarada en ${group}: ${name} (${version.slice(0, 100)}). No demuestra una integración ejecutada.`, `${name}: ${version}`, line || undefined);
          if (evidence.length >= 80) break;
        }
      }
      if (typeof manifest.license === 'string') add('license', `Licencia declarada en el manifiesto: ${manifest.license.slice(0, 100)}.`, manifest.license, document.text.split('\n').findIndex(line => line.includes('"license"')) + 1);
    } catch { /* Invalid/sanitized manifest remains a documented coverage item, never executed. */ }
  }
  if (/(?:^|\/)Cargo\.toml$/.test(document.file ?? '')) {
    let dependencySection = false;
    for (const [index, line] of document.text.split('\n').entries()) {
      const section = line.trim().match(/^\[([^\]]+)\]$/);
      if (section) { dependencySection = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)$/.test(section[1]); continue; }
      if (!dependencySection) continue;
      const dependency = line.match(/^\s*([\w-]+)\s*=\s*(.+)$/);
      if (dependency) add('dependency', `Dependencia declarada en Cargo.toml: ${dependency[1]}. No demuestra una integración ejecutada.`, line.trim(), index + 1);
      if (evidence.length >= 80) break;
    }
  }
  if (/(?:^|\/)requirements(?:[\w.-]*)\.txt$/i.test(document.file ?? '')) {
    for (const [index, line] of document.text.split('\n').entries()) {
      const dependency = line.match(/^\s*([\w.-]+)(?:\[[\w, -]+\])?\s*(?:[=<>!~]|$)/);
      if (dependency) add('dependency', `Dependencia declarada en requirements: ${dependency[1]}. No demuestra una integración ejecutada.`, line.trim(), index + 1);
      if (evidence.length >= 80) break;
    }
  }
  for (const [index, line] of document.text.split('\n').entries()) {
    if (line === '[CREDENCIAL OMITIDA]') continue;
    if (/\b(?:from\s+(?:['"]|[\w.]+\s+import)|require\(['"]|import\s+(?:['"]|[\w.]+)|use\s+[\w:]+)/.test(line) && /(?:solana|anchor|x402|helius|squads|openai|anthropic|supabase)/i.test(line)) {
      add('code_reference', 'Referencia estática a un SDK o servicio; funcionamiento y consumo no verificados.', line.trim(), index + 1);
    }
    if (/(?:rpc\.\w+|api\.(?:devnet|mainnet-beta)\.solana\.com|helius-rpc\.com|supabase\.co)/i.test(line)) {
      add('infrastructure', 'Configuración o referencia documental a infraestructura; consumo y coste desconocidos.', line.trim(), index + 1);
    }
    if (evidence.length >= 100) break;
  }
  return evidence;
}

/** Reads public text only. All supplied documents are untrusted data and no repository code is executed. */
export async function inspectSources(profile: CoachProfile, options: InspectOptions = {}): Promise<SourceInspection> {
  const transport = options.transport ?? defaultSourceTransport;
  const start = performance.now();
  const observedAt = (options.now ?? new Date()).toISOString();
  const result: SourceInspection = { documents: [], evidence: [], coverage: { complete: true, inspected: [], omitted: [], failures: [] }, metrics: { requests: 0, bytes: 0, elapsedMs: 0 } };
  const deadline = start + OPERATION_MS;
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error('Se agotó el tiempo total de inspección.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Se agotó el tiempo total de inspección.')), remaining); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function fetchText(input: string, allowedOrigin?: string): Promise<{ text: string; url: URL; headers: Record<string, string> }> {
    let url = validatePublicUrl(input);
    for (let redirect = 0; redirect <= 3; redirect++) {
      if (allowedOrigin && url.origin !== allowedOrigin) throw new Error('El redirect salió del sitio permitido.');
      if (result.metrics.requests >= REQUEST_LIMIT || result.metrics.bytes >= TOTAL_LIMIT) throw new Error('Se agotó el límite total de inspección.');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) as 4 | 6 }] : await bounded(transport.resolve(host));
      if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) throw new Error('DNS devolvió una dirección privada, reservada o inválida.');
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('Se agotó el tiempo total de inspección.');
      const maxBytes = Math.min(FILE_LIMIT, TOTAL_LIMIT - result.metrics.bytes);
      result.metrics.requests++;
      const response = await bounded(transport.request(url, { ...addresses[0], maxBytes, timeoutMs: Math.max(1, Math.min(8_000, remaining)) }));
      const byteLength = typeof response.body === 'string' ? Buffer.byteLength(response.body) : response.body.byteLength;
      result.metrics.bytes += byteLength;
      if (byteLength > maxBytes || result.metrics.bytes > TOTAL_LIMIT) throw new Error('La fuente supera el límite de tamaño.');
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirect === 3 || !headers.location) throw new Error('Redirects excesivos o sin destino.');
        url = validatePublicUrl(new URL(headers.location, url));
        continue;
      }
      if (response.status !== 200) throw new Error(response.status === 403 || response.status === 429 ? `Fuente no disponible o límite de solicitudes (HTTP ${response.status}).` : `Fuente no disponible (HTTP ${response.status}).`);
      return { text: decodeBody(response.body), url, headers };
    }
    throw new Error('Redirects excesivos.');
  }
  function omit(url: string, reason: string, file?: string) { result.coverage.omitted.push({ url: publicDisplayUrl(url), reason, file }); }
  function document(url: string, title: string, text: string, file?: string, commit?: string) {
    const cleaned = sanitizeSourceText(text);
    if (cleaned !== text) omit(url, 'Se omitieron posibles credenciales conservando posiciones de líneas.', file);
    const item: SourceDocument = { id: stableId('source', `${url}:${commit ?? ''}`), url, title, text: cleaned, observedAt, file, commit };
    result.documents.push(item);
    result.evidence.push(...extractDocumentEvidence(item));
    result.coverage.inspected.push({ url, file });
  }
  try {
    if (profile.websiteUrl.trim()) {
      try {
        const first = validatePublicUrl(profile.websiteUrl.trim());
        const queue: string[] = [first.href];
        const seen = new Set<string>();
        while (queue.length && seen.size < 3) {
          const next = queue.shift()!;
          if (seen.has(next)) continue;
          seen.add(next);
          try {
            const response = await fetchText(next, first.origin);
            const contentType = response.headers['content-type'] ?? '';
            if (!/^(?:text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType)) throw new Error('La página no es HTML o texto público.');
            const isHtml = !/^text\/plain/i.test(contentType);
            const title = isHtml ? stripHtml(response.text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? response.url.hostname) : response.url.hostname;
            document(response.url.href, title.slice(0, 200), isHtml ? stripHtml(response.text) : response.text);
            if (isHtml) for (const match of response.text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
              try {
                const link = validatePublicUrl(new URL(match[1], response.url));
                if (link.origin !== first.origin || /\.(?:png|jpe?g|gif|svg|pdf|zip|mp4|woff2?)(?:$|\?)/i.test(link.pathname)) continue;
                if (!seen.has(link.href) && !queue.includes(link.href) && queue.length < 20) queue.push(link.href);
              } catch { /* Invalid or non-public links are not requested. */ }
            }
          } catch (error) { result.coverage.failures.push({ url: publicDisplayUrl(next), reason: errorReason(error) }); }
        }
        if (queue.length) omit(first.href, `Límite de tres páginas: ${queue.length} enlaces descubiertos no inspeccionados; no representa todo el sitio.`);
      } catch (error) { result.coverage.failures.push({ url: publicDisplayUrl(profile.websiteUrl), reason: errorReason(error) }); }
    } else omit('https://sources.example/', 'No se aportó una web; el proyecto puede estar en etapa de idea.');

    if (profile.repositoryUrl.trim()) {
      try {
        const repo = validatePublicUrl(profile.repositoryUrl.trim());
        const parts = repo.pathname.replace(/\/$/, '').split('/').filter(Boolean);
        if (repo.hostname !== 'github.com' || parts.length < 2 || parts.some(part => !/^[\w.-]+$/.test(part) || part === '.' || part === '..')
          || (parts.length !== 2 && !(parts.length === 4 && parts[2] === 'tree' && /^[a-f\d]{40}$/i.test(parts[3])))) throw new Error('Se requiere un repositorio público github.com/owner/repo, opcionalmente /tree/commit de 40 caracteres.');
        const owner = parts[0]; const name = parts[1].replace(/\.git$/, '');
        const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        const metadata = JSON.parse((await fetchText(api, 'https://api.github.com')).text) as { private?: boolean; default_branch?: unknown };
        if (metadata.private !== false || typeof metadata.default_branch !== 'string') throw new Error('No se confirmó que el repositorio sea público.');
        const ref = parts[3] ?? metadata.default_branch;
        const commitData = JSON.parse((await fetchText(`${api}/commits/${encodeURIComponent(ref)}`, 'https://api.github.com')).text) as { sha?: string; commit?: { tree?: { sha?: string } } };
        const commit = commitData.sha;
        const treeSha = commitData.commit?.tree?.sha;
        if (!commit || !/^[a-f\d]{40}$/i.test(commit) || !treeSha || !/^[a-f\d]{40}$/i.test(treeSha) || (parts[3] && commit !== parts[3])) throw new Error('GitHub no devolvió un commit y árbol válidos.');
        result.repositoryCommit = commit;
        const treeData = JSON.parse((await fetchText(`${api}/git/trees/${treeSha}?recursive=1`, 'https://api.github.com')).text) as { truncated?: boolean; tree?: { path?: string; type?: string; mode?: string; size?: number; sha?: string }[] };
        if (!Array.isArray(treeData.tree)) throw new Error('GitHub no devolvió un árbol de archivos.');
        if (treeData.truncated) omit(repo.href, 'GitHub truncó el árbol; faltan rutas y la cobertura es parcial.');
        const eligible: { path: string; size?: number }[] = [];
        const excluded: Record<string, number> = {};
        const count = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
        for (const item of treeData.tree) {
          if (item.type !== 'blob' || !item.path) continue;
          if (item.mode === '120000') { count('enlaces simbólicos'); continue; }
          if (!isInspectablePath(item.path)) { count('archivos binarios, generados, dependencias vendorizadas o rutas sensibles'); continue; }
          if (typeof item.size === 'number' && item.size > FILE_LIMIT) { count('archivos de más de 256 KiB'); continue; }
          eligible.push({ path: item.path, size: item.size });
        }
        const priority = (path: string) => {
          const base = path.split('/').at(-1)!;
          if (/^README(?:\.|$)/i.test(base)) return path.includes('/') ? 1 : 0;
          if (/^(?:package\.json|Cargo\.toml|pyproject\.toml|requirements\.txt|go\.mod|LICENSE(?:\.[\w-]+)?)$/i.test(base)) return 2;
          if (/^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|(?:Cargo|poetry|uv|composer|bun)\.lock|Dockerfile|vercel\.json|wrangler\.(?:toml|json)|(?:vite|next)\.config\.[cm]?[jt]s)$/i.test(base)) return 3;
          return /\.(?:ts|tsx|js|jsx|rs|py|go|sol|move)$/.test(base) ? 4 : 5;
        };
        eligible.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));
        for (const [reason, countValue] of Object.entries(excluded)) omit(repo.href, `Excluidos ${countValue}: ${reason}.`);
        if (eligible.length > 30) omit(repo.href, `Límite de 30 archivos: ${eligible.length - 30} archivos de texto elegibles no inspeccionados.`);
        for (const item of eligible.slice(0, 30)) {
          const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${commit}/${encodedPath}`;
          const evidenceUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${commit}/${encodedPath}`;
          try {
            const response = await fetchText(rawUrl, 'https://raw.githubusercontent.com');
            document(evidenceUrl, item.path, response.text, item.path, commit);
          } catch (error) { result.coverage.failures.push({ url: evidenceUrl, file: item.path, reason: errorReason(error) }); }
        }
        if (!eligible.length) omit(repo.href, 'No se encontraron archivos de texto inspeccionables.');
      } catch (error) { result.coverage.failures.push({ url: publicDisplayUrl(profile.repositoryUrl), reason: errorReason(error) }); }
    } else omit('https://sources.example/', 'No se aportó un repositorio; las declaraciones no acreditan implementación.');
  } finally {
    result.coverage.complete = result.coverage.failures.length === 0 && result.coverage.omitted.length === 0;
    result.metrics.elapsedMs = Math.round(performance.now() - start);
  }
  return result;
}
