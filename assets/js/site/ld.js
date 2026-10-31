// The site's JSON-LD @graph: Person, WebSite, an ItemList of the real films (creativeWorkLD) and the
// reel's VideoObject. Pure (Node-safe); imports ./html.js, never ./render.js. tools/prerender.mjs writes
// it into index.html's <script id="ld-person"> and main.js sets the same there, so the two never differ.
//
// Nodes refer to each other by @id (the person is <site url>#person). Sample films never enter the
// ItemList (they carry noindex), and the VideoObject appears only once reel-data.js can describe a real
// reel (a poster and an upload date).

import { personLD, creativeWorkLD } from './html.js';
import { videoObjectLD } from './reel-data.js';

/** A builder's object as a node of the graph: the graph's own @context covers it. */
const node = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== '@context'));

/** The @graph object for index.html. */
export function siteLD(data) {
  const url = data.site?.url;
  const person = { '@type': 'Person', '@id': `${url}#person`, ...node(personLD(data)) };
  const website = {
    '@type': 'WebSite', '@id': `${url}#website`, url, name: data.person?.name, description: data.site?.description,
    inLanguage: data.site?.lang, publisher: { '@id': person['@id'] },
  };
  const real = (data.films ?? []).filter(f => f?.slug && f.placeholder !== true);
  const work = real.length ? {
    '@type': 'ItemList', '@id': `${url}#work`, name: 'Selected work', numberOfItems: real.length,
    itemListElement: real.map((f, i) => ({ '@type': 'ListItem', position: i + 1, item: node(creativeWorkLD(f, data)) })),
  } : null;
  const video = videoObjectLD(data);
  return { '@context': 'https://schema.org', '@graph': [person, website, work, video && node(video)].filter(Boolean) };
}
