/**
 * Writes `docs/ROUTE-MAP.md` and `docs/route-map.xml` from `src/pages/`.
 *
 *   npm run route-map
 *
 * Run it after adding, moving, or deleting a page. `npm test` fails until you
 * do, which is the whole point: the map cannot quietly fall behind the code.
 */
import { writeFileSync } from "node:fs";

import { buildRouteMap, toMarkdown, toXml } from "../src/lib/route-map.ts";
import { CMS_VERSION } from "../src/lib/version.ts";

const routes = buildRouteMap();

writeFileSync("docs/ROUTE-MAP.md", toMarkdown(routes, CMS_VERSION.version));
writeFileSync("docs/route-map.xml", toXml(routes, CMS_VERSION.version));

console.log(`route-map: ${routes.length} routes → docs/ROUTE-MAP.md, docs/route-map.xml`);
