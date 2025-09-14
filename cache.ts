// Archivo: cache.ts (Versión Ligera)
// Su única misión es forzar la descarga del navegador sin lanzarlo.
import puppeteer from "https://deno.land/x/puppeteer@22.10.0/mod.ts";

console.log("Forzando la caché del navegador de Puppeteer...");

// Esta función verifica que el navegador exista y lo descarga si es necesario.
// Es mucho menos intensiva que puppeteer.launch().
const executablePath = await puppeteer.executablePath();

console.log(`Descarga y caché de Puppeteer completada. Path: ${executablePath}`);
