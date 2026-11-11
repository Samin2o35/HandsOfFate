"""Hands of Fate - tools/audio/make_sfx.py

Every sound effect, synthesized (8-bit style, to sit with the pixel art).
Writes assets/resources/audio/sfx/<name>.mp3 (and .wav copies in build/audio for
listening). Usage: python3 tools/audio/make_sfx.py [out_dir]

Each recipe is short on purpose: change a number, run again, listen.
"""
import os
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import (SR, tone, noise, env, lowpass, highpass, bandpass, mix, seq, at, normalize,  # noqa: E402
                   fade_edges, note_hz, freq_curve, square, triangle, vibrato)


def n_of(sec):
    return int(sec * SR)


def blip(kind, f0, sec, f1=None, duty=0.5, attack=0.002, release=None, vib=(0, 0)):
    x = tone(kind, f0, sec, f1, duty, vib)
    return x * env(len(x), attack, release=release if release is not None else sec * 0.7)


def hiss(sec, lo, hi, seed=1, release=None, attack=0.002, step=1):
    x = bandpass(noise(n_of(sec), seed, step), lo, hi)
    return normalize(x, 1.0) * env(len(x), attack, release=release if release is not None else sec * 0.9)


def arp(kind, notes, each, duty=0.5, hold_last=0.0, vol_last=1.0):
    parts = []
    for k, nm in enumerate(notes):
        last = k == len(notes) - 1
        sec = each + (hold_last if last else 0)
        x = tone(kind, note_hz(nm), sec, duty=duty)
        x = x * env(len(x), 0.002, release=sec * (0.8 if last else 0.3))
        parts.append(x * (vol_last if last else 1.0))
    return np.concatenate(parts)


# ---- UI ---------------------------------------------------------------------------------------

def click():
    return blip('square', 1250, 0.035, 900, duty=0.25) * 0.8


def deny():
    a = blip('square', 196, 0.07, 185, duty=0.5)
    b = blip('square', 165, 0.11, 150, duty=0.5)
    return lowpass(seq(a, b, gap=0.02), 2400)


def select():
    return arp('square', ['E6', 'B6'], 0.035, duty=0.25)


def tick():
    return blip('tri', 1700, 0.018) * 0.7


def total():
    # A coin: two quick notes, the second held a little.
    return arp('square', ['B5', 'E6'], 0.06, duty=0.5, hold_last=0.16)


# ---- Cards ------------------------------------------------------------------------------------

def card_pick():
    # Paper lifted off felt: a short rising hiss.
    x = bandpass(noise(n_of(0.06), 3), 1500, 6000)
    return normalize(x, 1) * env(len(x), 0.012, release=0.04) * 0.7


def card_place():
    snap = hiss(0.04, 1200, 5000, seed=4, release=0.035)
    thump = blip('tri', 150, 0.08, 90) * 0.9
    return mix(snap * 0.6, thump)


def card_return():
    n = n_of(0.11)
    x = noise(n, 5)
    x = lowpass(x, freq_curve(5000, 900, n))
    return normalize(x, 1) * env(n, 0.005, release=0.09) * 0.6


def deal():
    return hiss(0.035, 2000, 7000, seed=6, release=0.03) * 0.55


def forge():
    # Hammer on an anvil: a clang (two detuned squares ringing) over a noise strike.
    strike = hiss(0.05, 800, 6000, seed=7, release=0.045)
    ring = mix(blip('square', 660, 0.5, duty=0.25, release=0.48), blip('square', 993, 0.5, duty=0.125, release=0.48) * 0.6)
    ring = lowpass(ring, 3500) * 0.6
    return mix(strike, ring)


def dealer():
    # A riffle of cards and a soft note: the Dealer leans in.
    total_s = 0.32
    out = np.zeros(n_of(total_s))
    for k in range(8):
        out += at(hiss(0.018, 2500, 8000, seed=20 + k, release=0.015) * (0.5 + 0.06 * k), 0.02 + k * 0.028, total_s)
    out += at(blip('tri', note_hz('A5'), 0.12) * 0.35, 0.2, total_s)
    return out


# ---- Fight: impacts -----------------------------------------------------------------------------

def hit():
    # You land a hit: a crunchy burst over a falling square.
    crunch = hiss(0.08, 300, 4500, seed=8, release=0.07, step=3)
    drop = blip('square', 420, 0.14, 110, duty=0.5) * 0.6
    return mix(crunch, lowpass(drop, 3000))


def hurt():
    # They hit you: lower and rougher.
    rough = blip('saw', 230, 0.22, 60) * 0.7
    crunch = hiss(0.12, 150, 2500, seed=9, release=0.11, step=4)
    return lowpass(mix(rough, crunch), 2600)


def rot():
    # Bubbling: a wobbling triangle sinking, through murk.
    n = n_of(0.3)
    f = vibrato(freq_curve(340, 120, n), 22, 0.18)
    x = triangle(f) * env(n, 0.01, release=0.22)
    bub = lowpass(noise(n, 10, 6), 900) * env(n, 0.02, release=0.25) * 0.8
    return mix(x, bub)


def block():
    # A shield takes it: a bright ping.
    return mix(blip('square', 1480, 0.12, duty=0.125, release=0.11) * 0.6, blip('tri', 740, 0.16, release=0.15))


def heal():
    return arp('tri', ['C5', 'E5', 'G5', 'C6'], 0.045, hold_last=0.1)


def shield():
    n = n_of(0.22)
    f = vibrato(freq_curve(420, 950, n), 18, 0.03)
    return square(f, 0.25) * env(n, 0.005, release=0.12) * 0.6


def twist():
    # The King acts: a low bend down with a swell of noise under it.
    n = n_of(0.7)
    growl = lowpass(tone('saw', 110, 0.7, 70), 1200) * env(n, 0.05, release=0.4)
    swell = bandpass(noise(n, 11, 2), 200, 1800) * np.linspace(0, 1, n) ** 2 * env(n, 0.0, release=0.15)
    return mix(growl, normalize(swell, 0.6))


# ---- Fight: throws (one per suit) -----------------------------------------------------------------

def throw_S():
    # A blade: a whoosh rising through the air.
    n = n_of(0.18)
    x = noise(n, 12)
    x = highpass(x, 600)
    x = lowpass(x, freq_curve(1200, 7000, n))
    return normalize(x, 1) * env(n, 0.03, release=0.08) * 0.55


def throw_C():
    # A glob: a wet blorp.
    return lowpass(blip('tri', 320, 0.15, 140, vib=(30, 0.08)), 1800) * 0.7


def throw_H():
    # Motes: a soft two-note chime.
    return mix(blip('tri', 1175, 0.12), at(blip('tri', 1480, 0.1) * 0.6, 0.03, 0.13)) * 0.6


def throw_D():
    # A shard: a quick bright zing.
    return blip('square', 1800, 0.1, 2700, duty=0.125) * 0.4


# ---- Moments -----------------------------------------------------------------------------------

def win():
    lead = arp('square', ['C5', 'E5', 'G5', 'C6'], 0.09, duty=0.25, hold_last=0.35)
    bass = blip('tri', note_hz('C3'), len(lead) / SR, release=0.3) * 0.7
    return mix(lead * 0.7, bass)


def lose():
    lead = arp('tri', ['G4', 'Eb4', 'C4', 'G3'], 0.18, hold_last=0.5)
    return lowpass(lead, 2500)


def boss():
    # The King arrives: a drum and a sour low chord.
    total_s = 1.2
    drum = blip('tri', 120, 0.3, 45) * 1.0
    chord = mix(blip('tri', note_hz('E2'), 1.1, release=0.8), blip('square', note_hz('F2'), 1.1, duty=0.25, release=0.8) * 0.3,
                blip('square', note_hz('B2'), 1.1, duty=0.125, release=0.8) * 0.25)
    return mix(at(drum, 0, total_s), at(lowpass(chord, 1500), 0.05, total_s))


def ace():
    up = arp('square', ['E5', 'G#5', 'B5', 'E6', 'G#6', 'B6'], 0.06, duty=0.125, hold_last=0.3)
    shimmer = mix(*[at(blip('tri', note_hz(nm), 0.25) * 0.3, 0.36 + k * 0.07, 0.9) for k, nm in enumerate(['E7', 'B6', 'G#7'])])
    return mix(up * 0.6, shimmer)


SOUNDS = {
    'click': click, 'deny': deny, 'select': select, 'card_pick': card_pick, 'card_place': card_place,
    'card_return': card_return, 'deal': deal, 'forge': forge, 'hit': hit, 'hurt': hurt, 'rot': rot,
    'block': block, 'heal': heal, 'shield': shield, 'twist': twist, 'win': win, 'lose': lose, 'tick': tick,
    'total': total, 'boss': boss, 'ace': ace, 'dealer': dealer,
    'throw_S': throw_S, 'throw_C': throw_C, 'throw_H': throw_H, 'throw_D': throw_D,
}


# Loudness of each sound (RMS, dBFS), baked into the file so the game plays them all at 1.
# UI is quiet, throws (frequent) quieter still, impacts in the middle, big moments loudest.
LOUDNESS = {
    'click': -20, 'tick': -24, 'select': -20, 'deny': -18, 'total': -17,
    'card_pick': -20, 'card_place': -18, 'card_return': -21, 'deal': -22, 'dealer': -20, 'forge': -15,
    'throw_S': -22, 'throw_C': -21, 'throw_H': -22, 'throw_D': -23,
    'hit': -14, 'hurt': -13, 'rot': -15, 'block': -16, 'heal': -16, 'shield': -17, 'twist': -13,
    'win': -13, 'lose': -13, 'boss': -12, 'ace': -13,
}


def finish(name, x):
    """No DC, square edges softened a little (less harsh, less aliasing), then set to its loudness."""
    x = lowpass(highpass(x, 30), 9000)
    rms = np.sqrt(np.mean(x ** 2)) or 1e-9
    x = x * (10 ** (LOUDNESS[name] / 20) / rms)
    peak = np.max(np.abs(x))
    if peak > 0.9:
        x = x * (0.9 / peak)
    return fade_edges(x)


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def to_mp3(wav, mp3, kbps=96):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', mp3], check=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'assets/resources/audio/sfx'
    wav_dir = 'build/audio/sfx'
    os.makedirs(out, exist_ok=True)
    os.makedirs(wav_dir, exist_ok=True)
    for name, fn in SOUNDS.items():
        x = finish(name, fn())
        wav = os.path.join(wav_dir, name + '.wav')
        write_wav(wav, x)
        to_mp3(wav, os.path.join(out, name + '.mp3'))
        print(f'{name:12s} {len(x) / SR:5.2f} s  rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):6.1f} dB  peak {np.max(np.abs(x)):.2f}')


if __name__ == '__main__':
    main()
