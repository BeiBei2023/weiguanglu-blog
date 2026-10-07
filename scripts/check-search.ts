import MiniSearch from "minisearch";
import { getPublicIndexJson } from "../lib/search";
import { createSearchOptions, type SearchDoc } from "../lib/search/options";

const json = getPublicIndexJson();
const index = MiniSearch.loadJSON<SearchDoc>(json, createSearchOptions());

console.log(`公开索引大小: ${(json.length / 1024).toFixed(1)} KB`);
console.log(`收录文档数: ${index.documentCount}`);

const queries = ["固件", "klipper", "库存", "luckfox", "android", "嵌入式", "OTA", "环境监测"];
for (const q of queries) {
  const hits = index.search(q, { prefix: true, fuzzy: 0.2 }).slice(0, 3);
  console.log(`\n"${q}" → ${hits.length} 命中`);
  for (const hit of hits) {
    console.log(`   ${hit.id}  score=${hit.score.toFixed(2)}`);
  }
}
