// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Which rule ids can a tool emit? Derived from the code, never from an id prefix.
 *
 * Method (a symbol-level reachability scan with the TypeScript compiler):
 *  1. The program is the project's own tsconfig.json; its type checker resolves every identifier to its declaration, through imports and re-exports.
 *  2. A UNIT is one top-level statement of a module under src/ (a function, a const, a class, a component); the registry's own text files (src/core/rules/)
 *     are not units: they define rules, they never raise one.
 *  3. A tool's ROOTS are every unit of its entry modules (the page and the worker handler that runs its checks: see TOOL_ENTRIES in rules-docs-per-tool.ts).
 *  4. From the roots the scan follows every identifier of a unit to the unit that declares it (a call, a reference, a JSX component, a method of a class),
 *     transitively. Type-only declarations (interface, type alias) are not followed.
 *  5. A rule id is EMITTED by a tool when a string literal equal to a registry id sits in a reached unit, in a position that is not a MENTION. Mentions are
 *     the positions where code talks about a rule instead of raising it: a comparison (`f.ruleId === 'X'`), a literal type, the argument of `threshold()`,
 *     `hasThreshold()`, `getRule()`, `sourcesOf()`, `startsWith()` (they read a rule's numbers or texts), and the key `ruleId:` of a suppression record.
 *     The modules in DISPLAY_ONLY (the ⓘ tip texts) only describe rules and are not entered.
 *
 * The result is an over-approximation at unit granularity: a unit that raises a rule is counted for every tool that reaches it, even when a given call
 * never takes that branch. Calls through an interface reach only the implementations the tool references itself.
 */
export const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const RULES_DIR = join(SRC, 'core', 'rules');

/** Modules that only describe rules to the reader (tip texts keyed by rule id); never an emission site. */
export const DISPLAY_ONLY: readonly string[] = ['src/app/tips.tsx', 'src/app/tipRules.tsx'];

/** Callees whose literal argument reads a rule's thresholds, citations or text; the literal is a mention, not an emission. */
const READS_A_RULE = new Set(['threshold', 'hasThreshold', 'thresholdText', 'thresholdSource', 'thresholdOf', 'getRule', 'sourcesOf', 'startsWith']);

function isMention(n: ts.Node): boolean {
  let p: ts.Node = n.parent;
  while (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isConditionalExpression(p)) p = p.parent;
  if (ts.isBinaryExpression(p)) return ['===', '!==', '==', '!='].includes(p.operatorToken.getText());
  if (ts.isLiteralTypeNode(p) || ts.isCaseClause(p)) return true;
  if (ts.isCallExpression(p)) {
    const callee = p.expression;
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
    return READS_A_RULE.has(name);
  }
  if (ts.isPropertyAssignment(p) && p.name.getText() === 'ruleId') {
    // `suppress.push({ ruleId: 'X', file })` names a finding to hold back; a finding being built also has `ruleId:` but always goes through makeFinding
    const lit = p.parent;
    return ts.isObjectLiteralExpression(lit) && ts.isCallExpression(lit.parent) && /\bsuppress\b/.test(lit.parent.expression.getText());
  }
  return false;
}

export interface Scan {
  /** unit id ("src/core/x.ts#12" = file and start line) → rule ids it names in a non-mention position */
  idsOfUnit: Map<string, Set<string>>;
  /** unit id → units it refers to */
  refs: Map<string, Set<string>>;
  /** file (relative to the repository) → its unit ids */
  unitsOfFile: Map<string, string[]>;
}

/** Builds the unit graph of src/ once (a few seconds). */
export function scanProject(ids: ReadonlySet<string>): Scan {
  const cfgPath = join(ROOT, 'tsconfig.json');
  const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
  if (!cfg) throw new Error('tsconfig.json could not be read');
  const program = ts.createProgram(cfg.fileNames, cfg.options, ts.createCompilerHost(cfg.options, true));
  const checker = program.getTypeChecker();
  const inScope = (sf: ts.SourceFile): boolean => sf.fileName.startsWith(SRC) && !sf.fileName.startsWith(RULES_DIR) && !DISPLAY_ONLY.includes(relative(ROOT, sf.fileName));

  const unitOf = (node: ts.Node): string | undefined => {
    const sf = node.getSourceFile();
    if (!inScope(sf)) return undefined;
    let n = node;
    while (n.parent && n.parent !== sf) n = n.parent;
    if (n.parent !== sf) return undefined;
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isImportDeclaration(n)) return undefined;
    return `${relative(ROOT, sf.fileName)}#${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  };

  const idsOfUnit = new Map<string, Set<string>>();
  const refs = new Map<string, Set<string>>();
  const unitsOfFile = new Map<string, string[]>();

  for (const sf of program.getSourceFiles()) {
    if (!inScope(sf)) continue;
    const rel = relative(ROOT, sf.fileName);
    for (const stmt of sf.statements) {
      const unit = unitOf(stmt);
      if (!unit) continue;
      const list = unitsOfFile.get(rel) ?? [];
      list.push(unit);
      unitsOfFile.set(rel, list);
      const mine = new Set<string>();
      const out = new Set<string>();
      const visit = (n: ts.Node): void => {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && ids.has(n.text) && !isMention(n)) mine.add(n.text);
        if (ts.isIdentifier(n)) {
          let sym = checker.getSymbolAtLocation(n);
          if (n.parent && ts.isShorthandPropertyAssignment(n.parent)) sym = checker.getShorthandAssignmentValueSymbol(n.parent) ?? sym;
          if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
          for (const d of sym?.declarations ?? []) {
            const u = unitOf(d);
            if (u && u !== unit) out.add(u);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(stmt);
      idsOfUnit.set(unit, mine);
      refs.set(unit, out);
    }
  }
  return { idsOfUnit, refs, unitsOfFile };
}

/** The rule ids a set of entry modules (paths relative to the repository) can raise, each with the modules that name it. */
export function emittedBy(scan: Scan, entries: readonly string[]): Map<string, string[]> {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const e of entries) {
    const units = scan.unitsOfFile.get(e);
    if (!units) throw new Error(`Entry module not in the program: ${e}`);
    queue.push(...units);
  }
  while (queue.length) {
    const u = queue.pop() as string;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const r of scan.refs.get(u) ?? []) queue.push(r);
  }
  const out = new Map<string, string[]>();
  for (const u of [...seen].sort()) {
    for (const id of scan.idsOfUnit.get(u) ?? []) {
      const file = u.slice(0, u.indexOf('#'));
      const list = out.get(id) ?? [];
      if (!list.includes(file)) list.push(file);
      out.set(id, list);
    }
  }
  return out;
}
