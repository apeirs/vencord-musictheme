/*
 * Port of MusicTheme (BetterDiscord) by Ambralin & kaan
 * https://github.com/Ambralin/MusicTheme_BD-Plugin — CC BY-NC 4.0
 */

import definePlugin from "@utils/types";

import { buildPalette, Lch, pickColor } from "./color";

const STYLE_ID = "vc-music-theme";
let recentSong: string | undefined;

function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
}

function setStyle(css: string) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = css;
}

const DARK = [".theme-dark", ".theme-darker", ".theme-midnight"];
const LIGHT = [".theme-light"];

// Profiles with Nitro theme colors bring their own palette, so leave them alone
const scope = (themes: string[]) =>
    `:is(${themes.flatMap(t => [t, `${t} *`]).join(", ")}):not(.custom-user-profile-theme, .custom-user-profile-theme *)`;

const declarations = (vars: Record<string, string>) =>
    Object.entries(vars).map(([name, value]) => `--${name}: ${value} !important;`).join("\n            ");

function updateTheme(color: Lch) {
    setStyle(`
        ${scope(DARK)} {
            transition: background-color 1000ms ease-out !important;
            ${declarations(buildPalette(color, "dark"))}
        }

        ${scope(LIGHT)} {
            transition: background-color 1000ms ease-out !important;
            ${declarations(buildPalette(color, "light"))}
        }

        .theme-dark *:hover, .theme-darker *:hover, .theme-midnight *:hover, .theme-light *:hover { transition: background-color 10ms ease-out !important; }
    `);
}

function colorFromUrl(url: string): Promise<Lch> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    return new Promise((resolve, reject) => {
        img.onload = () => {
            const scale = Math.min(1, Math.sqrt(5000 / (img.width * img.height)));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(img.width * scale));
            canvas.height = Math.max(1, Math.floor(img.height * scale));

            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const color = pickColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
            color ? resolve(color) : reject(new Error("No usable pixels"));
        };
        img.onerror = () => reject(new Error("Image load failed"));
    });
}

export default definePlugin({
    name: "MusicTheme",
    description: "Sets background colors based on the album art of the song you're playing (Spotify / YouTube Music). Doesn't work with Nitro client themes.",
    authors: [{ name: "Ambralin", id: 0n }],

    flux: {
        SELF_PRESENCE_STORE_UPDATE({ activities }: { activities: any[]; }) {
            const activity = activities?.findLast(a => a.type === 2 && (a.name === "YouTube Music" || a.name === "Spotify"));

            if (!activity?.assets?.large_image) {
                removeStyle();
                recentSong = undefined;
                return;
            }

            if (activity.details === recentSong) return;
            recentSong = activity.details;

            const imageUrl = activity.name === "Spotify"
                ? activity.assets.large_image.replace("spotify:", "https://i.scdn.co/image/")
                : "https://" + activity.assets.large_image.split("/https/")[1];
            if (!imageUrl || imageUrl === "https://undefined") return;

            console.log(`[MusicTheme] ${activity.details} by ${activity.state}`);
            colorFromUrl(imageUrl)
                .then(updateTheme)
                .catch(e => console.warn("[MusicTheme]", e));
        }
    },

    stop() {
        removeStyle();
        recentSong = undefined;
    }
});
