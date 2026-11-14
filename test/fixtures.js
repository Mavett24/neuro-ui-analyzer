// Synthetic screenshots drawn straight into RGBA buffers, so the pixel pipeline can be tested in
// Node without a browser or a canvas.

export function canvas(w, h, bg = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  const img = { data, w, h };
  img.rect = (x, y, rw, rh, [r, g, b]) => {
    for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) {
        const i = (yy * w + xx) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    return img;
  };
  // Lines of "text": short dark dashes with gaps, like glyphs at a distance.
  img.text = (x, y, width, lines, size = 10, colour = [20, 20, 20]) => {
    for (let l = 0; l < lines; l++)
      for (let cx = x; cx < x + width; cx += Math.round(size * 0.7))
        if ((cx * 7 + l * 13) % 5 !== 0) img.rect(cx, y + l * size * 1.6, Math.round(size * 0.5), size, colour);
    return img;
  };
  img.rect(0, 0, w, h, bg);
  return img;
}

// A plain landing page: nav, headline, paragraph, one orange filled button.
export function landingPage() {
  const page = canvas(512, 320);
  page.text(24, 16, 80, 1, 8); // logo
  page.text(300, 16, 180, 1, 6); // nav links
  page.text(24, 90, 240, 2, 16); // headline
  page.text(24, 150, 220, 3, 6, [90, 90, 90]); // paragraph
  page.rect(24, 200, 110, 34, [255, 90, 40]); // button
  page.text(40, 212, 70, 1, 9, [255, 255, 255]); // button label
  page.rect(300, 80, 180, 170, [235, 238, 242]); // card
  return page;
}

// Monochrome layout with grey photo-like gradients: should read as zero hue families.
export function monochromePage() {
  const page = canvas(512, 320, [0, 0, 0]);
  for (let x = 0; x < 512; x++) page.rect(x, 40, 1, 160, [x / 2, x / 2, x / 2]);
  page.text(24, 230, 300, 2, 12, [255, 255, 255]);
  return page;
}

// Dark portfolio-style page: a white pill in the nav and an orange hero button with a thin,
// antialiased label (strokes partly blended into the fill, as in a downscaled screenshot).
export function darkPageWithTwoButtons() {
  const page = canvas(1024, 506, [8, 8, 10]);
  page.text(24, 14, 90, 1, 7, [230, 230, 230]); // logo
  page.text(560, 14, 180, 1, 6, [220, 220, 220]); // nav links
  page.rect(765, 7, 53, 16, [253, 253, 253]); // nav pill
  page.text(772, 11, 38, 1, 7, [12, 12, 12]); // its label
  page.text(36, 150, 300, 2, 22, [235, 235, 235]); // headline
  page.text(36, 240, 260, 3, 6, [150, 150, 150]); // paragraph
  page.rect(236, 313, 106, 20, [230, 80, 31]); // hero button
  for (let x = 246; x < 330; x += 4) {
    page.rect(x, 319, 1, 8, [255, 255, 255]); // stroke core
    page.rect(x + 1, 319, 1, 8, [242, 167, 143]); // antialiased edge
  }
  return page;
}

// A saliency map with Gaussian blobs at the given (x, y, strength) points, in 0..1 coordinates.
export function saliency(w, h, blobs) {
  const map = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const [bx, by, s] of blobs) {
        const dx = x / w - bx,
          dy = y / h - by;
        v += s * Math.exp(-(dx * dx + dy * dy) / (2 * 0.04 * 0.04));
      }
      map[y * w + x] = v;
    }
  return { w, h, map };
}
