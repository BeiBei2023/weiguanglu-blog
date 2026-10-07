import {
  getAllPosts,
  getAdjacentPosts,
  getReadingPosts,
  getTagCounts,
  groupByYear,
} from "../lib/content";

const all = getAllPosts();

const byVisibility = all.reduce<Record<string, number>>((acc, p) => {
  acc[p.visibility] = (acc[p.visibility] ?? 0) + 1;
  return acc;
}, {});

console.log(`文章总数: ${all.length}`);
console.log("可见性分布:", byVisibility);

const reading = getReadingPosts(false);
console.log("\n年份分组（未登录可见）:");
for (const g of groupByYear(reading)) console.log(`  ${g.year}: ${g.posts.length} 篇`);

console.log(
  "\n标签统计:",
  getTagCounts()
    .map((t) => `${t.tag}(${t.count})`)
    .join("  "),
);

console.log("\n列表（未登录）:");
for (const p of reading) {
  console.log(`  ${p.date}  ${p.slug.padEnd(38)}  [${p.tags.join(", ")}]`);
  console.log(`            ${p.title}`);
}

const newest = reading[0];
if (newest) {
  const { prev, next } = getAdjacentPosts(newest.slug, reading);
  console.log("\n相邻文章（以最新一篇为参照）:");
  console.log("  prev:", prev?.slug ?? "(无)");
  console.log("  next:", next?.slug ?? "(无)");
}

const loginView = getReadingPosts(true);
console.log(`\n登录后可见数量: ${loginView.length}（含 login 态）`);
