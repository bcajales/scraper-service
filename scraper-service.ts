import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import puppeteer from "https://deno.land/x/puppeteer@22.10.0/mod.ts";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

/**
 * Navega a una URL de licitación de Mercado Público y extrae los nombres y URLs de los
 * archivos adjuntos, tanto de la tabla principal como de la página de adjuntos dedicada.
 * @param initialUrl La URL de la ficha de la licitación.
 * @returns Una promesa que se resuelve en un array de objetos de anexos.
 */
async function scrapeAllAttachmentsWithBrowser(initialUrl: string): Promise<{ nombre: string; url_descarga: string }[]> {
    let browser;
    try {
        // Inicia el navegador en modo "headless" (sin interfaz gráfica)
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos necesarios para entornos de despliegue
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // 1. Navegar a la página inicial y esperar a que se cargue por completo
        console.log(`[PUPPETEER] Navegando a: ${initialUrl}`);
        await page.goto(initialUrl, { waitUntil: 'networkidle2' });
        
        const allAttachments: { nombre: string; url_descarga: string }[] = [];
        const processedUrls = new Set<string>(); // Para evitar duplicados

        const html = await page.content();
        const $ = cheerio.load(html);

        // 1a. Buscar anexos en la tabla principal de la ficha
        $('table[id*="grvAnexos"] tbody tr').each((_, row) => {
            const nombreAnexo = $(row).find('td:nth-child(1)').text().trim();
            const inputDescarga = $(row).find('input[type="image"]');
            if (nombreAnexo && inputDescarga.length > 0) {
                const onclickAttr = inputDescarga.attr('onclick');
                const match = onclickAttr?.match(/fn_descargar_anexo_v2\s*\(\s*['"]?(\d+)['"]?/);
                if (match && match[1]) {
                    const idDoc = match[1];
                    const idLicitacion = new URL(initialUrl).searchParams.get('idlicitacion');
                    const linkDescarga = `https://www.mercadopublico.cl/Procurement/Modules/RFB/DownloadDoc.aspx?idlic=${idLicitacion}&idDoc=${idDoc}`;
                    if (!processedUrls.has(linkDescarga)) {
                        allAttachments.push({ nombre: nombreAnexo, url_descarga: linkDescarga });
                        processedUrls.add(linkDescarga);
                    }
                }
            }
        });

        // 1b. Buscar el enlace a la página dedicada de "Ver adjuntos"
        const dedicatedPageLink = $("a[href*='ViewAttachment.aspx']").attr('href');
        
        // 2. Si se encuentra el enlace, navegar a esa página y extraer más anexos
        if (dedicatedPageLink) {
            const dedicatedPageUrl = new URL(dedicatedPageLink, initialUrl).href;
            console.log(`[PUPPETEER] Navegando a la página de adjuntos dedicada: ${dedicatedPageUrl}`);
            await page.goto(dedicatedPageUrl, { waitUntil: 'networkidle2' });
            
            const dedicatedHtml = await page.content();
            const $d = cheerio.load(dedicatedHtml);

            $d('table[id*="grdArchivos"] tbody tr').each((_, row) => {
                const nombreAnexo = $d(row).find('td').eq(0).text().trim();
                const linkElement = $d(row).find('td').eq(2).find('a');
                if (nombreAnexo && linkElement.length > 0) {
                    const linkDescarga = new URL(linkElement.attr('href'), initialUrl).href;
                    if (!processedUrls.has(linkDescarga)) {
                        allAttachments.push({ nombre: nombreAnexo, url_descarga: linkDescarga });
                        processedUrls.add(linkDescarga);
                    }
                }
            });
        }

        console.log(`[PUPPETEER] Se encontraron ${allAttachments.length} anexos en total.`);
        return allAttachments;

    } catch (error) {
        console.error(`[PUPPETEER_ERROR] Fallo durante el scraping de ${initialUrl}:`, error);
        return []; // Devolver array vacío en caso de error
    } finally {
        // Asegurarse de cerrar el navegador siempre para liberar recursos
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Manejador principal de las peticiones HTTP al servidor.
 * @param req La petición entrante.
 * @returns Una respuesta HTTP.
 */
async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
        return new Response("Método no permitido", { status: 405 });
    }
    try {
        const { url } = await req.json();
        if (!url) {
            return new Response(JSON.stringify({ error: 'La URL es requerida' }), { status: 400 });
        }
        const data = await scrapeAllAttachmentsWithBrowser(url);
        return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

// Obtiene el puerto del entorno de Deno Deploy, o usa 8000 para pruebas locales.
const port = Deno.env.get("PORT") ? Number(Deno.env.get("PORT")) : 8000;

console.log(`Servidor de scraping listo para recibir peticiones en el puerto ${port}.`);

// Inicia el servidor escuchando en todas las interfaces de red (0.0.0.0) y en el puerto correcto.
serve(handler, { port, hostname: "0.0.0.0" });
