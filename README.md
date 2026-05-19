# Chord Trainer

A single-page web app for drilling piano chord recall using a MIDI keyboard. The app shows a chord name, you play it on your MIDI keyboard, and the app judges correct/incorrect. A metronome runs throughout to keep timing.

Built as plain HTML/CSS/JavaScript with no build step. Deploys directly to GitHub Pages.

## What it does

- Displays a chord name (e.g. "F# major", "G minor")
- Listens to your MIDI keyboard via the Web MIDI API
- Judges the answer by pitch class — any octave counts, and extra notes are forgiven by default (toggle strict mode if you want to require exactly three notes)
- Plays a metronome click with a 4-beat count-in before the first chord
- Shows live score, accuracy, and per-chord stats at the end of each session

## Chord pools

Choose one in the settings panel:

1. **Natural majors only** — C, D, E, F, G, A, B (7 chords)
2. **All majors** — adds Db, Eb, F#, Ab, Bb (12 chords)
3. **Natural minors only** — Cm, Dm, Em, Fm, Gm, Am, Bm (7 chords)
4. **All minors** — adds C#m, Ebm, F#m, G#m, Bbm (12 chords)
5. **Naturals (majors and minors)** — 14 chords
6. **Everything** — 24 chords

## How to connect a MIDI keyboard

1. Plug your MIDI keyboard into your computer (USB or via a MIDI interface). The OS should detect it as a MIDI device.
2. Open the app in Chrome or Edge.
3. Click **Connect MIDI**. The browser will ask for permission to use MIDI — allow it.
4. The status pill at the top right should now read "Connected: [device name]".
5. Pick a chord pool, set tempo and chord time, hit **Start**.
6. The metronome will tick four beats of count-in, then the first chord appears.

If you connect or disconnect MIDI devices after granting permission, the app picks up the changes automatically.

## Browser requirements

The Web MIDI API is supported natively in:

- **Chrome** (desktop and Android)
- **Edge** (desktop)
- **Opera**

**Safari** does not support Web MIDI by default. As of recent versions you can enable it under Develop → Experimental Features → "MIDI API", but support is incomplete and not recommended.

**Firefox** does not support Web MIDI.

If the app detects an unsupported browser, it shows a warning and disables the Connect button.

## Settings

All settings are saved in `localStorage` and restored on next visit.

| Setting | Range | Default |
| --- | --- | --- |
| Chord pool | 6 options | Everything |
| Tempo | 60–160 BPM | 90 |
| Time per chord | 1–5 seconds | 3 |
| Metronome on/off | toggle | on |
| Metronome volume | 0–100% | 50 |
| Strict mode (no extra notes) | toggle | off |
| Ding on correct answer | toggle | on |

## Detection rules

- All MIDI note-on events are tracked by pitch class (`note % 12`). So C3, C4, and C5 are all just "C".
- A chord is **correct** when all three required pitch classes of the displayed chord have been played within the time window.
- By default, **extra notes do not invalidate** a correct answer. Beginners can be forgiven for hitting an extra key on the way in.
- Turn on **strict mode** to require exactly the three notes — extras count as incorrect.
- If the time window expires before all three required pitch classes have arrived, the chord is marked incorrect.

## Deploying your own copy via GitHub Pages

1. Fork or clone this repo.
2. Push to a repo on GitHub.
3. In the repo's **Settings → Pages**, set the source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. Wait a minute. GitHub will publish to `https://<your-username>.github.io/<repo-name>/`.
5. Open that URL in Chrome or Edge.

No build step, no server, no API keys. It's all static files (`index.html`, `style.css`, `script.js`).

## Local development

Open `index.html` in Chrome or Edge directly, or serve the folder with any static file server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The Web MIDI API requires a secure context. `localhost` and `https://` both qualify. Plain `file://` works for MIDI in Chrome too, but a local server is safer.

## License

MIT — see [LICENSE](LICENSE).
