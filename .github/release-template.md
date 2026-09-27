# Notation Prettifier {{VERSION}}

Type rough math notation in Obsidian and read it back as real math: `L^' = L + F` becomes `$L' = L + F$`, `sqrt r^2-y^2` becomes `$\sqrt{r^{2}-y^{2}}$`, and `5<degrees>` becomes `5°`, live as you type and baked into the note on command. It also carries the whole Symbols Prettifier arrow and sign map.

Requires Obsidian 1.5.0 or newer. Desktop and mobile.

Release assets are built and attested by GitHub Actions. Verify a downloaded `main.js` with:

```bash
gh attestation verify main.js --repo zoroaster1x/Notation-Prettifier
```

## Changes since {{PREVIOUS}}

{{CHANGES}}

## Install

1. Download `main.js`, `manifest.json` and `styles.css` from the assets below.
2. Put them in `<Vault>/.obsidian/plugins/notation-prettifier/`.
3. In Obsidian: Settings, Community plugins, reload the installed plugins, enable **Notation Prettifier**.
4. If Symbols Prettifier is enabled, turn it off: this plugin already carries its shortcuts.

## Documentation

Every rule, shortcut, setting, custom rule recipe, performance number and known limit lives in the [README](https://github.com/zoroaster1x/Notation-Prettifier#readme).

## Funding

If this plugin saves you time, consider supporting its development.

**Monero (XMR):**

```
8BdxmQSniku4dBJXWPXeXvgjztmj5nmvWQqeCrVvCtYciusbAyo4rqrGCefTfQ4gGaVZmLN7VgLiYUYyBdYFEwHn1UWPjWs
```

> **Tip:** You can easily purchase Litecoin using Cake Wallet and then, within the app, create a Monero wallet and exchange the Litecoin into it, pointed at the address above.

Crypto isn't your thing? Starring the repository, filing clear bug reports with a sample line of notation, and telling other Obsidian users about the plugin all help just as much.

## License

GPL-3.0-or-later. Copyright (C) 2026 Zoroaster1x.
