/**
 * ClawPad v2 — File System Smoke Test
 *
 * Run with: npx tsx src/lib/files/__tests__/smoke.ts
 *
 * Uses a temporary directory via CLAWPAD_OPENCLAW_DIR env var
 * to avoid touching real ~/.openclaw/pages/.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ── Set up temp directory BEFORE importing anything else ────────────────────
const TEST_DIR = path.join(os.tmpdir(), `clawpad-test-${Date.now()}`);
process.env.CLAWPAD_OPENCLAW_DIR = TEST_DIR;

// Now import (these will use the env var)
import {
  ensureDirectories,
  bootstrapWorkspace,
  isWorkspaceBootstrapped,
  listSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  readPage,
  writePage,
  listPages,
  listAllPages,
  deletePage,
  movePage,
  getRecentPages,
  searchPages,
} from '../operations';

import { validatePath, titleToSlug, getSpaceName, ensureMdExtension, getPagesDir, getTrashDir } from '../paths';
import { parseFrontmatter, serializeFrontmatter, extractTitle } from '../frontmatter';
import { FileSystemError } from '../types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

async function assertThrows(fn: () => Promise<unknown>, code: string, message: string): Promise<void> {
  try {
    await fn();
    failed++;
    console.log(`  ❌ ${message} (did not throw)`);
  } catch (err) {
    if (err instanceof FileSystemError && err.code === code) {
      passed++;
      console.log(`  ✅ ${message}`);
    } else {
      failed++;
      console.log(`  ❌ ${message} (wrong error: ${err})`);
    }
  }
}

async function cleanup(): Promise<void> {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const pagesDir = getPagesDir();
  const trashDir = getTrashDir();

  console.log(`\n🧪 ClawPad File System — Smoke Tests`);
  console.log(`   Test dir: ${TEST_DIR}`);
  console.log(`   Pages:    ${pagesDir}`);
  console.log(`   Trash:    ${trashDir}\n`);

  try {
    // ── Path Utilities ────────────────────────────────────────────────────
    console.log('📂 Path Utilities');
    assert(validatePath('daily-notes/test.md') === true, 'Valid path accepted');
    assert(validatePath('../escape.md') === false, 'Path traversal rejected');
    assert(validatePath('/absolute/path.md') === false, 'Absolute path rejected');
    assert(validatePath('normal/../escape') === false, 'Embedded traversal rejected');
    assert(validatePath('') === false, 'Empty path rejected');
    assert(titleToSlug('My Cool Project!') === 'my-cool-project', 'Title slugified');
    assert(titleToSlug('VoiceBench v3') === 'voicebench-v3', 'Title with version slugified');
    assert(getSpaceName('daily-notes/2026-02-04.md') === 'daily-notes', 'Space name extracted');
    assert(ensureMdExtension('test') === 'test.md', 'Extension added');
    assert(ensureMdExtension('test.md') === 'test.md', 'Extension not doubled');
    console.log('');

    // ── Frontmatter ───────────────────────────────────────────────────────
    console.log('📝 Frontmatter');
    const testMd = `---
title: Test Page
icon: 🧪
created: 2026-02-04T00:00:00Z
modified: 2026-02-04T01:00:00Z
tags: [test, smoke]
---

# Test Page

Some content here.`;

    const { meta, content } = parseFrontmatter(testMd);
    assert(meta.title === 'Test Page', 'Title parsed');
    assert(meta.icon === '🧪', 'Icon parsed');
    assert(meta.tags?.length === 2, 'Tags parsed');
    assert(content.includes('Some content here.'), 'Content parsed');

    const serialized = serializeFrontmatter('Hello world', { title: 'Hi', modified: '2026-01-01T00:00:00Z' });
    assert(serialized.includes('title: Hi'), 'Frontmatter serialized');
    assert(serialized.includes('Hello world'), 'Content preserved in serialization');

    assert(extractTitle('# My Heading\n\nBody text', 'fallback.md') === 'My Heading', 'Title from heading');
    assert(extractTitle('No heading here', 'my-file.md') === 'My File', 'Title from filename');
    console.log('');

    // ── Directories & Bootstrap ───────────────────────────────────────────
    console.log('🏗️  Bootstrap');
    await ensureDirectories();
    assert(await fileExists(pagesDir), 'Pages directory created');
    assert(await fileExists(trashDir), 'Trash directory created');

    assert(await isWorkspaceBootstrapped() === false, 'Workspace not bootstrapped initially');

    await bootstrapWorkspace();
    assert(await isWorkspaceBootstrapped() === true, 'Workspace bootstrapped');
    assert(await fileExists(path.join(pagesDir, 'daily-notes', '_space.yml')), 'daily-notes/_space.yml created');
    assert(await fileExists(path.join(pagesDir, 'projects', '_space.yml')), 'projects/_space.yml created');
    assert(await fileExists(path.join(pagesDir, 'knowledge-base', '_space.yml')), 'knowledge-base/_space.yml created');
    assert(await fileExists(path.join(pagesDir, 'knowledge-base', 'welcome.md')), 'welcome.md created');
    console.log('');

    // ── Spaces ────────────────────────────────────────────────────────────
    console.log('📁 Spaces');
    const spaces = await listSpaces();
    assert(spaces.length === 3, `Listed 3 spaces (got ${spaces.length})`);
    assert(spaces.some((s) => s.path === 'daily-notes'), 'daily-notes space exists');
    assert(spaces.some((s) => s.icon === '📝'), 'Space icon loaded from _space.yml');

    const dailyNotes = await getSpace('daily-notes');
    assert(dailyNotes !== null, 'getSpace returns daily-notes');
    assert(dailyNotes?.sort === 'date-desc', 'Space sort order loaded');

    const newSpace = await createSpace('scratch', { name: 'Scratch Pad', icon: '📎', color: '#FF6B35' });
    assert(newSpace.name === 'Scratch Pad', 'New space created');
    assert(newSpace.pageCount === 0, 'New space has 0 pages');

    const updated = await updateSpace('scratch', { icon: '📌' });
    assert(updated.icon === '📌', 'Space metadata updated');
    assert(updated.name === 'Scratch Pad', 'Space name preserved after update');

    await assertThrows(() => createSpace('scratch'), 'ALREADY_EXISTS', 'Duplicate space rejected');

    const spaceCount = (await listSpaces()).length;
    assert(spaceCount === 4, `Now 4 spaces (got ${spaceCount})`);
    console.log('');

    // ── Pages ─────────────────────────────────────────────────────────────
    console.log('📄 Pages');
    const pageMeta = await writePage('scratch/my-test.md', '\n# Test Note\n\nThis is a test note.', {
      title: 'Test Note',
      icon: '🧪',
      tags: ['test'],
    });
    assert(pageMeta.title === 'Test Note', 'Page written with title');
    assert(pageMeta.space === 'scratch', 'Page space detected');
    assert(pageMeta.path === 'scratch/my-test.md', 'Page path correct');

    const page = await readPage('scratch/my-test.md');
    assert(page.meta.title === 'Test Note', 'Page read back — title matches');
    assert(page.content.includes('This is a test note.'), 'Page read back — content matches');
    assert(page.meta.icon === '🧪', 'Page read back — icon matches');
    assert(page.raw.includes('---'), 'Raw content includes frontmatter');

    // Write a second page
    await writePage('scratch/another.md', '\n# Another Page\n\nMore content.');

    const scratchPages = await listPages('scratch');
    assert(scratchPages.length === 2, `Listed 2 scratch pages (got ${scratchPages.length})`);

    const allPages = await listAllPages();
    assert(allPages.length >= 4, `Listed all pages (got ${allPages.length}, expected >= 4)`);

    const recentPages = await getRecentPages(3);
    assert(recentPages.length === 3, `Got 3 recent pages (got ${recentPages.length})`);

    // Update existing page (preserves created timestamp)
    const originalCreated = pageMeta.created;
    await new Promise((r) => setTimeout(r, 50));
    const updatedMeta = await writePage('scratch/my-test.md', '\n# Test Note\n\nUpdated content.');
    assert(updatedMeta.created === originalCreated, 'Created timestamp preserved on update');

    const updatedPage = await readPage('scratch/my-test.md');
    assert(updatedPage.content.includes('Updated content.'), 'Updated content saved');
    console.log('');

    // ── Move/Rename ───────────────────────────────────────────────────────
    console.log('🔄 Move/Rename');
    await movePage('scratch/another.md', 'scratch/renamed.md');
    await assertThrows(() => readPage('scratch/another.md'), 'NOT_FOUND', 'Old path gone after move');
    const movedPage = await readPage('scratch/renamed.md');
    assert(movedPage.content.includes('More content.'), 'Moved page content preserved');
    console.log('');

    // ── Search ────────────────────────────────────────────────────────────
    console.log('🔍 Search');
    const results = await searchPages('Updated content');
    assert(results.length >= 1, `Search found results (got ${results.length})`);
    assert(results[0].snippet.length > 0, 'Search result has snippet');

    const scopedResults = await searchPages('Welcome', { space: 'knowledge-base' });
    assert(scopedResults.length >= 1, `Scoped search found results (got ${scopedResults.length})`);

    const noResults = await searchPages('xyznonexistent12345');
    assert(noResults.length === 0, 'No results for gibberish query');
    console.log('');

    // ── Delete (Trash) ────────────────────────────────────────────────────
    console.log('🗑️  Delete (Trash)');
    await deletePage('scratch/my-test.md');
    await assertThrows(() => readPage('scratch/my-test.md'), 'NOT_FOUND', 'Deleted page not readable');

    const trashEntries = await fs.readdir(trashDir);
    assert(trashEntries.some((e) => e.includes('my-test.md')), 'Deleted page in trash');

    await deleteSpace('scratch');
    const spaceAfterDelete = await getSpace('scratch');
    assert(spaceAfterDelete === null, 'Deleted space not found');
    const trashAfter = await fs.readdir(trashDir);
    assert(trashAfter.length >= 2, 'Deleted space also in trash');
    console.log('');

    // ── Edge Cases ────────────────────────────────────────────────────────
    console.log('⚠️  Edge Cases');
    await assertThrows(() => readPage('../../../etc/passwd'), 'PATH_TRAVERSAL', 'Path traversal blocked on read');
    await assertThrows(
      () => writePage('../../../tmp/evil.md', 'bad'),
      'PATH_TRAVERSAL',
      'Path traversal blocked on write',
    );
    await assertThrows(() => readPage('nonexistent/page.md'), 'NOT_FOUND', 'Missing page returns NOT_FOUND');
    await assertThrows(() => deletePage('nonexistent/page.md'), 'NOT_FOUND', 'Delete missing page returns NOT_FOUND');

    // Write page without explicit title (should extract from content)
    const autoTitleMeta = await writePage('knowledge-base/auto-title.md', '\n# Auto Detected Title\n\nBody.');
    assert(autoTitleMeta.title === 'Auto Detected Title', 'Title auto-extracted from heading');

    // Write page without heading (should use filename)
    const filenameTitleMeta = await writePage('knowledge-base/from-filename.md', '\nJust some body text.');
    assert(filenameTitleMeta.title === 'From Filename', 'Title derived from filename');
    console.log('');

  } finally {
    await cleanup();
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('─'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n💥 Smoke test crashed:', err);
  process.exit(1);
});
