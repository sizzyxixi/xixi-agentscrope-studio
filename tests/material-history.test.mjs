import test from 'node:test';
import assert from 'node:assert/strict';
import { historyFileType, groupHistoryByDay, matchesHistoryType } from '../app/material-history.ts';
const media = (id, createdAt, name = 'file.txt', type = 'document') => ({ id, createdAt, name, type, url: '/file.txt', source: '对话创作' });
test('history separates documents from audio, archives and other files', () => {
  for (const name of ['report.PDF', 'plan.docx', 'table.xlsx', 'deck.pptx', 'notes.md', 'data.csv']) assert.equal(historyFileType(media(name, '', name)), '文档');
  for (const name of ['archive.zip', 'voice.mp3', 'payload.json', 'debug.log']) assert.equal(historyFileType(media(name, '', name)), '其他');
  assert.equal(historyFileType(media('image', '', 'visual.png', 'image')), '图片');
  assert.equal(historyFileType(media('video', '', 'clip.mp4', 'video')), '视频');
});
test('day groups use China time, including midnight boundaries and older years', () => {
  const now = Date.parse('2026-11-03T02:00:00Z');
  const items = [media('yesterday', '2026-11-02T15:59:59Z'), media('today', '2026-11-02T16:00:00Z'), media('older', '2025-10-01T03:00:00Z')];
  const groups = groupHistoryByDay(items, false, now);
  assert.deepEqual(groups.map(g => g.label), ['今天', '昨天', '2025 年 10 月 1 日']);
  assert.deepEqual(groups.map(g => g.media[0].id), ['today', 'yesterday', 'older']);
  assert.deepEqual(groupHistoryByDay(items, true, now).map(g => g.media[0].id), ['older', 'yesterday', 'today']);
});
test('items from the same day share one section without loss or duplication', () => {
  const items = [media('one', '2026-11-03T01:00:00Z'), media('two', '2026-11-03T02:00:00Z')];
  const groups = groupHistoryByDay(items);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].media.map(m => m.id), ['one', 'two']);
  assert.deepEqual(groupHistoryByDay([]), []);
});

test('all includes exactly the union of image, video, document and other categories', () => {
  const items = [media('image', '2026-11-03', 'image.png', 'image'), media('video', '2026-11-03', 'video.mp4', 'video'), media('doc', '2026-11-03', 'doc.pdf'), media('zip', '2026-11-03', 'asset.zip')];
  const all = items.filter(item => matchesHistoryType(item, '全部'));
  const categories = ['图片', '视频', '文档', '其他'].flatMap(type => items.filter(item => matchesHistoryType(item, type)));
  assert.deepEqual(new Set(all.map(item => item.id)), new Set(categories.map(item => item.id)));
  assert.equal(all.length, categories.length);
});
