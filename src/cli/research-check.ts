import { mkdir, readFile, writeFile } from 'node:fs/promises';

type JsonRecord = Record<string, unknown>;
type Check = { name: string; passed: boolean; detail: unknown };

const checks: Check[] = [];
const check = (name: string, passed: boolean, detail: unknown): void => {
  checks.push({ name, passed, detail });
};
const record = (value: unknown): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Se esperaba un objeto en el registro de investigación.');
  }
  return value as JsonRecord;
};
const records = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) throw new Error('Se esperaba una colección de oportunidades.');
  return value.map(record);
};
const normalizedHttpsUrl = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('URL ausente o con tipo incorrecto.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Las fuentes deben usar HTTPS sin credenciales.');
  }
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
};
const santiagoDate = (instant: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const result: JsonRecord = {
  checkedAt: new Date().toISOString(), mode: 'local-artifact-validation',
  input: 'research/opportunities.json', networkRequests: 0,
  conditionsReconfirmedOnline: false,
};

try {
  const ledger = record(JSON.parse((await readFile('research/opportunities.json', 'utf8')).replace(/^\uFEFF/, '')));
  const ecosystems = records(ledger.ecosystemTracks);
  const sideTracks = records(ledger.sideTracks);
  const programs = records(ledger.programs);
  const all = [...ecosystems, ...sideTracks, ...programs];
  const counts = {
    ecosystemTracks: ecosystems.length, sideTracks: sideTracks.length,
    globalSideTracks: sideTracks.filter(t => t.group === 'global_integration_or_services').length,
    regionalSideTracks: sideTracks.filter(t => t.group === 'regional_or_community').length,
    programs: programs.length,
  };
  result.verifiedOn = ledger.verifiedOn;
  result.counts = counts;
  check('inventory-counts', counts.ecosystemTracks === 8 && counts.sideTracks === 37 &&
    counts.globalSideTracks === 7 && counts.regionalSideTracks === 30 && counts.programs === 7, counts);
  check('timezone', ledger.timezone === 'America/Santiago', ledger.timezone);

  const ids = all.map(t => t.id);
  check('unique-ids', ids.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(ids).size === ids.length, { total: ids.length, distinct: new Set(ids).size });

  const invalidUrls: { path: string; reason: string }[] = [];
  let urlCount = 0;
  const inspectUrls = (value: unknown, path = 'ledger'): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspectUrls(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (/Url$/.test(key)) {
          urlCount++;
          try { normalizedHttpsUrl(item); } catch (error) {
            invalidUrls.push({ path: `${path}.${key}`, reason: error instanceof Error ? error.message : String(error) });
          }
        } else inspectUrls(item, `${path}.${key}`);
      }
    }
  };
  inspectUrls(ledger);
  check('https-source-urls', invalidUrls.length === 0, { checked: urlCount, invalidUrls });
  check('required-source-urls', all.every(t => typeof t.sourceUrl === 'string'), { opportunities: all.length });

  const sourceUrls = sideTracks.map(t => normalizedHttpsUrl(t.sourceUrl));
  check('unique-side-track-links', new Set(sourceUrls).size === sideTracks.length,
    { sideTracks: sideTracks.length, distinctLinks: new Set(sourceUrls).size });
  const report = await readFile('docs/research.md', 'utf8');
  const reportLinks = new Set([...report.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map(match => normalizedHttpsUrl(match[1])));
  const missingLinks = sideTracks.filter(t => !reportLinks.has(normalizedHttpsUrl(t.sourceUrl))).map(t => t.id);
  check('inventory-links-in-report', missingLinks.length === 0,
    { expected: sideTracks.length, present: sideTracks.length - missingLinks.length, missing: missingLinks });

  const rewardGroups: Record<string, string[]> = { monetary: [], creditsOrServices: [], mixed: [], unknown: [] };
  for (const track of sideTracks) {
    const kind = record(track.reward).kind;
    const category = ['stablecoin', 'monetary_prize'].includes(String(kind)) ? 'monetary'
      : ['service_credits', 'audit_credits', 'audit_services'].includes(String(kind)) ? 'creditsOrServices'
        : kind === 'mixed' ? 'mixed' : 'unknown';
    rewardGroups[category]!.push(String(track.id));
  }
  result.rewards = Object.fromEntries(Object.entries(rewardGroups).map(([name, ids]) => [name, { count: ids.length, ids }]));
  check('explicit-reward-types', rewardGroups.unknown!.length === 0, { unknown: rewardGroups.unknown });

  const deadlines = [
    { id: 'colosseum-cwf', sourceInstant: '2026-10-12T23:59:00-07:00', expected: '2026-10-13 03:59' },
    { id: 'encode-solana-2026', sourceInstant: '2026-11-08T23:59:00-12:00', expected: '2026-11-09 08:59' },
  ].map(({ id, sourceInstant, expected }) => {
    const program = programs.find(p => p.id === id);
    if (!program) throw new Error(`Falta el programa ${id}.`);
    const deadline = record(program.deadline);
    if (typeof deadline.utc !== 'string' || typeof deadline.santiago !== 'string') {
      throw new Error(`Faltan fechas con offset para ${id}.`);
    }
    const calculated = santiagoDate(deadline.utc);
    const sourceMatches = Date.parse(sourceInstant) === Date.parse(deadline.utc);
    const recordedMatches = Date.parse(deadline.santiago) === Date.parse(deadline.utc) &&
      deadline.santiago.endsWith('-03:00');
    check(`deadline-${id}`, sourceMatches && recordedMatches && calculated === expected,
      { sourceInstant, utc: deadline.utc, recordedSantiago: deadline.santiago, calculatedSantiago: calculated, expected });
    return { id, utc: deadline.utc, santiago: calculated, timezone: 'America/Santiago' };
  });
  result.deadlines = deadlines;
} catch (error) {
  check('read-and-validate', false, error instanceof Error ? error.message : String(error));
}

result.checks = checks;
result.status = checks.every(c => c.passed) ? 'passed' : 'failed';
if (result.status === 'failed') process.exitCode = 1;
await mkdir('output', { recursive: true });
await writeFile('output/research-check.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
