import { GitBranch, Users } from "lucide-react";
import { site } from "@/lib/site";
import { WidgetHeading } from "./widget-heading";

interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
}

let cache: { at: number; data: GithubUser | null } | null = null;
const TTL = 60 * 60 * 1000;

async function getGithubUser(): Promise<GithubUser | null> {
  if (!site.github) return null;
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "blog",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/users/${site.github}`, {
      headers,
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as GithubUser;
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // 失败时沿用上次成功的数据（若有），否则不渲染
    cache = { at: Date.now(), data: cache?.data ?? null };
    return cache.data;
  }
}

export async function GithubCardWidget() {
  const user = await getGithubUser();
  if (!user) return null;

  return (
    <section aria-label="GitHub">
      <WidgetHeading>GitHub</WidgetHeading>
      <a
        href={user.html_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatar_url}
          alt={user.login + " 的 GitHub 头像"}
          className="h-10 w-10 shrink-0 rounded-full border border-white/20"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name ?? user.login}</p>
          <p className="truncate text-xs text-muted-foreground">@{user.login}</p>
        </div>
      </a>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          {user.public_repos} 仓库
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {user.followers} 关注者
        </span>
      </div>
      {user.bio ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{user.bio}</p>
      ) : null}
    </section>
  );
}
