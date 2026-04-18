# meetingfocus-site

Static marketing site for the MeetingFocus Chrome extension, served at https://meetingfocus.app.

Two pages, plain HTML, no build step:

- `index.html` — landing page (hero, features, pricing, footer)
- `privacy.html` — privacy policy (URL submitted to the Chrome Web Store)

## Deploy to GitHub Pages with the meetingfocus.app custom domain

1. Create a new public repo on GitHub named `meetingfocus-site` under your account or the Loophead Labs org.
2. From this folder:
   ```
   git init
   git add .
   git commit -m "Initial site: landing + privacy"
   git branch -M main
   git remote add origin git@github.com:<your-account>/meetingfocus-site.git
   git push -u origin main
   ```
3. In the GitHub repo: **Settings → Pages**.
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Custom domain: enter `meetingfocus.app`, click Save. Tick **Enforce HTTPS** once the cert provisions (usually a minute or two).
4. At your DNS provider for `meetingfocus.app`, add either:
   - An **ALIAS / ANAME** record on the apex pointing to `<your-account>.github.io`, OR
   - Four **A** records on the apex pointing to GitHub Pages IPs:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - And optionally a **CNAME** record for `www` pointing to `<your-account>.github.io`.
5. The `CNAME` file in this repo tells GitHub which domain to bind. The `.nojekyll` file tells GitHub to skip Jekyll processing (faster deploys, supports filenames starting with `_`).

DNS can take a few minutes to propagate. Once it does, https://meetingfocus.app will serve `index.html` and https://meetingfocus.app/privacy.html will serve the privacy policy. That second URL is what goes into the Chrome Web Store "Privacy policy URL" field.

## Local preview

```
cd meetingfocus-site
python3 -m http.server 4000
```

Open http://localhost:4000 in your browser.

## Editing copy

Both pages are single self-contained HTML files with inline `<style>` blocks. Edit the HTML directly — there is no build step, no framework, no dependencies.
