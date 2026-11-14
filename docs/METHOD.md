# Method

How every number in the report is produced, and what each one assumes. The code is the source of truth. File references point to where each step lives.

The guiding rule: every output is an estimate, it says so, and the same image always gives the same reading.

## 1. Predicted attention

**Gaze map** (`lib/saliency.js`)

The screenshot goes into [UNISAL](https://github.com/rdroste/unisal) (Droste et al., 2020), a saliency model trained on human eye-tracking recordings. It runs in the browser through ONNX Runtime Web (WASM, single thread).

- Input is resized to 384 px wide (sides rounded to multiples of 32, height capped at 1024 px) and normalized with ImageNet statistics.
- Resizing happens in halving steps. A single large canvas resize aliases thin text, and the model is sensitive to that: in testing it pulled predicted attention off headlines.
- If the model can't load, a contrast-based fallback runs instead and the UI labels it as such.

**Scanpath** (`lib/scanpath.js`)

The order of fixations in the first 3 seconds, from the classic winner-take-all and inhibition-of-return model (Itti, Koch & Niebur, 1998):

1. Start at the centre of the first screen, as after a central fixation cross.
2. Jump to the most salient point, weighted by a mild preference for nearby targets (Gaussian, sigma 0.32 image widths).
3. Suppress the area just fixated. The radius is about 2° of visual angle: 0.07 image widths on desktop and 0.16 on a phone, which is held closer.
4. Repeat until 3 seconds or 14 fixations.

Fixation duration scales with salience (190 to 400 ms). Saccade time scales with distance (30 to 140 ms). The CTA counts as seen when a fixation lands inside its box or within 0.01 image widths of it, since gaze is only precise to a fraction of a degree.

**Assumes:** free viewing with no task; a still image, so animation is underrated; and a model trained on natural images, which makes it a prior for UIs, not a recording.

## 2. Layout diagnostics

All computed from pixels, with no AI (`lib/heuristics.js`). The image is analyzed at 512 px wide in 8 px blocks.

| Metric | How it's computed |
| --- | --- |
| White space | Share of 8 px blocks that are flat and match one of the page's background colours. |
| Visual clutter | `100 × min(1, 2.2 × edge density + 0.4 × occupied area + 0.12 × colour variety)`. On calm pages, photo areas are partly discounted, so a quiet hero image doesn't read as clutter. |
| Colour palette | Flat fills are clustered in OKLab (distance 0.055 merges shades). Chroma under 0.04 counts as neutral. Hues within 32° form one family. Gradients and imagery are excluded, which is why a monochrome page with photos reads as 0 hue families. |
| Left / right balance | Detail weight in the left half against the right half, where 1 means equal. |
| Primary CTA | `lib/cta.js` looks for a filled region with straight edges, button proportions, a contrasting label inside and a different colour around it. The label colour is read from its stroke cores, because small text is antialiased into the fill. Each candidate is scored. Below a confidence of 0.34 the answer is "no CTA found" rather than a guess. When a saturated button and a neutral one score within 20% of each other, the saturated one wins: by convention the primary action carries the accent colour. Contrast is checked against WCAG 2.2 SC 1.4.11 (3:1 for UI components). |
| Attention on CTA | Highest predicted attention inside the CTA box, as a percentage of the page's peak. |

**Assumes:** only filled buttons count as CTA candidates (ghost buttons and text links are skipped), and thresholds are general guidance, not rules for every kind of screen.

## 3. Brain regions

**Maps** (`public/brain/`)

Ten [NeuroQuery](https://neuroquery.org) meta-analytic z-maps (Dockès et al., 2020), each predicted from about 13,000 published fMRI studies: visual processing, attention, working memory load, colour, reading, faces, objects, scenes, reward and decision making. They are shown on the ICBM152 cortical surface and as MRI slices with AAL region names.

**Weights** (`lib/brain.js`)

How strongly a design is expected to engage each function. This is the tool's model, not a measurement, and the reason for each weight is shown on its card. All weights are clamped to 0 to 1.

| Function | Weight |
| --- | --- |
| Visual processing | `0.5 + 1.2 × RMS contrast + edge density / 40` |
| Attention and visual search | `0.25 + edge density / 20 + (1 − balance) / 4` |
| Working memory load | `edge density / 18 + hue families / 12 + 0.25 if white space < 25%` |
| Colour processing | `0.1 + 0.4 × min(1, hue families / 5) + 0.5 × coloured area` |
| Reading | text amount (0 to 1) |
| Face perception | `0.5 × faces` |
| Object recognition | object imagery share |
| Scene perception | scene imagery share |
| Reward and value | `reward cues / 3` (prices, discounts, ratings, badges) |
| Decision making | `log2(choices + 1) / 4`, following Hick's law |

Edge density is in percent. The first four come from pixels. The last six need content detection, so they stay pending until the deep analysis runs.

The displayed map is the weighted sum of the term maps. Its colour scale tops out at the 99.5th percentile of active voxels, so one hot spot doesn't flatten everything else.

**Assumes:** a population average of where research places each function, not one person's brain. And no brain is recorded.

## 4. Deep research analysis (opt-in)

Two server routes call the Gemini API with a downscaled JPEG (longest side 1024 px) plus the measured metrics.

- `/api/features` returns content as plain numbers (text amount, faces, imagery shares, reward cues, choices). The model never decides anything about the brain: `lib/brain.js` maps those numbers to weights.
- `/api/review` streams a written review. It is told to treat the metrics as evidence, name the principle behind each issue (Hick's law, Fitts's law, Gestalt, hierarchy) and say when the image contradicts a metric.

Models are tried in order: Flash-Lite first, because on the free tier it answers in seconds. A model that sends nothing within 12 seconds is skipped.

**Assumes:** vision models misread screens sometimes. The measured numbers stay the evidence.

## References

- Dockès, J., et al. (2020). NeuroQuery, comprehensive meta-analysis of human brain mapping. *eLife*, 9, e53385.
- Droste, R., Jiao, J., & Noble, J. A. (2020). Unified image and video saliency modeling. *ECCV*.
- Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *Journal of Experimental Psychology*, 47(6), 381-391.
- Hick, W. E. (1952). On the rate of gain of information. *Quarterly Journal of Experimental Psychology*, 4(1), 11-26.
- Itti, L., Koch, C., & Niebur, E. (1998). A model of saliency-based visual attention for rapid scene analysis. *IEEE TPAMI*, 20(11), 1254-1259.
- Tzourio-Mazoyer, N., et al. (2002). Automated anatomical labeling of activations in SPM. *NeuroImage*, 15(1), 273-289.
- W3C (2023). Web Content Accessibility Guidelines 2.2, SC 1.4.11 Non-text Contrast.
