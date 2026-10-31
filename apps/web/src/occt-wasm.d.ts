// Lepiaci modul Emscripten v occt-wasm nemá vlastné typy; jeho predvolený export je továreň modulu (ADR 0014).
declare module 'occt-wasm/dist/occt-wasm.js' {
  import type { OcctModuleFactory } from 'occt-wasm';

  const createModule: OcctModuleFactory;
  export default createModule;
}
