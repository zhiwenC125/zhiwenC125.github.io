# Personal Blog

Hexo-powered blog with custom academic theme.

**Live:** https://zhiwenc125.github.io

## Write a New Post

```bash
npx hexo new "文章标题"
```

This creates `source/_posts/文章标题.md`. Edit it, then push:

```bash
git add . && git commit -m "new post" && git push
```

Done. GitHub Actions auto-builds and deploys.

## Local Preview

```bash
npx hexo server
```

Open http://localhost:4000

## Structure

```
source/
├── _posts/          ← Blog posts (Markdown)
│   └── hello-world.md
├── about/index.md   ← About page
├── RTOS_sim/        ← Interactive RTOS simulator
└── avatar.jpg       ← Profile photo
themes/academic/     ← Custom theme
```
