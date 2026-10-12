/*
 * Color picking and palette generation for MusicTheme.
 * Everything is done in OKLab/OKLCH so lightness and hue behave the way they look.
 */

export interface Lch { L: number; C: number; h: number; }
type Lab = [number, number, number];

const toLinear = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToLab(r: number, g: number, b: number): Lab {
    r = toLinear(r); g = toLinear(g); b = toLinear(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
}

function labToLinearRgb([L, a, b]: Lab): [number, number, number] {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
}

const labToLch = ([L, a, b]: Lab): Lch => ({ L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 });

/** OKLCH -> sRGB, lowering chroma until the color fits in sRGB so the hue stays put. */
export function lchToRgb({ L, C, h }: Lch): [number, number, number] {
    const rad = h * Math.PI / 180;
    for (let c = C; ; c *= 0.95) {
        const rgb = labToLinearRgb([L, c * Math.cos(rad), c * Math.sin(rad)]);
        if (c < 1e-4 || rgb.every(v => v >= -1e-4 && v <= 1.0001))
            return rgb.map(v => Math.round(Math.min(255, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))))) as [number, number, number];
    }
}

export const lchToHex = (lch: Lch) => "#" + lchToRgb(lch).map(v => v.toString(16).padStart(2, "0")).join("");

/**
 * Picks the color an album cover "reads as": clusters the pixels in OKLab, then favours
 * clusters that are both large and colorful, so a cover that is mostly one color gets that
 * color, and a mostly grey cover with a strong accent gets the accent.
 */
export function pickColor(rgba: ArrayLike<number>, k = 8, iterations = 12): Lch | null {
    const pixels: Lab[] = [];
    const step = Math.max(1, Math.floor(rgba.length / 4 / 4096)) * 4;
    for (let i = 0; i < rgba.length; i += step) {
        if (rgba[i + 3] < 125) continue;
        pixels.push(rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]));
    }
    if (!pixels.length) return null;

    const dist = (p: Lab, q: Lab) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

    // Deterministic farthest-point seeding, so the same cover always gives the same color
    const centroids: Lab[] = [pixels[0].slice() as Lab];
    const minDist = pixels.map(p => dist(p, centroids[0]));
    while (centroids.length < Math.min(k, pixels.length)) {
        let far = 0;
        for (let i = 1; i < pixels.length; i++) if (minDist[i] > minDist[far]) far = i;
        if (minDist[far] === 0) break;
        centroids.push(pixels[far].slice() as Lab);
        for (let i = 0; i < pixels.length; i++) minDist[i] = Math.min(minDist[i], dist(pixels[i], pixels[far]));
    }

    const assignment = new Int32Array(pixels.length);
    for (let iter = 0; iter < iterations; iter++) {
        const sums = centroids.map(() => [0, 0, 0, 0]);
        for (let i = 0; i < pixels.length; i++) {
            let best = 0;
            for (let j = 1; j < centroids.length; j++)
                if (dist(pixels[i], centroids[j]) < dist(pixels[i], centroids[best])) best = j;
            assignment[i] = best;
            const s = sums[best];
            s[0] += pixels[i][0]; s[1] += pixels[i][1]; s[2] += pixels[i][2]; s[3]++;
        }
        sums.forEach((s, j) => { if (s[3]) centroids[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }

    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < pixels.length; i++) counts[assignment[i]]++;

    let best: Lch | null = null, bestScore = -1;
    centroids.forEach((c, j) => {
        const share = counts[j] / pixels.length;
        if (share < 0.01) return; // ignore stray specks
        const lch = labToLch(c);
        // Colorful areas win over larger grey/black/white ones; greys only win when nothing has color
        const colorfulness = 0.08 + Math.min(lch.C, 0.16) / 0.16;
        const lightness = lch.L < 0.2 || lch.L > 0.95 ? 0.4 : 1;
        const score = Math.sqrt(share) * colorfulness * lightness;
        if (score > bestScore) { bestScore = score; best = lch; }
    });
    return best;
}

// Lightness steps for each surface, roughly matching Discord's own dark and light themes.
const SURFACES = {
    dark: {
        "background-base-lowest": 0.17,
        "background-base-lower": 0.20,
        "background-base-low": 0.23,
        "chat-background-default": 0.25,
        "background-surface-high": 0.27,
        "background-surface-higher": 0.30,
        "custom-status-bubble-background": 0.33,
        "user-profile-overlay-background": 0.27,
        "user-profile-overlay-background-hover": 0.31,
        "control-overlay-secondary-background-default": 0.30,
        "control-overlay-secondary-background-active": 0.34,
    },
    light: {
        "background-base-lowest": 0.90,
        "background-base-lower": 0.93,
        "background-base-low": 0.955,
        "chat-background-default": 0.975,
        "background-surface-high": 0.985,
        "background-surface-higher": 0.99,
        "custom-status-bubble-background": 0.93,
        "user-profile-overlay-background": 0.95,
        "user-profile-overlay-background-hover": 0.92,
        "control-overlay-secondary-background-default": 0.93,
        "control-overlay-secondary-background-active": 0.90,
    }
};

// Text gets a faint tint of the song's hue but stays far enough from the backgrounds to read.
const TEXT = {
    dark: {
        "text-strong": 0.98, "text-default": 0.94, "text-subtle": 0.86, "text-muted": 0.78,
        "interactive-text-active": 0.98, "interactive-text-hover": 0.94, "interactive-text-default": 0.84, "interactive-muted": 0.55,
        "icon-strong": 0.96, "icon-default": 0.86, "icon-subtle": 0.80, "icon-muted": 0.74,
        "channels-default": 0.80, "channel-icon": 0.76,
    },
    light: {
        "text-strong": 0.15, "text-default": 0.22, "text-subtle": 0.32, "text-muted": 0.45,
        "interactive-text-active": 0.15, "interactive-text-hover": 0.22, "interactive-text-default": 0.35, "interactive-muted": 0.70,
        "icon-strong": 0.18, "icon-default": 0.32, "icon-subtle": 0.40, "icon-muted": 0.48,
        "channels-default": 0.42, "channel-icon": 0.46,
    }
};

export function buildPalette({ C, h }: Lch, mode: "dark" | "light") {
    // Muted covers stay near-neutral, colorful ones get a clear but not garish tint
    const bgChroma = Math.min(C * 0.45, mode === "dark" ? 0.065 : 0.035);
    const textChroma = Math.min(C * 0.15, 0.02);

    const vars: Record<string, string> = {};
    for (const [name, L] of Object.entries(SURFACES[mode])) vars[name] = lchToHex({ L, C: bgChroma, h });
    for (const [name, L] of Object.entries(TEXT[mode])) vars[name] = lchToHex({ L, C: textChroma, h });
    return vars;
}
