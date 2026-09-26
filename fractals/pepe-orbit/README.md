# Pepe in the orbit — image-driven Julia experiments

**Status:** reproducible local prototype; the generated images are checked in beside this note. This is a side experiment, not one of the seven live GLSL shaders.

## The short answer

Yes, an image can steer a quadratic orbit. There are two importantly different ways to do it:

1. **Image fixed per starting pixel:** use the image sample at that pixel as a constant perturbation to its `c`. Every orbit sees one fixed value. This tends to preserve more of the input's large-scale placement.
2. **Image sampled along the orbit:** sample the image at each current `zₙ` and feed that value back into the next step. This makes the image part of the dynamics, but the orbit folds and revisits the texture, so the source face is not copied cleanly.

A separate, often clearer trick is to run ordinary Julia dynamics and use the **last orbit position** to look up the image for coloring. That maps the face through the fractal without changing the Julia recurrence.

## What “Pepe's phase” means here

A grayscale image does not have one canonical phase value per pixel. Its 2-D Fourier transform has complex coefficients

`F(u,v) = |F(u,v)| exp(i φ(u,v))`,

where `φ` is phase indexed by **spatial frequency** `(u,v)`, not by image position. So sampling the raw phase array as though it were a grayscale picture mixes up two coordinate systems.

This experiment tests a standard phase-only construction instead: subtract the image mean, take its 2-D FFT, discard the magnitudes, and inverse-transform `exp(i φ)`. The resulting **phase-only reconstruction** is then used as a signed texture that perturbs the orbit. Here its Pearson correlation with the original grayscale test image is about **0.22** after normalization: phase retains some spatial organization, but throwing away the spectrum magnitudes does not reproduce the source faithfully.

## Tested recurrences

Let `g` be the normalized grayscale image, and let `T` map a complex coordinate to wrapped image UVs. The renderer uses `c = −0.745 + 0.186i`, forcing amplitude `α = 0.16`, 150 iterations, and a bailout radius of 16.

- **Reference Julia:** `z₀ = pixel`, `zₙ₊₁ = zₙ² + c`.
- **Fixed image field:** `zₙ₊₁ = zₙ² + c + α(2g(T(z₀)) − 1)`.
- **Orbit grayscale:** `zₙ₊₁ = zₙ² + c + α(2g(T(zₙ)) − 1)`.
- **Orbit phase-only:** same as orbit grayscale, replacing `g` with the normalized phase-only reconstruction.
- **Terminal lookup:** keep the reference Julia recurrence; color using `g(T(z_last))` after escape.

All use the same square-complex map and initial pixel-to-`z₀` plane. The texture coordinates wrap, which avoids clamping but introduces periodic seams in the sampled field.

## What worked / what did not

- **Best bet for a recognizable face:** fixed-per-pixel modulation or terminal-position lookup. Both preserve a direct spatial relationship between the image and the output. Terminal lookup is the cleanest baseline because it leaves the dynamical system untouched.
- **Best bet for a genuinely new dynamical object:** orbit-sampled grayscale. It really does feed image information back into the recurrence and makes intricate, image-dependent boundaries. The trade-off is that the face gets folded into the orbit and is less directly legible.
- **Phase-only feedback:** interesting as a different forcing field, but not a magic “Pepe phase” that restores the face. The phase-only reconstruction retains some structure; the resulting nonlinear orbit remixes it again.
- **Main lesson:** “make a fractal contain Pepe” has at least two goals—recognizable image transfer and image-modified dynamics. A single recurrence does not maximize both. A practical piece could expose a blend between a terminal-lookup layer (legibility) and orbit feedback (novel structure).

The current inputs use an original, hand-drawn frog-face stand-in because no exact Pepe source image was attached. It is **not** a downloaded Pepe image and does not claim to reproduce a particular Pepe image. Replace `make_pepe_source()` with a user-supplied grayscale image to test a specific one.

## Reproduce

Requires Python 3, NumPy, and Pillow:

```sh
python3 experiment.py
```

The script writes the comparison sheet, source frog, phase-only reconstruction, and one PNG per method in the current project directory. It is an offline reference implementation, not yet a real-time interactive shader.
