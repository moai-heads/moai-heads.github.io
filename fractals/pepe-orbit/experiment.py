#!/usr/bin/env python3
"""Image-driven Julia experiments; deterministic, NumPy + Pillow only."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

OUT = Path(__file__).resolve().parent


def make_pepe_source(size=512):
    """Draw an original, deliberately simple frog face as a repeatable test image."""
    im = Image.new('RGB', (size, size), (21, 27, 29))
    d = ImageDraw.Draw(im)
    # Head, jaw, and eyes: a meme-frog expression without importing a source image.
    d.ellipse((42, 52, 470, 477), fill=(87, 164, 93), outline=(15, 34, 26), width=16)
    d.polygon([(70, 300), (110, 413), (198, 467), (321, 467), (408, 413), (452, 300)], fill=(103, 178, 101))
    # raised brows and eye mounds
    d.ellipse((91, 70, 256, 260), fill=(73, 151, 82), outline=(17, 39, 28), width=13)
    d.ellipse((254, 66, 419, 258), fill=(73, 151, 82), outline=(17, 39, 28), width=13)
    d.ellipse((115, 91, 244, 236), fill=(236, 234, 206), outline=(28, 40, 29), width=8)
    d.ellipse((266, 86, 394, 232), fill=(236, 234, 206), outline=(28, 40, 29), width=8)
    # pupils glance inward/downward
    d.ellipse((177, 143, 226, 209), fill=(17, 22, 20))
    d.ellipse((276, 141, 326, 208), fill=(17, 22, 20))
    d.ellipse((186, 151, 198, 165), fill=(240, 239, 215))
    d.ellipse((285, 149, 297, 163), fill=(240, 239, 215))
    # nose and cheek planes
    d.ellipse((218, 238, 294, 294), fill=(75, 143, 75), outline=(35, 76, 46), width=6)
    d.ellipse((111, 275, 197, 344), fill=(115, 183, 104))
    d.ellipse((326, 270, 405, 342), fill=(115, 183, 104))
    # drooping, lopsided mouth line and lip
    d.arc((126, 282, 394, 435), start=10, end=170, fill=(31, 43, 33), width=17)
    d.arc((140, 299, 380, 432), start=8, end=174, fill=(190, 104, 97), width=11)
    d.line([(129, 353), (166, 371), (220, 377), (278, 372), (336, 354), (387, 330)], fill=(25, 36, 29), width=12, joint='curve')
    d.line([(168, 389), (229, 400), (293, 392), (350, 369)], fill=(184, 100, 91), width=8, joint='curve')
    # subtle nostrils
    d.ellipse((231, 263, 243, 271), fill=(32, 60, 38))
    d.ellipse((272, 260, 284, 269), fill=(32, 60, 38))
    return im


def bilinear(tex, x, y):
    """Sample a [0,1] texture at wrapped normalized coordinates, vectorized."""
    h, w = tex.shape
    x = np.mod(x, 1.0) * (w - 1)
    y = np.mod(y, 1.0) * (h - 1)
    x0 = np.floor(x).astype(np.int32); y0 = np.floor(y).astype(np.int32)
    x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    fx = x - x0; fy = y - y0
    return ((1-fx)*(1-fy)*tex[y0,x0] + fx*(1-fy)*tex[y0,x1]
            + (1-fx)*fy*tex[y1,x0] + fx*fy*tex[y1,x1])


def colorize(escape, smooth, texval=None):
    # Escape-time palette with a small texture contribution; smooth is NaN for interior.
    t = np.nan_to_num(smooth, nan=0.0, posinf=0.0) / 24.0
    r = 0.5 + 0.5*np.cos(6.28318*(t + 0.00))
    g = 0.5 + 0.5*np.cos(6.28318*(t + 0.32))
    b = 0.5 + 0.5*np.cos(6.28318*(t + 0.66))
    inside = ~escape
    r[inside] *= 0.08; g[inside] *= 0.12; b[inside] *= 0.15
    if texval is not None:
        m = np.clip(texval, 0, 1)
        r = 0.60*r + 0.40*m
        g = 0.60*g + 0.40*m
        b = 0.60*b + 0.40*m
    return np.uint8(np.clip(np.stack([r,g,b], axis=-1), 0, 1)*255)


def render(mode, source, phase_tex=None, width=760, height=570, max_iter=150,
           c0=(-0.745, 0.186), alpha=0.16, image_scale=0.5):
    # plane pixels are initial conditions z0
    yy, xx = np.mgrid[0:height, 0:width]
    px = (xx - width*0.5) * (3.2/height)
    py = (yy - height*0.5) * (3.2/height)
    z = px.astype(np.float64) + 1j*py.astype(np.float64)
    c = complex(*c0)
    alive = np.ones((height,width), dtype=bool)
    escape_iter = np.zeros((height,width), dtype=np.float32)
    smooth = np.full((height,width), np.nan, dtype=np.float32)
    terminal_x = np.zeros((height,width), dtype=np.float64)
    terminal_y = np.zeros((height,width), dtype=np.float64)
    # fixed per-pixel source: image brightness contributes to a pixel's c once.
    if mode == 'fixed-luma':
        field = bilinear(source, (px*image_scale + .5), (py*image_scale + .5))
        cfield = c + alpha * (2*field - 1)
    else:
        cfield = c

    for n in range(max_iter):
        if mode == 'orbit-luma':
            # Image is sampled at each orbit state and perturbs the real component.
            field = bilinear(source, 0.5 + z.real*image_scale, 0.5 + z.imag*image_scale)
            z[alive] = (z[alive]*z[alive] + c + alpha*(2*field[alive]-1))
        elif mode == 'orbit-phase':
            field = bilinear(phase_tex, 0.5 + z.real*image_scale, 0.5 + z.imag*image_scale)
            # phase-only reconstructed image acts as a signed real forcing field
            z[alive] = z[alive]*z[alive] + c + alpha*(2*field[alive]-1)
        elif mode == 'fixed-luma':
            z[alive] = z[alive]*z[alive] + cfield[alive]
        else:
            z[alive] = z[alive]*z[alive] + c
        mag2 = z.real*z.real + z.imag*z.imag
        escaped_now = alive & (mag2 > 256.0)
        if np.any(escaped_now):
            escape_iter[escaped_now] = n + 1
            mag = np.sqrt(mag2[escaped_now])
            smooth[escaped_now] = (n + 1 - np.log2(np.maximum(np.log(mag), 1e-9))).astype(np.float32)
            terminal_x[escaped_now] = z.real[escaped_now]
            terminal_y[escaped_now] = z.imag[escaped_now]
            alive[escaped_now] = False
        if not alive.any():
            break
    terminal_x[alive] = z.real[alive]; terminal_y[alive] = z.imag[alive]
    escaped = ~alive

    if mode == 'terminal-image':
        # No feedback: use final orbit location as a texture lookup for output coloring.
        tex = bilinear(source, 0.5 + terminal_x*image_scale, 0.5 + terminal_y*image_scale)
        rgb = colorize(escaped, smooth, tex)
    else:
        rgb = colorize(escaped, smooth)
    return Image.fromarray(rgb, 'RGB')


def main():
    source_rgb = make_pepe_source()
    source_rgb.save(OUT/'source-frog.png')
    gray = np.asarray(ImageOps.grayscale(source_rgb), dtype=np.float64)/255.0
    # Standard phase-only reconstruction: discard Fourier magnitudes, retain phase.
    F = np.fft.fft2(gray - gray.mean())
    phase = np.angle(F)
    phase_only = np.fft.ifft2(np.exp(1j*phase)).real
    lo, hi = np.quantile(phase_only, [0.01, 0.99])
    phase_tex = np.clip((phase_only-lo)/(hi-lo), 0, 1)
    Image.fromarray(np.uint8(phase_tex*255)).save(OUT/'phase-only-reconstruction.png')

    modes = [
        ('julia', '01 · ordinary Julia'),
        ('fixed-luma', '02 · fixed image field → c'),
        ('orbit-luma', '03 · orbit-sampled grayscale'),
        ('orbit-phase', '04 · orbit-sampled phase-only'),
        ('terminal-image', '05 · final orbit point → image'),
    ]
    tiles=[]
    for mode, label in modes:
        im = render(mode, gray, phase_tex)
        im.save(OUT/f'{mode}.png')
        tiles.append((label,im))
    # contact sheet labels
    try:
        font = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    sw, sh = 480, 390
    sheet = Image.new('RGB',(sw*2, (sh+38)*3),(13,17,19))
    draw = ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        x=(i%2)*sw; y=(i//2)*(sh+38)
        draw.text((x+12,y+6),label,font=font,fill=(222,231,214))
        thumb=im.resize((sw-24,sh-10),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(x+12,y+34))
    sheet.save(OUT/'comparison.png')
    print('Wrote outputs to', OUT)
    print('source luma min/max/mean/std:', gray.min(),gray.max(),gray.mean(),gray.std())
    # Report a quick check of phase-only reconstruction's contrast and correlation.
    print('phase reconstruction min/max/correlation:', phase_tex.min(),phase_tex.max(), np.corrcoef(gray.ravel(),phase_tex.ravel())[0,1])

if __name__ == '__main__':
    main()
