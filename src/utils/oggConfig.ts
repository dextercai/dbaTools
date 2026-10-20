export type OggMode = 'add' | 'remove';
export type OggKind = 'TABLE' | 'MAP';

interface Statement {
  start: number;
  end: number;
  kind: OggKind;
  source: string;
  target?: string;
  catalog?: string;
}

interface RequestedTable {
  source: string;
  target: string;
}

export interface ConfigIssue {
  severity: 'error' | 'warning';
  line?: number;
  message: string;
}

export interface BuildResult {
  diff: string;
  full: string;
  changed: number;
  skipped: number;
  total: number;
  warnings: string[];
  issues: ConfigIssue[];
  lastCatalog?: string;
}

const isComment = (line: string) => /^\s*(?:--|#|!)/.test(line);

// Split a qualified object name on dots that are outside quoted identifiers.
function splitName(name: string): string[] | null {
  const result: string[] = [];
  let fragment = '';
  let inQuote = false;
  const value = name.trim();

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {
      fragment += char;
      if (inQuote && value[i + 1] === '"') {
        fragment += value[++i];
      } else {
        inQuote = !inQuote;
      }
    } else if (char === '.' && !inQuote) {
      if (!fragment.trim()) return null;
      result.push(fragment.trim());
      fragment = '';
    } else {
      fragment += char;
    }
  }

  if (inQuote || !fragment.trim()) return null;
  result.push(fragment.trim());
  return result.length >= 1 && result.length <= 3 ? result : null;
}

function normalizeIdentifier(value: string): string {
  const part = value.trim();
  if (part.startsWith('"') && part.endsWith('"')) {
    return `Q:${part.slice(1, -1).replace(/""/g, '"')}`;
  }
  return `U:${part.toUpperCase()}`;
}

function canonicalKey(source: string, catalog?: string): string | null {
  const name = splitName(source);
  if (!name || (name.length !== 2 && name.length !== 3)) return null;
  const qualified = name.length === 2 && catalog
    ? [catalog, ...name]
    : name;
  return JSON.stringify(qualified.map(normalizeIdentifier));
}

function canonicalCatalog(name?: string): string | undefined {
  return name ? normalizeIdentifier(name) : undefined;
}

function readToken(text: string): string {
  let inQuote = false;
  let output = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      output += char;
      if (inQuote && text[i + 1] === '"') output += text[++i];
      else inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /[\s,;]/.test(char)) break;
    output += char;
  }
  return output.trim();
}

function hasTerminator(line: string): boolean {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (!quote && char === '-' && line[i + 1] === '-') return false;
    if (!quote && (char === '#' || char === '!') && !line.slice(0, i).trim()) return false;
    if (quote) {
      if (char === quote) {
        if (line[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ';') {
      return true;
    }
  }
  return false;
}

function parseMapTarget(statementText: string): string | undefined {
  // Supports MAP source, TARGET target; and leaves room for common trailing clauses.
  const match = statementText.match(/,\s*TARGET\s+(.+?)(?=,\s*(?:FILTER|COLMAP|KEYCOLS|SQLEXEC|RESOLVECONFLICT|COMPARECOLS|USEDEFAULTS)\b|;|$)/i);
  return match ? readToken(match[1]) : undefined;
}

function parseStatements(lines: string[]): {
  statements: Statement[];
  lastCatalog?: string;
  warnings: string[];
  issues: ConfigIssue[];
} {
  const statements: Statement[] = [];
  const warnings: string[] = [];
  const issues: ConfigIssue[] = [];
  let catalog: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isComment(line)) continue;

    const cat = line.match(/^\s*SOURCECATALOG\s+(.+)$/i);
    if (cat) {
      const token = readToken(cat[1]);
      if (token) catalog = token;
      else {
        const message = `第 ${i + 1} 行 SOURCECATALOG 缺少 PDB 名称`;
        warnings.push(message);
        issues.push({ severity: 'error', line: i + 1, message });
      }
      continue;
    }

    const match = line.match(/^\s*(TABLE|MAP)\s+(.+)$/i);
    if (!match) continue;

    const kind = match[1].toUpperCase() as OggKind;
    const statementText = match[2];
    const source = readToken(statementText);
    if (!canonicalKey(source, catalog)) {
      const message = `第 ${i + 1} 行无法识别表名：${source || line.trim()}`;
      warnings.push(message);
      issues.push({ severity: 'error', line: i + 1, message });
      continue;
    }

    let end = i;
    while (end < lines.length - 1 && !hasTerminator(lines[end])) {
      if (/^\s*(?:SOURCECATALOG|TABLE|MAP|EXTRACT|REPLICAT|USERIDALIAS)\b/i.test(lines[end + 1])) {
        break;
      }
      end++;
    }
    if (!hasTerminator(lines[end])) {
      const message = `第 ${i + 1} 行语句缺少分号，未纳入重复检查：${line.trim()}`;
      warnings.push(message);
      issues.push({ severity: 'error', line: i + 1, message });
      i = end;
      continue;
    }

    const block = lines.slice(i, end + 1).join('\n');
    const target = kind === 'MAP' ? parseMapTarget(block) : undefined;
    if (kind === 'MAP' && !target) {
      const message = `第 ${i + 1} 行 MAP 未识别到 TARGET：${source}`;
      warnings.push(message);
      issues.push({ severity: 'warning', line: i + 1, message });
    }

    statements.push({ start: i, end, kind, source, target, catalog });
    i = end;
  }

  // Check duplicate source entries in the original config, using effective SOURCECATALOG.
  const seen = new Map<string, Statement>();
  const targetSeen = new Map<string, Statement>();
  for (const statement of statements) {
    const sourceKey = canonicalKey(statement.source, statement.catalog);
    if (!sourceKey) continue;
    const key = `${statement.kind}:${sourceKey}`;
    const previous = seen.get(key);
    if (previous) {
      const message = statement.kind === 'MAP' && previous.target && statement.target &&
        canonicalKey(previous.target, previous.catalog) !== canonicalKey(statement.target, statement.catalog)
        ? `MAP 源表重复但目标表不同：第 ${previous.start + 1} 行与第 ${statement.start + 1} 行（${statement.source}）`
        : `${statement.kind} 表配置重复：第 ${previous.start + 1} 行与第 ${statement.start + 1} 行（${statement.source}）`;
      issues.push({ severity: 'error', line: statement.start + 1, message });
      warnings.push(message);
    } else {
      seen.set(key, statement);
    }

    if (statement.kind === 'MAP' && statement.target) {
      const targetKey = canonicalKey(statement.target, statement.catalog);
      if (targetKey) {
        const priorTarget = targetSeen.get(targetKey);
        if (priorTarget && canonicalKey(priorTarget.source, priorTarget.catalog) !== sourceKey) {
          const message = `多个 MAP 源表映射到同一目标表：第 ${priorTarget.start + 1} 行与第 ${statement.start + 1} 行（${statement.target}），请确认是否有意设计`;
          issues.push({ severity: 'warning', line: statement.start + 1, message });
          warnings.push(message);
        } else {
          targetSeen.set(targetKey, statement);
        }
      }
    }
  }

  return { statements, lastCatalog: catalog, warnings, issues };
}

function parseTableInput(text: string, kind: OggKind) {
  const tables: RequestedTable[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || isComment(line)) continue;

    line = line.replace(/^(?:TABLE|MAP)\s+/i, '').replace(/;\s*$/, '').trim();

    let source = '';
    let target = '';
    if (kind === 'MAP') {
      // Accept "SOURCE => TARGET", "SOURCE -> TARGET", or "MAP SOURCE, TARGET TARGET".
      const mapping = line.match(/^(.*?)\s*,\s*TARGET\s+(.+)$/i);
      const arrow = line.match(/^(.*?)\s*(?:=>|->)\s*(.*?)\s*$/);
      if (mapping) {
        source = readToken(mapping[1]);
        target = readToken(mapping[2]);
      } else if (arrow) {
        source = readToken(arrow[1]);
        target = readToken(arrow[2]);
      } else {
        source = readToken(line);
        target = source; // No arrow means source and target are identical.
      }
    } else {
      source = readToken(line);
      target = source;
    }

    if (!canonicalKey(source)) {
      warnings.push(`输入表名不合法：${raw.trim()}`);
      continue;
    }
    if (!canonicalKey(target)) {
      warnings.push(`输入目标表名不合法：${raw.trim()}`);
      continue;
    }

    const key = `${canonicalKey(source)}=>${canonicalKey(target)}`;
    if (seen.has(key)) {
      warnings.push(`输入清单存在重复项，已忽略：${raw.trim()}`);
      continue;
    }
    seen.add(key);
    tables.push({ source, target });
  }

  return { tables, warnings };
}

function commentLine(line: string): string {
  if (!line.trim() || isComment(line)) return line;
  const indent = line.match(/^\s*/)?.[0] ?? '';
  return `${indent}-- ${line.slice(indent.length)}`;
}

export function buildOggConfig(
  original: string,
  input: string,
  mode: OggMode,
  kind: OggKind,
  inputCatalog = '',
): BuildResult {
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const parsed = parseStatements(lines);
  const requested = parseTableInput(input, kind);
  const warnings = [...parsed.warnings, ...requested.warnings];
  const issues = [...parsed.issues];
  const active = parsed.statements.filter(s => s.kind === kind);
  const requestedCatalog = inputCatalog.trim() || parsed.lastCatalog;

  if (inputCatalog.trim() && splitName(inputCatalog.trim())?.length !== 1) {
    const message = '输入默认 PDB 应为单个 Catalog 名称；已停止生成以避免产生错误配置';
    warnings.push(message);
    issues.push({ severity: 'error', message });
    return {
      diff: '', full: original, changed: 0, skipped: 0,
      total: requested.tables.length, warnings, issues, lastCatalog: parsed.lastCatalog,
    };
  }

  const existing = new Set(active.map(s => canonicalKey(s.source, s.catalog)));
  const changes: string[] = [];
  const seenInput = new Set<string>();
  let changed = 0;
  let skipped = 0;
  let full = original;

  if (active.some(s => s.source.includes('*') || s.source.includes('?'))) {
    const message = '原配置包含通配符表规则；当前仅精确匹配，不判断通配符是否覆盖目标表';
    warnings.push(message);
    issues.push({ severity: 'warning', message });
  }

  if (mode === 'add') {
    for (const item of requested.tables) {
      const parts = splitName(item.source)!;
      const key = canonicalKey(item.source, requestedCatalog)!;
      if (seenInput.has(key) || existing.has(key)) {
        skipped++;
        continue;
      }
      seenInput.add(key);

      if (kind === 'MAP') {
        const targetKey = canonicalKey(item.target, requestedCatalog)!;
        const duplicateMapping = active.some(s =>
          s.kind === 'MAP' &&
          canonicalKey(s.source, s.catalog) === key &&
          canonicalKey(s.target ?? s.source, s.catalog) === targetKey
        );
        if (duplicateMapping) {
          skipped++;
          continue;
        }
      }

      if (!requestedCatalog && parts.length === 2 &&
          active.some(s => splitName(s.source)?.length === 3)) {
        const message = `${item.source} 未指定 PDB，无法与已有的三段式表名做等价匹配`;
        warnings.push(message);
        issues.push({ severity: 'warning', message });
      }

      let source = item.source;
      let target = item.target;
      if (parts.length === 2 && requestedCatalog &&
          canonicalCatalog(requestedCatalog) !== canonicalCatalog(parsed.lastCatalog)) {
        source = `${requestedCatalog}.${source}`;
      }

      if (kind === 'MAP' && splitName(target)?.length === 2 && requestedCatalog &&
          canonicalCatalog(requestedCatalog) !== canonicalCatalog(parsed.lastCatalog)) {
        target = `${requestedCatalog}.${target}`;
      }

      const newLine = kind === 'TABLE'
        ? `TABLE ${source};`
        : `MAP ${source}, TARGET ${target};`;
      changes.push(newLine);
      changed++;
      existing.add(key);
    }

    if (changes.length) {
      const separator = !original ? '' : original.endsWith('\n')
        ? (original.endsWith(`${nl}${nl}`) ? '' : nl)
        : `${nl}${nl}`;
      full = original + separator + changes.join(nl) + nl;
    }
  } else {
    const requestedKeys = new Set<string>();
    for (const item of requested.tables) {
      const key = canonicalKey(item.source, requestedCatalog)!;
      if (requestedKeys.has(key)) continue;
      requestedKeys.add(key);
    }
    const matched = new Set<string>();
    const resultLines = [...lines];
    for (const stmt of active) {
      const key = canonicalKey(stmt.source, stmt.catalog)!;
      if (!requestedKeys.has(key)) continue;
      matched.add(key);
      const block = lines.slice(stmt.start, stmt.end + 1).map(commentLine);
      resultLines.splice(stmt.start, block.length, ...block);
      changes.push(block.join(nl));
      changed++;
    }
    skipped = [...requestedKeys].filter(key => !matched.has(key)).length;
    full = resultLines.join(nl);
  }

  return {
    diff: changes.join(mode === 'remove' ? nl + nl : nl),
    full,
    changed,
    skipped,
    total: requested.tables.length,
    warnings: [...new Set(warnings)],
    issues,
    lastCatalog: parsed.lastCatalog,
  };
}
