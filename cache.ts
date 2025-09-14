// Archivo: cache.ts
// Su única misión es forzar la descarga de Puppeteer y su navegador.
import puppeteer from "https://deno.land/x/puppeteer@22.10.0/mod.ts";

console.log("Forzando la descarga del navegador de Puppeteer...");
const browser = await puppeteer.launch();
await browser.close();
console.log("Descarga y caché de Puppeteer completada.");
