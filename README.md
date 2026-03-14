# Personal Blog

Pure HTML/CSS static blog with academic fresh style. No build tools, no dependencies.

**Live:** https://zhiwenc125.github.io

## Structure

```
├── index.html            # Homepage
├── about.html            # About page
├── css/style.css         # Global styles
├── blog/
│   ├── index.html        # Blog list
│   ├── hello-world.html  # Posts
│   └── TEMPLATE.html     # Template for new posts
├── projects/
│   └── index.html        # Project showcase
├── RTOS_sim/             # Interactive RTOS simulator
└── .github/workflows/    # Auto deploy to GitHub Pages
```

## Write a New Post

1. Copy `blog/TEMPLATE.html`, rename to `blog/your-post.html`
2. Edit the title, date, and content
3. Add a link in `blog/index.html` and `index.html`
4. `git add . && git commit -m "new post" && git push`

## Customize

Edit the TODO markers in `index.html`, `about.html`, and other pages to fill in your personal info (name, bio, avatar, social links).

## Tech Stack

- HTML / CSS (no JavaScript framework)
- Google Fonts: Noto Serif SC, Inter, JetBrains Mono
- GitHub Pages + GitHub Actions (zero-config deploy)
