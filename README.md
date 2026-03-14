# Personal Blog

Pure HTML/CSS static blog with Markdown support. No build tools, no dependencies.

**Live:** https://zhiwenc125.github.io

## Structure

```
├── index.html              # Homepage
├── about.html              # About page
├── css/style.css           # Global styles
├── blog/
│   ├── index.html          # Blog list
│   ├── post.html           # Markdown renderer
│   └── posts/              # ← Write Markdown files here
│       ├── hello-world.md
│       └── TEMPLATE.md     # Template for new posts
├── projects/
│   └── index.html          # Project showcase
├── RTOS_sim/               # Interactive RTOS simulator
└── .github/workflows/      # Auto deploy to GitHub Pages
```

## Write a New Post

1. Copy `blog/posts/TEMPLATE.md`, rename to `blog/posts/your-post.md`
2. Write your content in Markdown (supports frontmatter for title/date)
3. Add a link in `blog/index.html` and `index.html`:
   ```html
   <li><a href="post.html?p=your-post">
       <span class="post-title">Title</span>
       <span class="post-date">Date</span>
   </a></li>
   ```
4. `git add . && git commit -m "new post" && git push`

## Tech Stack

- HTML / CSS / Vanilla JS
- [marked.js](https://marked.js.org/) for Markdown rendering
- [highlight.js](https://highlightjs.org/) for code syntax highlighting
- Google Fonts: Noto Serif SC, Inter, JetBrains Mono
- GitHub Pages + GitHub Actions
