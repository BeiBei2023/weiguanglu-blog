"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "cmdk";
import MiniSearch from "minisearch";
import { Search as SearchIcon } from "lucide-react";
import { createSearchOptions, SEARCH_OPTIONS, type SearchDoc } from "@/lib/search/options";

interface SearchHit {
  id: string;
  title?: string;
  tags?: string;
  description?: string;
  score: number;
}

const NAV_ITEMS = [
  { id: "nav-home", label: "首页", href: "/" },
  { id: "nav-tags", label: "标签", href: "/tags" },
  { id: "nav-about", label: "关于", href: "/about" },
];

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground";
const ITEM_CLASS =
  "flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground";

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [publicIndex, setPublicIndex] = useState<MiniSearch<SearchDoc> | null>(null);
  const [privateIndex, setPrivateIndex] = useState<MiniSearch<SearchDoc> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let pub: MiniSearch<SearchDoc> | null = null;
      let priv: MiniSearch<SearchDoc> | null = null;
      try {
        const res = await fetch("/api/search/public-index");
        if (res.ok) {
          pub = MiniSearch.loadJSON<SearchDoc>(await res.text(), createSearchOptions());
        }
      } catch {
        // 索引不可用时静默降级
      }
      try {
        const res = await fetch("/api/search/private-index");
        if (res.ok) {
          priv = MiniSearch.loadJSON<SearchDoc>(await res.text(), createSearchOptions());
        }
      } catch {
        // 未登录或索引不可用：忽略
      }
      if (!cancelled) {
        setPublicIndex(pub);
        setPrivateIndex(priv);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 打开时锁背景滚动
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const results = useMemo<SearchHit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const hitOptions = { ...SEARCH_OPTIONS };
    const merged = [
      ...(publicIndex?.search(q, hitOptions) ?? []),
      ...(privateIndex?.search(q, hitOptions) ?? []),
    ] as unknown as SearchHit[];
    const seen = new Set<string>();
    return merged
      .sort((a, b) => b.score - a.score)
      .filter((hit) => {
        const id = String(hit.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 12);
  }, [query, publicIndex, privateIndex]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        aria-label="搜索"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/30 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary sm:w-44 sm:justify-start sm:px-3 md:w-56 lg:w-72"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left text-sm text-muted-foreground/80 sm:inline">
          搜索文章…
        </span>
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[14vh] backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
            <div
              className="glass-modal w-full max-w-lg overflow-hidden rounded-2xl text-popover-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <Command shouldFilter={false} label="搜索">
                <CommandInput
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="搜索文章…"
                  className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <CommandList className="max-h-80 overflow-y-auto p-2">
                  <CommandEmpty className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {query.trim() ? "没有找到相关文章" : ""}
                  </CommandEmpty>

                  {!query.trim() && (
                    <CommandGroup heading="页面" className={GROUP_CLASS}>
                      {NAV_ITEMS.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id}
                          onSelect={() => go(item.href)}
                          className={ITEM_CLASS}
                        >
                          {item.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.length > 0 && (
                    <CommandGroup heading="文章" className={GROUP_CLASS}>
                      {results.map((hit) => (
                        <CommandItem
                          key={String(hit.id)}
                          value={String(hit.id)}
                          onSelect={() => go(`/posts/${hit.id}`)}
                          className={ITEM_CLASS}
                        >
                          <span className="min-w-0 truncate">{hit.title ?? String(hit.id)}</span>
                          {hit.tags && (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {hit.tags}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
