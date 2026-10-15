'use strict';

const { Plugin, Notice, Modal, Setting, MarkdownView } = require('obsidian');

function words(text) {
  return new Set((text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(word => word.length > 2));
}

function wikilinks(text) {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1].split('|')[0].split('#')[0].trim().replace(/\.md$/i, '').toLocaleLowerCase());
}

function bodyScore(source, candidate) {
  const left = words(source);
  const right = words(candidate);
  let common = 0;
  for (const word of right) if (left.has(word)) common++;
  return common / Math.max(1, Math.sqrt(left.size * right.size));
}

class TextEntryModal extends Modal {
  constructor(app, title, placeholder, onSubmit) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.titleEl.setText(this.title);
    let value = '';
    new Setting(this.contentEl).setName('Text').addTextArea(area => {
      area.setPlaceholder(this.placeholder).setValue('').onChange(text => { value = text; });
      area.inputEl.rows = 8;
      area.inputEl.style.width = '100%';
    });
    new Setting(this.contentEl).addButton(button => button.setButtonText('Continue').setCta().onClick(async () => {
      await this.onSubmit(value);
      this.close();
    }));
  }
}

class SuggestionModal extends Modal {
  constructor(app, suggestions, sourceFile, onAdd) {
    super(app);
    this.suggestions = suggestions;
    this.sourceFile = sourceFile;
    this.onAdd = onAdd;
  }
  onOpen() {
    this.titleEl.setText('Suggested links');
    if (!this.suggestions.length) this.contentEl.createEl('p', { text: 'No strong link suggestions found.' });
    for (const item of this.suggestions) {
      const row = this.contentEl.createDiv({ cls: 'setting-item' });
      const info = row.createDiv({ cls: 'setting-item-info' });
      info.createDiv({ cls: 'setting-item-name', text: item.file.basename });
      info.createDiv({ cls: 'setting-item-description', text: `${item.score.toFixed(3)} match · ${item.shared.slice(0, 5).join(', ')}` });
      new Setting(row).addButton(button => button.setButtonText('Add link').onClick(async () => {
        await this.onAdd(item.file);
        new Notice(`Added link to ${item.file.basename}`);
        row.remove();
      }));
    }
    new Setting(this.contentEl).addButton(button => button.setButtonText('Done').onClick(() => this.close()));
  }
}

class SearchModal extends Modal {
  constructor(app, results) { super(app); this.results = results; }
  onOpen() {
    this.titleEl.setText('Search results');
    for (const result of this.results) {
      new Setting(this.contentEl).setName(result.file.basename).setDesc(result.preview).addButton(button => button.setButtonText('Open').onClick(() => {
        this.app.workspace.getLeaf(false).openFile(result.file);
        this.close();
      }));
    }
    if (!this.results.length) this.contentEl.createEl('p', { text: 'No matching notes found.' });
  }
}

class CleanupModal extends Modal {
  constructor(app, file, issues, hasSpacingFix, onClean) {
    super(app);
    this.file = file;
    this.issues = issues;
    this.hasSpacingFix = hasSpacingFix;
    this.onClean = onClean;
  }
  onOpen() {
    this.titleEl.setText(`Review: ${this.file.basename}`);
    if (!this.issues.length) this.contentEl.createEl('p', { text: 'No common cleanup issues found.' });
    for (const issue of this.issues) this.contentEl.createEl('p', { text: issue });
    if (this.hasSpacingFix) {
      new Setting(this.contentEl).addButton(button => button.setButtonText('Fix spacing and final newline').setCta().onClick(async () => {
        await this.onClean();
        new Notice('Applied the formatting cleanup.');
        this.close();
      }));
    }
    new Setting(this.contentEl).addButton(button => button.setButtonText('Close').onClick(() => this.close()));
  }
}

class CanvasReportModal extends Modal {
  constructor(app, title, lines) { super(app); this.reportTitle = title; this.lines = lines; }
  onOpen() {
    this.titleEl.setText(this.reportTitle);
    if (!this.lines.length) this.contentEl.createEl('p', { text: 'No Canvas issues found.' });
    for (const line of this.lines) this.contentEl.createEl('p', { text: line });
    new Setting(this.contentEl).addButton(button => button.setButtonText('Close').onClick(() => this.close()));
  }
}

class CanvasSuggestionsModal extends Modal {
  constructor(app, file, suggestions, onAdd) { super(app); this.file = file; this.suggestions = suggestions; this.onAdd = onAdd; }
  onOpen() {
    this.titleEl.setText('Suggested Canvas cards');
    if (!this.suggestions.length) this.contentEl.createEl('p', { text: 'No strong note suggestions found.' });
    for (const item of this.suggestions) {
      const row = this.contentEl.createDiv({ cls: 'setting-item' });
      const info = row.createDiv({ cls: 'setting-item-info' });
      info.createDiv({ cls: 'setting-item-name', text: item.file.basename });
      info.createDiv({ cls: 'setting-item-description', text: `${item.score.toFixed(3)} match · ${item.shared.slice(0, 5).join(', ')}` });
      new Setting(row).addButton(button => button.setButtonText('Add card').onClick(async () => {
        await this.onAdd(item.file, item.anchorId);
        new Notice(`Added ${item.file.basename} to the Canvas`);
        row.remove();
      }));
    }
    new Setting(this.contentEl).addButton(button => button.setButtonText('Done').onClick(() => this.close()));
  }
}

module.exports = class ObsidianCodexAssistant extends Plugin {
  async onload() {
    this.addCommand({ id: 'vault-overview', name: 'Show vault overview', callback: () => this.showOverview() });
    this.addCommand({ id: 'suggest-links', name: 'Suggest links for current note', callback: () => this.suggestCurrentLinks() });
    this.addCommand({ id: 'inspect-cleanup', name: 'Review cleanup for current note', callback: () => this.inspectCleanup() });
    this.addCommand({ id: 'search-notes', name: 'Search notes', callback: () => this.searchNotes() });
    this.addCommand({ id: 'create-note', name: 'Create a note', callback: () => this.createNote() });
    this.addCommand({ id: 'canvas-overview', name: 'Show Canvas overview', callback: () => this.showCanvasOverview() });
    this.addCommand({ id: 'inspect-canvas', name: 'Inspect current Canvas', callback: () => this.inspectCurrentCanvas() });
    this.addCommand({ id: 'suggest-canvas-links', name: 'Suggest note cards for current Canvas', callback: () => this.suggestCurrentCanvasLinks() });
    this.addCommand({ id: 'create-canvas', name: 'Create a Canvas', callback: () => this.createCanvas() });
  }

  getCanvasFile() {
    const file = this.app.workspace.getActiveFile();
    return file?.extension === 'canvas' ? file : null;
  }

  async showCanvasOverview() {
    const files = this.app.vault.getFiles().filter(file => file.extension === 'canvas');
    let nodes = 0;
    let edges = 0;
    let invalid = 0;
    for (const file of files) {
      try {
        const data = JSON.parse(await this.app.vault.cachedRead(file));
        nodes += Array.isArray(data.nodes) ? data.nodes.length : 0;
        edges += Array.isArray(data.edges) ? data.edges.length : 0;
      } catch { invalid++; }
    }
    new Notice(`Vault: ${files.length} Canvas files · ${nodes} cards · ${edges} connections · ${invalid} unreadable`, 7000);
  }

  async inspectCurrentCanvas() {
    const file = this.getCanvasFile();
    if (!file) { new Notice('Open a Canvas file first.'); return; }
    let data;
    try { data = JSON.parse(await this.app.vault.cachedRead(file)); } catch (error) {
      new CanvasReportModal(this.app, `Canvas review: ${file.basename}`, [`Invalid JSON: ${error.message}`]).open();
      return;
    }
    if (!Array.isArray(data.nodes)) data.nodes = [];
    if (!Array.isArray(data.edges)) data.edges = [];
    const issues = [];
    const ids = new Set();
    for (const node of data.nodes) {
      if (!node || typeof node.id !== 'string') { issues.push('A card is missing its ID.'); continue; }
      if (ids.has(node.id)) issues.push(`Duplicate card ID: ${node.id}`);
      ids.add(node.id);
      if (node.type === 'file' && !this.app.vault.getAbstractFileByPath(node.file)) issues.push(`Missing note card target: ${node.file}`);
    }
    const edgeIds = new Set();
    for (const edge of data.edges) {
      if (edgeIds.has(edge.id)) issues.push(`Duplicate connection ID: ${edge.id}`);
      edgeIds.add(edge.id);
      if (!ids.has(edge.fromNode)) issues.push(`Connection ${edge.id} has a missing source card.`);
      if (!ids.has(edge.toNode)) issues.push(`Connection ${edge.id} has a missing target card.`);
    }
    new CanvasReportModal(this.app, `Canvas review: ${file.basename}`, issues).open();
  }

  async suggestCurrentCanvasLinks() {
    const canvasFile = this.getCanvasFile();
    if (!canvasFile) { new Notice('Open a Canvas file first.'); return; }
    let data;
    try { data = JSON.parse(await this.app.vault.cachedRead(canvasFile)); } catch { new Notice('This Canvas file contains invalid JSON.'); return; }
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const edges = Array.isArray(data.edges) ? data.edges : [];
    const source = nodes.map(node => node.type === 'text' ? node.text : node.type === 'file' ? node.file.split('/').pop().replace(/\.md$/i, '') : node.type === 'group' ? node.label || '' : '').join(' ');
    const existing = new Set(nodes.filter(node => node.type === 'file').map(node => node.file.toLocaleLowerCase()));
    const sourceTerms = words(source);
    const suggestions = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (existing.has(file.path.toLocaleLowerCase())) continue;
      const content = await this.app.vault.cachedRead(file);
      const terms = words(`${file.basename}\n${content}`);
      const shared = [...terms].filter(term => sourceTerms.has(term));
      const score = shared.length / Math.max(1, Math.sqrt(sourceTerms.size * terms.size));
      if (score <= 0.015) continue;
      let anchorId = null;
      let anchorScore = -1;
      for (const node of nodes.filter(item => item.type === 'text' || item.type === 'file')) {
        const label = node.type === 'text' ? node.text : node.file.split('/').pop();
        const localTerms = words(label);
        const common = [...terms].filter(term => localTerms.has(term)).length;
        if (common > anchorScore) { anchorId = node.id; anchorScore = common; }
      }
      suggestions.push({ file, shared, score, anchorId });
    }
    suggestions.sort((a, b) => b.score - a.score);
    new CanvasSuggestionsModal(this.app, canvasFile, suggestions.slice(0, 12), async (note, anchorId) => {
      const latest = JSON.parse(await this.app.vault.read(canvasFile));
      latest.nodes = Array.isArray(latest.nodes) ? latest.nodes : [];
      latest.edges = Array.isArray(latest.edges) ? latest.edges : [];
      if (latest.nodes.some(node => node.type === 'file' && node.file.toLocaleLowerCase() === note.path.toLocaleLowerCase())) return;
      const id = window.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const right = latest.nodes.reduce((max, node) => Math.max(max, (Number(node.x) || 0) + (Number(node.width) || 0)), 0);
      const row = latest.nodes.filter(node => node.x === right).length;
      latest.nodes.push({ id, type: 'file', file: note.path, x: right + 120, y: row * 220, width: 260, height: 180 });
      if (anchorId && latest.nodes.some(node => node.id === anchorId)) latest.edges.push({ id: window.crypto.randomUUID().replace(/-/g, '').slice(0, 16), fromNode: anchorId, toNode: id, toEnd: 'arrow' });
      await this.app.vault.modify(canvasFile, JSON.stringify(latest, null, 2) + '\n');
    }).open();
  }

  async showOverview() {
    const files = this.app.vault.getMarkdownFiles();
    const empty = [];
    for (const file of files) if (!(await this.app.vault.cachedRead(file)).trim()) empty.push(file.basename);
    new Notice(`Vault: ${files.length} Markdown notes · ${empty.length} empty notes`, 7000);
  }

  async suggestCurrentLinks() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const source = view?.file;
    if (!source) { new Notice('Open a Markdown note first.'); return; }
    const text = await this.app.vault.cachedRead(source);
    const existing = new Set(wikilinks(text));
    const suggestions = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === source.path || existing.has(file.path.replace(/\.md$/i, '').toLocaleLowerCase()) || existing.has(file.basename.toLocaleLowerCase())) continue;
      const candidateText = await this.app.vault.cachedRead(file);
      const score = bodyScore(`${source.basename}\n${text}`, `${file.basename}\n${candidateText}`);
      if (score > 0.015) {
        const left = words(`${source.basename}\n${text}`);
        const shared = [...words(`${file.basename}\n${candidateText}`)].filter(word => left.has(word));
        suggestions.push({ file, score, shared });
      }
    }
    suggestions.sort((a, b) => b.score - a.score);
    new SuggestionModal(this.app, suggestions.slice(0, 12), source, async file => {
      const latest = await this.app.vault.read(source);
      const relatedHeading = /^## Related notes\s*$/m;
      const linkLine = `- [[${file.path.replace(/\.md$/i, '')}]]`;
      if (wikilinks(latest).includes(file.path.replace(/\.md$/i, '').toLocaleLowerCase())) return;
      if (relatedHeading.test(latest)) {
        const heading = latest.match(relatedHeading);
        const at = heading.index + heading[0].length;
        const updated = `${latest.slice(0, at)}\n${linkLine}${latest.slice(at)}`;
        await this.app.vault.modify(source, updated);
      } else {
        const separator = latest.endsWith('\n') ? '\n' : '\n\n';
        await this.app.vault.modify(source, `${latest}${separator}## Related notes\n${linkLine}\n`);
      }
    }).open();
  }

  async inspectCleanup() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!file) { new Notice('Open a Markdown note first.'); return; }
    const content = await this.app.vault.cachedRead(file);
    const issues = [];
    const links = wikilinks(content);
    const paths = new Set(this.app.vault.getMarkdownFiles().map(item => item.path.replace(/\.md$/i, '').toLocaleLowerCase()));
    const titles = new Set(this.app.vault.getMarkdownFiles().map(item => item.basename.toLocaleLowerCase()));
    for (const target of links) if (!paths.has(target) && !titles.has(target.split('/').pop())) issues.push(`Broken wiki link: [[${target}]]`);
    if (/^#{1,6}\s*$/m.test(content)) issues.push('Empty heading found.');
    if (/\n{3,}/.test(content)) issues.push('Three or more consecutive line breaks found.');
    if (content.length && !content.endsWith('\n')) issues.push('Missing final newline.');
    const cleaned = content.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
    const hasSpacingFix = cleaned !== content;
    new CleanupModal(this.app, file, issues, hasSpacingFix, async () => {
      const latest = await this.app.vault.read(file);
      const latestCleaned = latest.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
      if (latestCleaned !== latest) await this.app.vault.modify(file, latestCleaned);
    }).open();
  }

  searchNotes() {
    new TextEntryModal(this.app, 'Search the vault', 'Words to search for', async query => {
      const terms = [...words(query)];
      const results = [];
      for (const file of this.app.vault.getMarkdownFiles()) {
        const content = await this.app.vault.cachedRead(file);
        const hay = `${file.basename}\n${content}`.toLocaleLowerCase();
        const hits = terms.filter(term => hay.includes(term));
        if (hits.length) {
          const index = hay.indexOf(hits[0]);
          results.push({ file, hits: hits.length, preview: content.slice(Math.max(0, index - 50), index + 130).replace(/\n/g, ' ').trim() });
        }
      }
      results.sort((a, b) => b.hits - a.hits);
      new SearchModal(this.app, results.slice(0, 25)).open();
    }).open();
  }

  createNote() {
    new TextEntryModal(this.app, 'Create a note', 'Write the note content. The file name will be the first heading.', async content => {
      const heading = content.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim();
      if (!heading) { new Notice('Add a title or some content first.'); return; }
      const safe = heading.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
      const path = `${safe}.md`;
      if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`A note already exists at ${path}`); return; }
      const body = content.startsWith('#') ? content : `# ${heading}\n\n${content}`;
      const file = await this.app.vault.create(path, body.endsWith('\n') ? body : `${body}\n`);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Created ${path}`);
    }).open();
  }

  createCanvas() {
    new TextEntryModal(this.app, 'Create a Canvas', 'Write the first card or a short Canvas outline', async content => {
      const title = content.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim();
      if (!title) { new Notice('Add some text first.'); return; }
      const safe = title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
      const path = `${safe}.canvas`;
      if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`A file already exists at ${path}`); return; }
      const data = { nodes: [{ id: window.crypto.randomUUID().replace(/-/g, '').slice(0, 16), type: 'text', text: content, x: 0, y: 0, width: 280, height: 180 }], edges: [] };
      const file = await this.app.vault.create(path, JSON.stringify(data, null, 2) + '\n');
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Created ${path}`);
    }).open();
  }
};
