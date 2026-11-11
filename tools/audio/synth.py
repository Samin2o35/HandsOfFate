"""Hands of Fate - tools/audio/synth.py

A tiny 8-bit synth: the oscillators, envelopes and filters that make_sfx.py and
make_music.py build every sound from. Everything is generated here, so all audio
in the game is our own (no packs, no credits needed).
"""
import numpy as np

SR = 44100


def t_of(seconds):
    return np.arange(int(round(seconds * SR))) / SR


def freq_curve(f0, f1, n, shape='exp'):
    """A pitch slide over n samples (exponential sounds natural for pitch)."""
    if f0 == f1:
        return np.full(n, float(f0))
    x = np.linspace(0, 1, n)
    if shape == 'exp':
        return f0 * (f1 / f0) ** x
    return f0 + (f1 - f0) * x


def phase_of(freq):
    return np.cumsum(freq) / SR


def square(freq, duty=0.5):
    ph = phase_of(freq) % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def triangle(freq):
    ph = phase_of(freq) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def saw(freq):
    ph = phase_of(freq) % 1.0
    return 2 * ph - 1


def noise(n, seed=1, step=1):
    """White noise; step > 1 holds each value for `step` samples (the NES's crunchier noise)."""
    rng = np.random.default_rng(seed)
    v = rng.uniform(-1, 1, (n + step - 1) // step)
    return np.repeat(v, step)[:n]


def env(n, attack=0.002, decay=None, sustain=1.0, release=0.0, curve=2.0):
    """Attack, then hold at `sustain`, then fall to 0 over the last `release` seconds.
    With `decay` set, the level falls from 1 to sustain over `decay` seconds after the attack."""
    e = np.ones(n) * sustain
    a = min(n, int(attack * SR))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if decay:
        d = min(n - a, int(decay * SR))
        if d > 0:
            e[a:a + d] = sustain + (1 - sustain) * (1 - np.linspace(0, 1, d)) ** curve
    r = min(n, int(release * SR))
    if r:
        e[n - r:] *= (1 - np.linspace(0, 1, r)) ** curve
    return e


def lowpass(x, cutoff):
    """One-pole low-pass (cutoff may be an array, for sweeps)."""
    if np.isscalar(cutoff):
        from scipy.signal import lfilter
        a = 1 - np.exp(-2 * np.pi * cutoff / SR)
        return lfilter([a], [1, a - 1], x)
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def bandpass(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def vibrato(freq, rate, depth):
    n = len(freq)
    return freq * (1 + depth * np.sin(2 * np.pi * rate * np.arange(n) / SR))


def bitcrush(x, levels=16):
    return np.round(x * levels) / levels


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def seq(*parts, gap=0.0):
    """Parts one after another, with `gap` seconds of silence between."""
    g = np.zeros(int(gap * SR))
    out = []
    for k, p in enumerate(parts):
        if k:
            out.append(g)
        out.append(p)
    return np.concatenate(out)


def at(x, seconds, total):
    """x placed `seconds` into a buffer `total` seconds long."""
    out = np.zeros(int(total * SR))
    s = int(seconds * SR)
    e = min(len(out), s + len(x))
    out[s:e] += x[:e - s]
    return out


def normalize(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fade_edges(x, ms=3):
    n = int(ms / 1000 * SR)
    if n and len(x) > 2 * n:
        x = x.copy()
        x[:n] *= np.linspace(0, 1, n)
        x[-n:] *= np.linspace(1, 0, n)
    return x


def note_hz(name):
    """'A4', 'C#3', 'Eb5' -> Hz (A4 = 440)."""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]]
    rest = name[1:]
    while rest and rest[0] in '#b':
        n += 1 if rest[0] == '#' else -1
        rest = rest[1:]
    midi = 12 * (int(rest) + 1) + n
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(kind, f0, seconds, f1=None, duty=0.5, vib=(0, 0)):
    n = int(seconds * SR)
    f = freq_curve(f0, f1 or f0, n)
    if vib[1]:
        f = vibrato(f, *vib)
    if kind == 'square':
        return square(f, duty)
    if kind == 'tri':
        return triangle(f)
    if kind == 'saw':
        return saw(f)
    raise ValueError(kind)
