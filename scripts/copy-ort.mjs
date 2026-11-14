// Copies the ONNX Runtime WebAssembly files into public/ort so the browser can load them.
// Runs automatically after npm install, which keeps them in step with the installed version.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/onnxruntime-web/dist/";
mkdirSync("public/ort", { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  cpSync(src + f, "public/ort/" + f);
}
console.log("Copied ONNX Runtime wasm files to public/ort");
