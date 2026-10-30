import { XMLParser } from 'fast-xml-parser';

/** Uzol XML stromu v režime `preserveOrder` (ADR 0004). Knižnica sa používa len v tomto súbore. */
export interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  readonly text: string;
}

type RawNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  processEntities: true,
});

function toNode(raw: RawNode): XmlNode | undefined {
  const name = Object.keys(raw).find((k) => k !== ':@');
  if (name === undefined || name === '#text' || name.startsWith('?')) return undefined;
  const rawChildren = (raw[name] ?? []) as RawNode[];
  const children: XmlNode[] = [];
  let text = '';
  for (const c of rawChildren) {
    if ('#text' in c) text += String(c['#text']);
    else {
      const n = toNode(c);
      if (n) children.push(n);
    }
  }
  const attributes = (raw[':@'] ?? {}) as Record<string, string>;
  return { name, attributes, children, text };
}

/** Rozparsuje XML na strom; pri neplatnom XML vyhodí výnimku s popisom. */
export function parseXml(xml: string): XmlNode[] {
  const raw = parser.parse(xml, true) as RawNode[];
  return raw.map(toNode).filter((n): n is XmlNode => n !== undefined);
}

export const childrenNamed = (node: XmlNode, name: string): XmlNode[] =>
  node.children.filter((c) => c.name === name);

export const childNamed = (node: XmlNode, name: string): XmlNode | undefined =>
  node.children.find((c) => c.name === name);
