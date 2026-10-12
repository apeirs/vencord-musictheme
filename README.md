# MusicTheme for Vencord

A [Vencord](https://vencord.dev) port of [MusicTheme](https://github.com/Ambralin/MusicTheme_BD-Plugin) by **Ambralin & kaan**, originally a BetterDiscord plugin.

It reads your current music presence (Spotify or YouTube Music), picks the most vibrant color from the album art, and tints Discord's backgrounds to match. The color updates whenever the song changes, and the tint goes away when you stop playing.

> YouTube Music needs the [PreMiD](https://premid.app) browser extension so it shows up as a presence.
> It doesn't work alongside Nitro client themes.

## Install

Custom plugins only work with a [Vencord source build](https://docs.vencord.dev/installing/custom-plugins/).

```sh
cd /path/to/Vencord
git clone https://github.com/apeirs/vencord-musictheme src/userplugins/musicTheme
pnpm build
pnpm inject   # only needed the first time
```

Restart Discord, then turn on **MusicTheme** in Settings → Vencord → Plugins.

## Changes from the original

- Uses Vencord's `definePlugin` and `flux` subscription in place of the `BdApi` Dispatcher and style helpers. Rewritten in TypeScript.
- **Readable text on every cover.** Backgrounds use fixed lightness steps instead of scaling the cover color, and text and icon colors are set to match, so text contrast stays at least 5.5:1 (WCAG AA). Light theme is supported too.
- **Better color picks.** Colors are clustered in OKLab with deterministic seeding, and colorful areas are preferred over big grey ones, so the gold on *Random Access Memories* or the red on *DAMN.* gets picked instead of the grey or skin tones. The same cover always gives the same color.
- Profiles with Nitro profile theme colors keep their own colors.

## License

[CC BY-NC 4.0](LICENSE), the same license as the original. Free to use, not for resale.
Original work © Ambralin & kaan. Ported to Vencord by apeirs.
