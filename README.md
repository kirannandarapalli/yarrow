# Yarrow

Yarrow is a Manifest V3 browser extension that blocks ads, pop-unders, and trackers, hides cookie and signup popups, and warns you when a site looks malicious.

It runs in Chromium browsers that support Manifest V3: Chrome, Edge, Brave, and similar. It is not a Firefox extension.

## Install

1. Download or clone this folder.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Choose this folder (the one that contains `manifest.json`).

The Yarrow icon appears in the toolbar. Pin it if you do not see it.

After you pull new code, open `chrome://extensions` and click **Reload** on Yarrow, then refresh any open tabs. A page refresh alone keeps the previous copy of the extension running.

## Use it

Click the toolbar icon.

- The big switch turns blocking **on or off for the current site**. Off means this site is paused.
- The number is how many requests Yarrow blocked on this page.
- **Hide an element** lets you click something on the page and hide it on that site until you remove it.
- **More options** holds the rest of the controls.

The toolbar icon matches the site:

| Icon | Meaning |
| --- | --- |
| Green, ON | Blocking is on for this site |
| Gray, OFF | This site is paused, or Block ads is off |
| Red, ! | The site looks malicious |

Sun and moon in the popup switch light and dark mode. The choice is saved on this browser.

### More options

| Control | What it does |
| --- | --- |
| Block ads | Stops ad requests, hidden ad clicks, and pop-under scripts |
| Stop tracking | Blocks common analytics and tracker requests |
| Security alerts | Turns the icon red and sends a notification on a suspicious site |
| Cookie popups | Hides cookie banners and newsletter prompts |
| Video ads | Tries to skip in-player ads, including on YouTube |
| Banners | Hides display ads, sponsored boxes, and sticky ad bars |
| Lists | Block a domain the built-in lists miss, or allow one that should load |

Pausing a site leaves security alerts on. The other blockers pause with the site.

## What it loads

Yarrow keeps your lists, pauses, and hidden elements in the browser. It does not send your browsing history to a Yarrow server.

About every 12 hours it downloads:

- [EasyList](https://easylist.to/easylist/easylist.txt) for ads
- [EasyPrivacy](https://easylist.to/easylist/easyprivacy.txt) for trackers
- A cookie-banner list, from Fanboy’s Cookie List, with the uBlock Origin cookie list as a fallback
- [OpenPhish](https://openphish.com/) URLs and [URLhaus](https://urlhaus.abuse.ch/) hosts for the malicious-site warning

Those lists are maintained by other people. Yarrow applies a capped subset of them.

## Develop

You need Node.js 18 or newer.

```bash
npm test
npm run build:rules
```

`npm test` runs the unit tests. `npm run build:rules` rewrites `rules/ads.json` and `rules/trackers.json` from the built-in domain lists. Do not edit those JSON files by hand.

There is no separate build step for the extension. Load this folder unpacked.

## Limits

- YouTube can still show an ad image for a moment before the video. That part is unfinished.
- Some sites lock scrolling or hide the article when their ads are removed. Fixes for those belong in the content scripts, not in a longer block list.
- Chrome’s command line often ignores unpacked extensions. Install from `chrome://extensions` instead.

## License

[MIT](LICENSE)
