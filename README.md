# KwikModel.com

The KwikModel marketing site. One page, built around the "top secret / clearance required" idea:
a visitor sees a censored 3D house, can peek inside it with a lens, scrolls through what KwikModel
does on the record, meets the classified files, reads why the secrecy, and requests clearance.

Plain HTML, CSS and JavaScript. No build step and no CDN: everything it needs is in this repo.

## Run it

Any static file server works. It has to be served over http, not opened as a file, because the
scripts are ES modules.

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

To publish, upload the repo as it is to any static host (GitHub Pages, Netlify, Cloudflare Pages,
Azure Static Web Apps, S3).

## Where things are

| Path | What it is |
| --- | --- |
| `index.html` | All the markup and the page copy |
| `assets/js/content.js` | **The file to edit.** Settings and the step-by-step briefing |
| `assets/css/main.css` | Design tokens (colors, type, easing) at the top, then one block per section |
| `assets/js/main.js` | Opening sequence, the lens, scroll choreography, the declassify moment |
| `assets/js/scene.js` | The 3D sample house and the censor/reveal shader |
| `assets/js/files.js` | Builds the briefing cards from `content.js` |
| `assets/js/clearance.js` | The clearance form and its states |
| `assets/vendor/` | three.js, GSAP + ScrollTrigger, Lenis (pinned copies) |
| `assets/fonts/` | Archivo (display), Inter (body), JetBrains Mono (labels) |

## Adding the step-by-step feature overview

Open `assets/js/content.js` and edit the `FILES` list. Each entry is one card in the
"Classified" section:

```js
{
  teaser: 'The {5} that {8} your {6}.',   // before clearance; {n} is a redaction bar n characters wide
  title: 'Step headline',                  // after clearance
  body: 'One or two sentences on what the step does and why it matters.',
  points: ['Short detail', 'Short detail'],
  media: { type: 'image', src: 'assets/img/step-01.png', alt: 'What the picture shows' },
  // or  { type: 'video', src: 'assets/video/step-01.mp4', poster: 'assets/img/step-01.png' }
}
```

Add or remove entries freely. Numbering, the file count, the scroll length and the progress bar
all follow the list.

## The clearance flow

The form has five states, all in `index.html` under `#gate-card`: request, inbox, personal
(personal email addresses are offered a call or an NDA instead), pending and cleared.

Today it is a **front-end prototype**. With `CONFIG.clearanceEndpoint` left as `null`, nothing is
sent anywhere: a "Get cleared" button stands in for the emailed link, and the result is remembered
in the browser's `localStorage` so the cleared experience can be reviewed. "Reset clearance" in the
footer undoes it.

### Before real content goes in

This is a static site, so anything in it can be read by anyone who opens the browser's developer
tools, cleared or not. The redaction is a presentation, not protection. Before confidential
material is published:

1. Set `CONFIG.clearanceEndpoint` to a service that receives `{ email, agreed }`, records the
   pledge and emails the confirmation link.
2. Have that link return the visitor with a signed token, and verify it on a server.
3. Serve the real briefing (text, images, video) from that server only after the check passes,
   and load it in `files.js` in place of the static `FILES` list.

Also still to supply: the Confidentiality Terms text (`#terms-dialog` in `index.html`, or set
`CONFIG.termsUrl`), and the links for "Book a quick call", "Send me the NDA" and "Book a live demo"
(`callUrl`, `ndaUrl`, `demoUrl`).

## Design notes

- **Color**: KwikModel navy and gold. Tokens are at the top of `main.css`.
- **The sample house** is illustrative. Its room load bars and dimensions are not real project data.
- **Motion** respects "reduce motion": the opening sequence, smooth scrolling and scroll effects
  switch off and the page reads as a normal document. Without WebGL or JavaScript the page still
  shows its content.
- **Phones**: the workflow keeps its pinned scroll; the classified files become a swipeable row.

## Licences

three.js and Lenis are MIT. GSAP is under GreenSock's standard no-charge licence
(https://gsap.com/standard-license). Archivo, Inter and JetBrains Mono are under the SIL Open
Font License.
