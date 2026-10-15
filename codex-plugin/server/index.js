#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const proposals = new Map();
let vaultRoot = process.env.OBSIDIAN_VAULT_PATH ? path.resolve(process.env.OBSIDIAN_VAULT_PATH) : null;

const tools = [
  {
    name: 'connect_vault',
    description: 'Connect to a specific Obsidian vault folder on this Mac. Requires the user to provide the path.',
    inputSchema: { type: 'object', properties: { vault_path: { type: 'string', description: 'Absolute path to the Obsidian vault folder.' } }, required: ['vault_path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'vault_overview',
    description: 'Summarize the connected vault and report broken links, orphan notes, and empty notes.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'search_notes',
    description: 'Search Markdown notes in the connected vault by words or phrase.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'read_note',
    description: 'Read one Markdown note from the connected vault.',
    inputSchema: { type: 'object', properties: { note_path: { type: 'string', description: 'Vault-relative Markdown path.' } }, required: ['note_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'list_canvases',
    description: 'List Canvas files in the connected Obsidian vault with node and edge counts. Does not read note contents.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'read_canvas',
    description: 'Read one Obsidian Canvas as structured nodes and connections from the connected vault.',
    inputSchema: { type: 'object', properties: { canvas_path: { type: 'string', description: 'Vault-relative .canvas path.' } }, required: ['canvas_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'inspect_canvas',
    description: 'Check one Canvas for malformed data, duplicate IDs, dangling edges, and missing note cards. Read-only.',
    inputSchema: { type: 'object', properties: { canvas_path: { type: 'string' } }, required: ['canvas_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'suggest_canvas_links',
    description: 'Suggest Markdown notes related to the text and file cards in a Canvas without changing it.',
    inputSchema: { type: 'object', properties: { canvas_path: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['canvas_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'suggest_links',
    description: 'Find notes with related titles and content that are not already linked from the selected note.',
    inputSchema: { type: 'object', properties: { note_path: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['note_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'inspect_note_cleanup',
    description: 'Inspect one note for broken wiki links, empty headings, repeated blank lines, and missing final newline. Read-only.',
    inputSchema: { type: 'object', properties: { note_path: { type: 'string' } }, required: ['note_path'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'propose_note_edit',
    description: 'Stage a full replacement for a note without writing it. Apply only after the user approves the displayed proposal.',
    inputSchema: { type: 'object', properties: { note_path: { type: 'string' }, new_content: { type: 'string' }, reason: { type: 'string' } }, required: ['note_path', 'new_content', 'reason'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'propose_canvas_edit',
    description: 'Stage a complete JSON Canvas replacement without writing it. Apply only after the user approves the displayed diff.',
    inputSchema: { type: 'object', properties: { canvas_path: { type: 'string' }, new_content: { type: 'string', description: 'Complete JSON text for the updated Canvas.' }, reason: { type: 'string' } }, required: ['canvas_path', 'new_content', 'reason'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'apply_note_edit',
    description: 'Write an approved staged note or Canvas edit. Requires the proposal ID and the user\'s explicit approval.',
    inputSchema: { type: 'object', properties: { proposal_id: { type: 'string' } }, required: ['proposal_id'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'create_note',
    description: 'Create a new Markdown note in the connected vault after the user asks for it.',
    inputSchema: { type: 'object', properties: { note_path: { type: 'string', description: 'Vault-relative path ending in .md.' }, content: { type: 'string' } }, required: ['note_path', 'content'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'create_canvas',
    description: 'Create a new Canvas containing text cards and/or references to existing Markdown notes. Ask before creating it.',
    inputSchema: { type: 'object', properties: {
      canvas_path: { type: 'string', description: 'Vault-relative path ending in .canvas.' },
      items: { type: 'array', minItems: 1, items: { type: 'object', properties: { type: { type: 'string', enum: ['text', 'file'] }, text: { type: 'string' }, file: { type: 'string' } }, required: ['type'], additionalProperties: false } }
    }, required: ['canvas_path', 'items'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  }
];

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function assertConnected() {
  if (!vaultRoot) throw new Error('No vault connected. Ask the user for the vault folder path, then call connect_vault.');
}

async function connectVault(vaultPath) {
  if (!path.isAbsolute(vaultPath)) throw new Error('vault_path must be an absolute path.');
  const real = await fs.realpath(vaultPath);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error('The selected vault path is not a folder.');
  vaultRoot = real;
  const files = await listMarkdown();
  const canvases = await listCanvasFiles();
  return { connected: true, vault_name: path.basename(real), markdown_note_count: files.length, canvas_count: canvases.length, connection_lasts_for: 'this Codex MCP session' };
}

function insideVault(absolute) {
  return absolute === vaultRoot || absolute.startsWith(vaultRoot + path.sep);
}

async function resolveNote(notePath, allowMissing = false) {
  assertConnected();
  if (typeof notePath !== 'string' || !notePath.trim()) throw new Error('note_path is required.');
  if (notePath.split(/[\\/]+/).some(part => part.startsWith('.'))) throw new Error('Hidden folders and files are outside the plugin scope.');
  const absolute = path.resolve(vaultRoot, notePath);
  if (!insideVault(absolute)) throw new Error('The path must stay inside the connected vault.');
  if (path.extname(absolute).toLowerCase() !== '.md') throw new Error('Only Markdown notes (.md) are supported.');
  if (allowMissing) {
    const parent = await fs.realpath(path.dirname(absolute));
    if (!insideVault(parent)) throw new Error('The parent folder resolves outside the connected vault.');
    return absolute;
  }
  const real = await fs.realpath(absolute);
  if (!insideVault(real)) throw new Error('The note resolves outside the connected vault.');
  return real;
}

async function resolveCanvas(canvasPath, allowMissing = false) {
  assertConnected();
  if (typeof canvasPath !== 'string' || !canvasPath.trim()) throw new Error('canvas_path is required.');
  if (canvasPath.split(/[\\/]+/).some(part => part.startsWith('.'))) throw new Error('Hidden folders and files are outside the plugin scope.');
  const absolute = path.resolve(vaultRoot, canvasPath);
  if (!insideVault(absolute)) throw new Error('The path must stay inside the connected vault.');
  if (path.extname(absolute).toLowerCase() !== '.canvas') throw new Error('Only Canvas files (.canvas) are supported.');
  if (allowMissing) {
    const parent = await fs.realpath(path.dirname(absolute));
    if (!insideVault(parent)) throw new Error('The parent folder resolves outside the connected vault.');
    return absolute;
  }
  const real = await fs.realpath(absolute);
  if (!insideVault(real)) throw new Error('The Canvas resolves outside the connected vault.');
  return real;
}

async function listMarkdown() {
  assertConnected();
  const out = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full);
    }
  }
  await walk(vaultRoot);
  return out.sort();
}

async function listCanvasFiles() {
  assertConnected();
  const out = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.canvas')) out.push(full);
    }
  }
  await walk(vaultRoot);
  return out.sort();
}

function validateCanvas(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Canvas data must be a JSON object.');
  if (data.nodes !== undefined && !Array.isArray(data.nodes)) throw new Error('Canvas nodes must be an array.');
  if (data.edges !== undefined && !Array.isArray(data.edges)) throw new Error('Canvas edges must be an array.');
  const nodes = data.nodes || [];
  const edges = data.edges || [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || typeof node.type !== 'string') throw new Error('Each Canvas node needs a string id and type.');
    if (!['text', 'file', 'link', 'group'].includes(node.type)) throw new Error(`Unsupported Canvas node type: ${node.type}`);
    if (node.type === 'file' && typeof node.file !== 'string') throw new Error('File nodes need a file path.');
    if (node.type === 'text' && typeof node.text !== 'string') throw new Error('Text nodes need text.');
    if (node.type === 'link' && typeof node.url !== 'string') throw new Error('Link nodes need a URL.');
    for (const key of ['x', 'y', 'width', 'height']) if (!Number.isFinite(node[key])) throw new Error(`Canvas node ${node.id} needs a numeric ${key}.`);
  }
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object' || typeof edge.id !== 'string' || typeof edge.fromNode !== 'string' || typeof edge.toNode !== 'string') throw new Error('Each Canvas edge needs an id, fromNode, and toNode.');
  }
  return { nodes, edges };
}

async function readCanvas(canvasPath) {
  const file = await resolveCanvas(canvasPath);
  let data;
  try { data = JSON.parse(await readText(file)); } catch (err) { throw new Error(`Could not parse Canvas JSON: ${err.message}`); }
  const { nodes, edges } = validateCanvas(data);
  return { path: canvasPath, data, node_count: nodes.length, edge_count: edges.length };
}

async function inspectCanvas(canvasPath) {
  const { data, node_count, edge_count } = await readCanvas(canvasPath);
  const nodes = data.nodes || [];
  const edges = data.edges || [];
  const issues = [];
  const nodeIds = new Set();
  const edgeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) issues.push({ type: 'duplicate_node_id', id: node.id });
    nodeIds.add(node.id);
  }
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) issues.push({ type: 'duplicate_edge_id', id: edge.id });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNode) || !nodes.some(node => node.id === edge.fromNode)) issues.push({ type: 'missing_edge_source', edge_id: edge.id, node_id: edge.fromNode });
    if (!nodes.some(node => node.id === edge.toNode)) issues.push({ type: 'missing_edge_target', edge_id: edge.id, node_id: edge.toNode });
  }
  for (const node of nodes.filter(item => item.type === 'file')) {
    const candidate = path.resolve(vaultRoot, node.file);
    if (!insideVault(candidate)) { issues.push({ type: 'file_node_outside_vault', node_id: node.id }); continue; }
    try {
      const real = await fs.realpath(candidate);
      if (!insideVault(real)) issues.push({ type: 'file_node_outside_vault', node_id: node.id });
    } catch (err) {
      if (err.code === 'ENOENT') issues.push({ type: 'missing_file_node', node_id: node.id, file: node.file });
      else throw err;
    }
  }
  return { canvas_path: canvasPath, node_count, edge_count, issues, canvas_is_unchanged: true };
}

async function suggestCanvasLinks(canvasPath, limit = 10) {
  const { data } = await readCanvas(canvasPath);
  const nodeText = (data.nodes || []).map(node => node.type === 'text' ? node.text : node.type === 'file' ? path.basename(node.file, path.extname(node.file)) : node.type === 'group' ? node.label || '' : '').join(' ');
  const linked = new Set((data.nodes || []).filter(node => node.type === 'file').map(node => node.file.replace(/\\/g, '/').toLocaleLowerCase()));
  const sourceWords = new Set(tokens(nodeText));
  const notes = await allNotes();
  const suggestions = notes.filter(note => !linked.has(note.path.toLocaleLowerCase())).map(note => {
    const candidateWords = new Set(tokens(note.title + ' ' + note.content));
    const shared_terms = [...candidateWords].filter(term => sourceWords.has(term)).slice(0, 8);
    const score = shared_terms.length / Math.max(1, Math.sqrt(sourceWords.size * candidateWords.size));
    return { path: note.path, title: note.title, score: Number(score.toFixed(4)), shared_terms };
  }).filter(note => note.score > 0.015).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit)));
  return { canvas_path: canvasPath, suggestions };
}

function relative(file) { return path.relative(vaultRoot, file).split(path.sep).join('/'); }
function titleFor(file) { return path.basename(file, '.md').replace(/[_-]+/g, ' '); }
function tokens(value) { return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(x => !STOP.has(x)); }
const STOP = new Set(['this','that','with','from','have','were','your','about','into','when','what','where','which','there','their','then','also','some','more','than','such','will','would','could','should','been','being','very','just','like','because','لكن','هذا','هذه','ذلك','تلك','على','الى','إلى','من','في','عن','مع','كان','كانت','يكون','بعد','قبل','كل','هذا','هناك','التي','الذي']);

function normalizedLink(target) {
  return target.split('|')[0].split('#')[0].trim().replace(/^\.\//, '').replace(/\.md$/i, '').toLocaleLowerCase();
}

function extractLinks(content) {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => normalizedLink(m[1]));
}

async function readText(file) { return fs.readFile(file, 'utf8'); }

async function allNotes() {
  const files = await listMarkdown();
  return Promise.all(files.map(async file => ({ file, path: relative(file), title: titleFor(file), content: await readText(file) })));
}

function excerpt(content, query) {
  const lower = content.toLocaleLowerCase();
  const index = lower.indexOf(query.toLocaleLowerCase().split(/\s+/)[0]);
  const start = Math.max(0, index < 0 ? 0 : index - 80);
  return content.slice(start, start + 220).replace(/\n{3,}/g, '\n\n').trim();
}

async function overview() {
  const notes = await allNotes();
  const canvases = await listCanvasFiles();
  const inbound = new Map(notes.map(n => [n.path.replace(/\.md$/i, '').toLocaleLowerCase(), 0]));
  const titleMap = new Map(notes.map(n => [n.title.toLocaleLowerCase(), n.path]));
  const broken = [];
  const empty = [];
  for (const note of notes) {
    if (!note.content.trim()) empty.push(note.path);
    for (const target of extractLinks(note.content)) {
      const key = target.toLocaleLowerCase();
      const found = inbound.has(key) || titleMap.has(path.basename(key));
      if (!found) broken.push({ note: note.path, target });
      else {
        const resolved = inbound.has(key) ? key : [...titleMap.keys()].find(k => k === path.basename(key));
        if (resolved) inbound.set(resolved, (inbound.get(resolved) || 0) + 1);
      }
    }
  }
  const orphan = notes.filter(n => (inbound.get(n.path.replace(/\.md$/i, '').toLocaleLowerCase()) || 0) === 0).map(n => n.path);
  return { vault: path.basename(vaultRoot), markdown_notes: notes.length, canvases: canvases.length, broken_wikilinks: broken.slice(0, 100), broken_wikilink_count: broken.length, orphan_notes: orphan.slice(0, 100), orphan_note_count: orphan.length, empty_notes: empty };
}

async function searchNotes(query, limit = 15) {
  assertConnected();
  if (!query.trim()) throw new Error('query cannot be empty.');
  const qTokens = [...new Set(tokens(query))];
  const notes = await allNotes();
  const results = notes.map(n => {
    const hay = (n.title + ' ' + n.content).toLocaleLowerCase();
    const hits = qTokens.filter(t => hay.includes(t));
    const score = (hits.length / Math.max(1, qTokens.length)) + (n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? 1 : 0);
    return { path: n.path, title: n.title, score: Number(score.toFixed(3)), matched_terms: hits, excerpt: excerpt(n.content, query) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, limit)));
  return { query, results };
}

async function suggestLinks(notePath, limit = 10) {
  const sourceFile = await resolveNote(notePath);
  const source = await readText(sourceFile);
  const linked = new Set(extractLinks(source));
  const sourceWords = new Set(tokens(titleFor(sourceFile) + ' ' + source));
  const notes = await allNotes();
  const candidates = notes.filter(n => n.file !== sourceFile && !linked.has(n.path.replace(/\.md$/i, '').toLocaleLowerCase()) && !linked.has(n.title.toLocaleLowerCase())).map(n => {
    const candidateWords = new Set(tokens(n.title + ' ' + n.content));
    let overlap = 0;
    for (const word of candidateWords) if (sourceWords.has(word)) overlap++;
    const score = overlap / Math.max(1, Math.sqrt(sourceWords.size * candidateWords.size));
    const shared_terms = [...candidateWords].filter(x => sourceWords.has(x)).slice(0, 8);
    return { path: n.path, title: n.title, score: Number(score.toFixed(4)), shared_terms, excerpt: excerpt(n.content, shared_terms[0] || n.title) };
  }).filter(x => x.score > 0.015).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit)));
  return { note_path: notePath, suggestions: candidates };
}

async function cleanup(notePath) {
  const file = await resolveNote(notePath);
  const content = await readText(file);
  const issues = [];
  const all = await allNotes();
  const lookup = new Set(all.map(n => n.path.replace(/\.md$/i, '').toLocaleLowerCase()));
  const titles = new Set(all.map(n => n.title.toLocaleLowerCase()));
  for (const target of extractLinks(content)) {
    if (!lookup.has(target) && !titles.has(path.basename(target))) issues.push({ type: 'broken_wikilink', target });
  }
  for (const match of content.matchAll(/^#{1,6}\s*$/gm)) issues.push({ type: 'empty_heading', line: content.slice(0, match.index).split('\n').length });
  if (/\n{3,}/.test(content)) issues.push({ type: 'repeated_blank_lines', description: 'Three or more consecutive line breaks.' });
  if (content.length && !content.endsWith('\n')) issues.push({ type: 'missing_final_newline' });
  return { note_path: notePath, issues, note_is_unchanged: true };
}

function makeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  return { unchanged_prefix_lines: prefix, old_changed_lines: oldLines.slice(prefix, oldLines.length - suffix), new_changed_lines: newLines.slice(prefix, newLines.length - suffix), unchanged_suffix_lines: suffix };
}

async function atomicWrite(file, content) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temp, file);
}

async function callTool(name, args) {
  switch (name) {
    case 'connect_vault': return connectVault(args.vault_path);
    case 'vault_overview': return overview();
    case 'search_notes': return searchNotes(args.query, args.limit ?? 15);
    case 'read_note': {
      const file = await resolveNote(args.note_path);
      return { path: args.note_path, content: await readText(file) };
    }
    case 'list_canvases': {
      const files = await listCanvasFiles();
      const canvases = [];
      for (const file of files) {
        try {
          const data = JSON.parse(await readText(file));
          const { nodes, edges } = validateCanvas(data);
          canvases.push({ path: relative(file), node_count: nodes.length, edge_count: edges.length });
        } catch (err) {
          canvases.push({ path: relative(file), error: err.message });
        }
      }
      return { canvases };
    }
    case 'read_canvas': return readCanvas(args.canvas_path);
    case 'inspect_canvas': return inspectCanvas(args.canvas_path);
    case 'suggest_canvas_links': return suggestCanvasLinks(args.canvas_path, args.limit ?? 10);
    case 'suggest_links': return suggestLinks(args.note_path, args.limit ?? 10);
    case 'inspect_note_cleanup': return cleanup(args.note_path);
    case 'propose_note_edit': {
      const file = await resolveNote(args.note_path);
      const oldText = await readText(file);
      const id = crypto.randomUUID();
      proposals.set(id, { file, path: args.note_path, oldHash: crypto.createHash('sha256').update(oldText).digest('hex'), newContent: args.new_content, reason: args.reason, createdAt: Date.now() });
      return { proposal_id: id, note_path: args.note_path, reason: args.reason, diff: makeDiff(oldText, args.new_content), next_step: 'Show this diff to the user. Call apply_note_edit only after the user explicitly approves this exact proposal.' };
    }
    case 'propose_canvas_edit': {
      const file = await resolveCanvas(args.canvas_path);
      const oldText = await readText(file);
      let parsed;
      try { parsed = JSON.parse(args.new_content); } catch (err) { throw new Error(`new_content is not valid JSON: ${err.message}`); }
      validateCanvas(parsed);
      const newContent = JSON.stringify(parsed, null, 2) + '\n';
      const id = crypto.randomUUID();
      proposals.set(id, { file, path: args.canvas_path, oldHash: crypto.createHash('sha256').update(oldText).digest('hex'), newContent, reason: args.reason, createdAt: Date.now() });
      return { proposal_id: id, canvas_path: args.canvas_path, reason: args.reason, diff: makeDiff(oldText, newContent), next_step: 'Show this diff to the user. Call apply_note_edit only after the user explicitly approves this exact Canvas proposal.' };
    }
    case 'apply_note_edit': {
      const proposal = proposals.get(args.proposal_id);
      if (!proposal) throw new Error('Proposal not found or expired. Prepare the edit again.');
      if (Date.now() - proposal.createdAt > 30 * 60 * 1000) { proposals.delete(args.proposal_id); throw new Error('Proposal expired. Prepare the edit again.'); }
      const current = await readText(proposal.file);
      const hash = crypto.createHash('sha256').update(current).digest('hex');
      if (hash !== proposal.oldHash) { proposals.delete(args.proposal_id); throw new Error('The note changed after the proposal was made. Read it again and prepare a new proposal.'); }
      await atomicWrite(proposal.file, proposal.newContent);
      proposals.delete(args.proposal_id);
      return { applied: true, note_path: proposal.path, reason: proposal.reason };
    }
    case 'create_note': {
      const file = await resolveNote(args.note_path, true);
      try { await fs.access(file); throw new Error('A note already exists at this path.'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      await atomicWrite(file, args.content.endsWith('\n') ? args.content : args.content + '\n');
      return { created: true, note_path: args.note_path };
    }
    case 'create_canvas': {
      const file = await resolveCanvas(args.canvas_path, true);
      try { await fs.access(file); throw new Error('A Canvas already exists at this path.'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      if (!Array.isArray(args.items) || !args.items.length) throw new Error('Provide at least one Canvas item.');
      const nodes = [];
      for (let i = 0; i < args.items.length; i++) {
        const item = args.items[i];
        const id = crypto.randomBytes(8).toString('hex');
        const position = { x: (i % 3) * 320, y: Math.floor(i / 3) * 240, width: 260, height: 180 };
        if (item.type === 'text') {
          if (typeof item.text !== 'string' || !item.text.trim()) throw new Error(`Canvas text item ${i + 1} needs non-empty text.`);
          nodes.push({ id, type: 'text', text: item.text, ...position });
        } else if (item.type === 'file') {
          const note = await resolveNote(item.file);
          nodes.push({ id, type: 'file', file: relative(note), ...position });
        } else throw new Error(`Canvas item ${i + 1} must have type text or file.`);
      }
      const data = { nodes, edges: [] };
      await atomicWrite(file, JSON.stringify(data, null, 2) + '\n');
      return { created: true, canvas_path: args.canvas_path, node_count: nodes.length, edge_count: 0 };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message) { process.stdout.write(JSON.stringify(message) + '\n'); }

async function handle(message) {
  if (!message || typeof message !== 'object' || !message.method) return;
  if (message.method.startsWith('notifications/')) return;
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'obsidian-codex-assistant', version: '0.1.0' } } });
    return;
  }
  if (message.method === 'ping') { send({ jsonrpc: '2.0', id: message.id, result: {} }); return; }
  if (message.method === 'tools/list') { send({ jsonrpc: '2.0', id: message.id, result: { tools } }); return; }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      send({ jsonrpc: '2.0', id: message.id, result: textResult(result) });
    } catch (err) {
      send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: err.message || String(err) }], isError: true } });
    }
    return;
  }
  if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  try { void handle(JSON.parse(line)); }
  catch (err) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: err.message || 'Invalid JSON' } }); }
});
