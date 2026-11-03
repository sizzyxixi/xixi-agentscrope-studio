import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { flattenMenuChildren, menuNodeKind } from '../components/hero-ui/menu-collection.ts';

const Item = () => null;
test('menu entries retain unique keys across conditional and nested fragments', () => {
  const children = [h(Item, null, '引用'), h(Item, null, '编辑'), h(Fragment, null, h(Item, null, '分隔'), h(Item, null, '删除')), h(Fragment, null, h(Fragment, null, h(Item, null, '恢复')))];
  const nodes = flattenMenuChildren(children);
  assert.deepEqual(nodes.map(node => node.props.children), ['引用', '编辑', '分隔', '删除', '恢复']);
  assert.equal(new Set(nodes.map(node => node.key)).size, nodes.length);
  assert.deepEqual(flattenMenuChildren(children).map(node => node.key), nodes.map(node => node.key));
});
test('absent conditional groups do not add menu entries', () => {
  const nodes = flattenMenuChildren([h(Item, null, '编辑'), false, null]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].props.children, '编辑');
});

test('separator classification survives replacement of component identities', () => {
  const Original = Object.assign(() => null, { menuKind: 'separator' });
  const Refreshed = Object.assign(() => null, { menuKind: 'separator' });
  assert.notEqual(Original, Refreshed);
  const [node] = flattenMenuChildren(h(Fragment, null, h(Refreshed)));
  assert.equal(menuNodeKind(node), 'separator');
  assert.equal(menuNodeKind(h(Item, null, '删除')), undefined);
});
