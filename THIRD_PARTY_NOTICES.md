# Third-party notices

The MIT license in [LICENSE](LICENSE) covers the source code written for this project. The model weights and brain data in `public/` come from other projects and keep their own licenses, listed below. Their notices are reproduced here as those licenses require.

| Asset                                  | Files                                                                              | Source                                                                         | License                  |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| UNISAL gaze model                      | `public/models/unisal.onnx`                                                        | [rdroste/unisal](https://github.com/rdroste/unisal)                            | Apache 2.0               |
| NeuroQuery maps                        | `public/brain/terms.bin`, `public/brain/surface.bin`, `public/brain/terms.json`    | [neuroquery/neuroquery_data](https://github.com/neuroquery/neuroquery_data)    | BSD 3-Clause             |
| MNI ICBM152 template and cortical mesh | `public/brain/mni152.nii.gz`, `public/brain/mesh.bin`, `public/brain/header2x.bin` | McConnell Brain Imaging Centre, via [Niivue](https://github.com/niivue/niivue) | MNI notice, BSD 2-Clause |
| AAL atlas                              | `public/brain/aal.nii.gz`, `public/brain/labels.bin`                               | [GIN, CNRS](https://www.gin.cnrs.fr/en/tools/aal/)                             | GNU GPL                  |

## Important: the AAL atlas is GPL-licensed

The AAL atlas is distributed by its authors as freeware under the GNU General Public License. The two files derived from it (`aal.nii.gz` and `labels.bin`, which hold the region names shown in the brain viewer) are **not** covered by this project's MIT license. They are separate data files loaded at runtime, and they remain under the GPL. If you reuse this project and need a fully permissive stack, replace those two files with a parcellation that has a permissive license.

The region descriptions in `lib/regions.js` were written for this project and are MIT-licensed. The region names follow the AAL nomenclature.

## UNISAL

Droste, R., Jiao, J., & Noble, J. A. (2020). _Unified Image and Video Saliency Modeling._ ECCV.

Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0). Modified for this project: the pretrained image branch was exported to ONNX for in-browser inference. No retraining.

## NeuroQuery

Dockès, J., Poldrack, R. A., Primet, R., et al. (2020). _NeuroQuery, comprehensive meta-analysis of human brain mapping._ eLife, 9, e53385.

Ten term maps were exported from the NeuroQuery model and stored as 8-bit values for this project.

```
BSD 3-Clause License

Copyright (c) 2019, jeromedockes
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## MNI ICBM152

The ICBM152 template comes with this notice:

```
Copyright (C) 1993-2009 Louis Collins, McConnell Brain Imaging Centre,
Montreal Neurological Institute, McGill University. Permission to use, copy,
modify, and distribute this software and its documentation for any purpose
and without fee is hereby granted, provided that the above copyright notice
appear in all copies. The authors and McGill University make no
representations about the suitability of this software for any purpose. It
is provided "as is" without express or implied warranty.
```

## Niivue

The cortical mesh was taken from Niivue's demo images. Niivue is also a runtime dependency.

```
BSD 2-Clause License

Copyright (c) 2021, Niivue
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## AAL

Tzourio-Mazoyer, N., Landeau, B., Papathanassiou, D., et al. (2002). _Automated anatomical labeling of activations in SPM using a macroscopic anatomical parcellation of the MNI MRI single-subject brain._ NeuroImage, 15(1), 273-289.

Distributed by the Groupe d'Imagerie Neurofonctionnelle (GIN) under the GNU General Public License, as stated in the AAL readme. See https://www.gnu.org/licenses/ for the license texts.

## npm dependencies

Runtime dependencies are installed from npm and are not committed. Their licenses: Next.js, React, three.js and ONNX Runtime Web (MIT), Niivue (BSD 2-Clause), Inter and Space Grotesk fonts via Fontsource (SIL Open Font License 1.1).
