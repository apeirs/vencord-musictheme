/*
 * Port of MusicTheme (BetterDiscord) by Ambralin & kaan
 * https://github.com/Ambralin/MusicTheme_BD-Plugin — CC BY-NC 4.0
 */

import definePlugin from "@utils/types";

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

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;

function updateTheme([r, g, b]: number[]) {
    const [h, s, l] = rgbToHsl(r, g, b);
    setStyle(`
        .theme-dark, .theme-dark *, .theme-light, .theme-light * {
            --neutral-72: var(--neutral-1);
            --neutral-76: var(--neutral-4);
            --neutral-43: var(--neutral-35);
            --neutral-47: var(--neutral-16);
            --neutral-41: var(--neutral-23);

            transition: background-color 1000ms ease-out !important;
            --background-base-low:                          ${hsl(h, s, l * 0.50)} !important;
            --background-base-lower:                        ${hsl(h, s, l * 0.30)} !important;
            --background-base-lowest:                       ${hsl(h, s, l * 0.20)} !important;
            --background-surface-high:                      ${hsl(h, s, l * 0.45)} !important;
            --background-surface-higher:                    ${hsl(h, s, l * 0.35)} !important;
            --chat-background-default:                      ${hsl(h, s, l * 0.45)} !important;

            --custom-status-bubble-background:              ${hsl(h, s, l * 0.55)} !important;
            --user-profile-overlay-background:              ${hsl(h, s, l * 0.55)} !important;
            --user-profile-overlay-background-hover:        ${hsl(h, s, l * 0.60)} !important;
            --control-overlay-secondary-background-default: ${hsl(h, s, l * 0.35)} !important;
            --control-overlay-secondary-background-active:  ${hsl(h, s, l * 0.40)} !important;
        }

        .theme-dark *:hover, .theme-light *:hover { transition: background-color 10ms ease-out !important; }
    `);
}

function vibrantColorFromUrl(url: string, k = 4, maxIterations = 10, sampleSize = 5000): Promise<number[]> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    return new Promise((resolve, reject) => {
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, Math.sqrt(sampleSize / (img.width * img.height)));
            canvas.width = Math.max(1, Math.floor(img.width * scale));
            canvas.height = Math.max(1, Math.floor(img.height * scale));

            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const pixels: number[][] = [];
            const skippedPixels: number[][] = [];

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 125) continue;
                const px = [data[i], data[i + 1], data[i + 2]];
                const [, s, l] = rgbToHsl(px[0], px[1], px[2]);
                if (s < 25 || l < 15 || l > 85) skippedPixels.push(px);
                else pixels.push(px);
            }

            if (!pixels.length) pixels.push(...skippedPixels);
            if (!pixels.length) return reject(new Error("No usable pixels"));

            const centroids = Array.from({ length: k }, () => pixels[Math.floor(Math.random() * pixels.length)].slice());
            const assignments = new Array<number>(pixels.length);

            for (let iter = 0; iter < maxIterations; iter++) {
                for (let i = 0; i < pixels.length; i++) {
                    let best = 0, minDist = Infinity;
                    for (let j = 0; j < k; j++) {
                        const dr = pixels[i][0] - centroids[j][0];
                        const dg = pixels[i][1] - centroids[j][1];
                        const db = pixels[i][2] - centroids[j][2];
                        const dist = dr * dr + dg * dg + db * db;
                        if (dist < minDist) { minDist = dist; best = j; }
                    }
                    assignments[i] = best;
                }

                const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
                for (let i = 0; i < pixels.length; i++) {
                    const c = assignments[i];
                    sums[c][0] += pixels[i][0];
                    sums[c][1] += pixels[i][1];
                    sums[c][2] += pixels[i][2];
                    sums[c][3]++;
                }
                for (let j = 0; j < k; j++) {
                    if (!sums[j][3]) continue;
                    centroids[j] = [sums[j][0] / sums[j][3], sums[j][1] / sums[j][3], sums[j][2] / sums[j][3]];
                }
            }

            const stats = Array.from({ length: k }, () => ({ count: 0, score: 0 }));
            for (let i = 0; i < pixels.length; i++) {
                const [, s, l] = rgbToHsl(pixels[i][0], pixels[i][1], pixels[i][2]);
                stats[assignments[i]].count++;
                stats[assignments[i]].score += s * 0.7 + l * 0.3;
            }

            let bestCluster = 0, bestValue = -Infinity;
            for (let j = 0; j < k; j++) {
                if (!stats[j].count) continue;
                const weighted = (stats[j].score / stats[j].count) * Math.log(stats[j].count);
                if (weighted > bestValue) { bestValue = weighted; bestCluster = j; }
            }

            resolve(centroids[bestCluster].map(v => Math.round(v)));
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
            vibrantColorFromUrl(imageUrl)
                .then(updateTheme)
                .catch(e => console.warn("[MusicTheme]", e));
        }
    },

    stop() {
        removeStyle();
        recentSong = undefined;
    }
});
