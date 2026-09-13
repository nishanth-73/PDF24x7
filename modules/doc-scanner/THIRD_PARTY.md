# Third-party components

## DocAligner LC100 page-corner model

- File: `android/src/main/assets/docaligner_lc100.onnx`
- Source: DocsaidLab/DocAligner, model `lcnet100_h_e_bifpn_256_fp32.onnx` — https://github.com/DocsaidLab/DocAligner
- License: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Changes: graph simplified with onnxsim, and each BiFPN `Einsum` weighted sum rewritten as equivalent `Mul`/`Add`
  nodes so OpenCV's DNN module can load it. Outputs match the original model to within 1e-6.

## OpenCV

- Maven `org.opencv:opencv:4.12.0` — Apache License 2.0 — https://opencv.org/license/

## ZXing

- Maven `com.google.zxing:core:3.5.3` — Apache License 2.0 — https://github.com/zxing/zxing
