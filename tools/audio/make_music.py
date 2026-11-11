"""Hands of Fate - tools/audio/make_music.py

The three music loops (menu, fight, boss), composed here as note lists and played
by the 8-bit synth in synth.py: a square lead, a thin square arpeggio, a triangle
bass and noise drums, like a four-channel console.

Each loop is rendered twice through and the second pass kept, so notes ringing
over the end carry into the start: the file loops without a click.
Usage: python3 tools/audio/make_music.py [out_dir]
"""
import os
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, square, triangle, noise, env, lowpass, highpass, bandpass, note_hz, vibrato  # noqa: E402

# Chord tones by name (root first).
CHORDS = {
    'Am': ['A', 'C', 'E'], 'F': ['F', 'A', 'C'], 'C': ['C', 'E', 'G'], 'G': ['G', 'B', 'D'],
    'Dm': ['D', 'F', 'A'], 'E': ['E', 'G#', 'B'], 'E7': ['E', 'G#', 'D'], 'Bb': ['Bb', 'D', 'F'], 'A': ['A', 'C#', 'E'],
    'Em': ['E', 'G', 'B'], 'D': ['D', 'F#', 'A'], 'B': ['B', 'D#', 'F#'], 'Gm': ['G', 'Bb', 'D'],
    'Fmaj7': ['F', 'A', 'E'], 'Bdim': ['B', 'D', 'F'],
}


class Song:
    def __init__(self, bpm, bars, steps_per_bar=16):
        self.bpm, self.bars, self.spb = bpm, bars, steps_per_bar
        self.step = 60 / bpm / 4          # one 16th note
        self.n = int(round(bars * steps_per_bar * self.step * SR))
        self.buf = np.zeros(self.n * 2)    # two passes, for the seamless loop

    def place(self, x, step):
        """Add x at a 16th-note step, in both passes (the second wraps into... itself)."""
        for k in (0, 1):
            s = int(round((step + k * self.bars * self.spb) * self.step * SR))
            e = min(len(self.buf), s + len(x))
            if s < len(self.buf):
                self.buf[s:e] += x[:e - s]

    def note(self, kind, name, step, steps, vol, duty=0.5, vib=0.0, gate=0.85, release=0.06):
        sec = steps * self.step * gate + release
        n = int(sec * SR)
        f = np.full(n, note_hz(name))
        if vib:
            f = vibrato(f, 5.5, vib)
        x = square(f, duty) if kind == 'square' else triangle(f)
        x = x * env(n, 0.004, decay=0.08, sustain=0.75, release=release)
        self.place(x * vol, step)

    def drum(self, kind, step, vol):
        if kind == 'kick':
            n = int(0.12 * SR)
            f = 140 * (45 / 140) ** np.linspace(0, 1, n)
            x = triangle(f) * env(n, 0.001, release=0.1)
        elif kind == 'snare':
            n = int(0.14 * SR)
            x = bandpass(noise(n, step + 3, 2), 600, 6000) * env(n, 0.001, release=0.13)
        elif kind == 'hat':
            n = int(0.035 * SR)
            x = highpass(noise(n, step + 7), 6000) * env(n, 0.001, release=0.03)
        else:  # shaker, the soft hat for the menu
            n = int(0.05 * SR)
            x = bandpass(noise(n, step + 11), 3000, 9000) * env(n, 0.01, release=0.04)
        self.place(x * vol, step)

    def melody(self, kind, text, start_step, vol, duty=0.5, vib=0.0, octave_shift=0):
        """'A4:4 C5:2 -:2 E5:8' : note:length in 16ths, '-' a rest."""
        s = start_step
        for tok in text.split():
            name, ln = tok.split(':')
            ln = int(ln)
            if name != '-':
                if octave_shift:
                    name = name[:-1] + str(int(name[-1]) + octave_shift)
                self.note(kind, name, s, ln, vol, duty, vib)
            s += ln
        return s

    def render(self):
        x = self.buf[self.n:2 * self.n]    # the second pass: tails from the end are already in its start
        x = lowpass(highpass(x, 30), 10000)
        return x / (np.max(np.abs(x)) or 1) * 0.8


def chord_note(ch, k, octave):
    return CHORDS[ch][k % 3] + str(octave + (k // 3))


# ---- Menu: "The Back Room" ----------------------------------------------------------------------
# A minor, 92 bpm, 16 bars. Walking bass, a slow arpeggio and a lazy lead: a quiet card room.

def menu():
    s = Song(92, 16)
    prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E', 'Am', 'F', 'C', 'G', 'Dm', 'Am', 'E', 'E7']
    for b, ch in enumerate(prog):
        base = b * 16
        root = CHORDS[ch][0]
        walk = [root + '2', CHORDS[ch][1] + '2', CHORDS[ch][2] + '2', CHORDS[ch][1] + '2']
        for q, nm in enumerate(walk):
            s.note('tri', nm, base + q * 4, 3, 0.55, gate=0.9)
        for k in range(8):   # eighth-note arpeggio, up and back
            s.note('square', chord_note(ch, [0, 1, 2, 3, 2, 1, 0, 1][k], 4), base + k * 2, 2, 0.07, duty=0.125, gate=0.6)
        for k in (2, 6, 10, 14):
            s.drum('shaker', base + k, 0.10)
        s.drum('kick', base, 0.25)
    lead = (
        'E5:6 D5:2 C5:4 B4:4 | A4:8 -:4 C5:4 | E5:6 G5:2 E5:4 D5:4 | B4:12 -:4 | '
        'C5:6 B4:2 A4:4 C5:4 | A4:8 -:4 E4:4 | F4:4 A4:4 D5:4 F5:4 | E5:12 -:4 | '
        'A5:6 G5:2 E5:4 C5:4 | A4:8 -:4 C5:4 | G5:6 F5:2 E5:4 D5:4 | B4:8 G4:4 B4:4 | '
        'D5:6 C5:2 A4:4 F4:4 | E4:4 A4:4 C5:4 E5:4 | G#4:6 B4:2 E5:8 | D5:4 B4:4 G#4:4 E4:4'
    ).replace('|', '')
    s.melody('square', lead, 0, 0.16, duty=0.25, vib=0.004)
    return s.render()


# ---- Fight: "Hands Up" --------------------------------------------------------------------------
# D minor, 138 bpm, 16 bars. Octave bass in eighths, a fast arpeggio, a riff, a full kit.

def fight():
    s = Song(138, 16)
    prog = ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'C', 'A', 'Gm', 'Bb', 'A', 'A']
    for b, ch in enumerate(prog):
        base = b * 16
        root = CHORDS[ch][0]
        for k in range(8):
            s.note('tri', root + ('2' if k % 2 == 0 else '3'), base + k * 2, 2, 0.6, gate=0.7)
        for k in range(16):
            s.note('square', chord_note(ch, [0, 1, 2, 3][k % 4], 4), base + k, 1, 0.05, duty=0.125, gate=0.7, release=0.02)
        for k in (0, 8):
            s.drum('kick', base + k, 0.5)
        s.drum('kick', base + 10, 0.3)
        for k in (4, 12):
            s.drum('snare', base + k, 0.32)
        for k in range(0, 16, 2):
            s.drum('hat', base + k, 0.13 if k % 4 else 0.09)
    riff_a = 'D5:2 -:2 D5:2 F5:2 A5:4 G5:2 F5:2 | F5:2 -:2 F5:2 D5:2 Bb4:4 C5:2 D5:2 | E5:2 -:2 E5:2 G5:2 C6:4 Bb5:2 A5:2 | A5:8 E5:4 C#5:4'
    riff_b = 'D5:2 -:2 D5:2 F5:2 A5:4 G5:2 F5:2 | F5:2 -:2 F5:2 D5:2 Bb4:4 C5:2 D5:2 | G5:4 F5:4 E5:4 D5:4 | C#5:8 E5:4 A4:4'
    riff_c = 'A5:4 D6:4 C6:4 A5:4 | Bb5:4 F5:4 D5:4 F5:4 | C6:4 G5:4 E5:4 G5:4 | A5:8 C#6:4 E6:4'
    riff_d = 'G5:4 Bb5:4 D6:4 Bb5:4 | F5:4 D5:4 Bb4:4 D5:4 | E5:2 F5:2 G5:2 A5:2 C#6:4 A5:4 | D6:8 A5:4 E5:4'
    text = ' '.join(r.replace('|', '') for r in (riff_a, riff_b, riff_c, riff_d))
    s.melody('square', text, 0, 0.14, duty=0.25)
    return s.render()


# ---- Boss: "The House" --------------------------------------------------------------------------
# E phrygian, 120 bpm, 16 bars. A pulsing low E, the flat second leaning on it, a slow sour lead.

def boss():
    s = Song(120, 16)
    prog = ['Em', 'F', 'Em', 'F', 'Em', 'F', 'G', 'F', 'Am', 'Bb', 'Am', 'G', 'Em', 'F', 'Bdim', 'B']
    for b, ch in enumerate(prog):
        base = b * 16
        root = CHORDS[ch][0]
        for k in range(8):
            s.note('tri', (root if k not in (3, 7) else CHORDS[ch][2]) + '2', base + k * 2, 2, 0.62, gate=0.75)
        for k in range(8):
            s.note('square', chord_note(ch, [0, 2, 1, 2, 0, 2, 1, 3][k], 3), base + k * 2, 2, 0.06, duty=0.125, gate=0.5)
        s.drum('kick', base, 0.55)
        s.drum('kick', base + 6, 0.35)
        s.drum('kick', base + 8, 0.45)
        s.drum('snare', base + 12, 0.3)
        for k in range(2, 16, 4):
            s.drum('hat', base + k, 0.1)
    lead = (
        'B4:8 C5:8 | B4:12 -:4 | B4:4 C5:4 E5:4 C5:4 | B4:12 -:4 | '
        'E5:8 F5:8 | E5:4 D5:4 B4:8 | D5:8 C5:4 B4:4 | C5:12 -:4 | '
        'A4:4 C5:4 E5:8 | F5:8 D5:8 | E5:4 C5:4 A4:8 | B4:8 D5:8 | '
        'G4:4 B4:4 E5:8 | F5:12 -:4 | F5:4 D5:4 B4:8 | D#5:8 F#5:8'
    ).replace('|', '')
    s.melody('square', lead, 0, 0.15, duty=0.5, vib=0.006)
    return s.render()


TRACKS = {'menu': menu, 'fight': fight, 'boss': boss}


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'assets/resources/audio/music'
    os.makedirs(out, exist_ok=True)
    os.makedirs('build/audio/music', exist_ok=True)
    for name, fn in TRACKS.items():
        x = fn()
        wav = f'build/audio/music/{name}.wav'
        write_wav(wav, x)
        # LAME writes the encoder delay and padding in its header, so browsers can trim them for a gapless loop.
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', '4',
                        os.path.join(out, name + '.mp3')], check=True)
        print(f'{name:6s} {len(x) / SR:5.1f} s')


if __name__ == '__main__':
    main()
