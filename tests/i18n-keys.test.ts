import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import en from '../messages/en.json';
import bn from '../messages/bn.json';

type Tree = { [key: string]: string | Tree };

function keysOf(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keysOf(value, `${prefix}${key}.`),
  );
}

function valueAt(tree: Tree, path: string): string {
  return path.split('.').reduce<string | Tree>((node, key) => (node as Tree)[key], tree) as string;
}

/** The ICU arguments a message uses ({stadium}, {count, plural, ...}), from the real ICU parser. */
function argsOf(message: string): string[] {
  const names = new Set<string>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      )
        names.add(el.value);
      else if (el.type === TYPE.select || el.type === TYPE.plural) {
        names.add(el.value);
        for (const opt of Object.values(el.options)) walk(opt.value);
      } else if (el.type === TYPE.tag) walk(el.children);
    }
  };
  walk(parse(message, { ignoreTag: true }));
  return [...names].sort();
}

describe('messages', () => {
  const enKeys = keysOf(en as Tree).sort();
  const bnKeys = keysOf(bn as Tree).sort();

  it('English and Bengali have exactly the same keys', () => {
    expect(bnKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !bnKeys.includes(k))).toEqual([]);
  });

  it('every message parses and uses the same ICU arguments in both languages', () => {
    const mismatched = enKeys.filter(
      (k) => argsOf(valueAt(en as Tree, k)).join() !== argsOf(valueAt(bn as Tree, k)).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('no message is empty', () => {
    const empty = [...enKeys.filter((k) => !valueAt(en as Tree, k).trim())];
    empty.push(...bnKeys.filter((k) => !valueAt(bn as Tree, k).trim()).map((k) => `bn:${k}`));
    expect(empty).toEqual([]);
  });
});
