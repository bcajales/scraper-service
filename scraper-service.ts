// Archivo: scraper-service.ts
import { serve, puppeteer, cheerio } from "./deps.ts";

async function scrapeAllAttachmentsWithBrowser(initialUrl: string): Promise<any[]> {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        console.log(`[PUPPETEER] Navegando a: ${initialUrl}`);
        await page.goto(initialUrl, { waitUntil: 'networkidle2' });

        const allAttachments: { nombre: string; url_descarga: string }[] = [];
        const processedUrls = new Set<string>();
        const html = await page.content();
        const $ = cheerio.load(html);

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

        const dedicatedPageLink = $("a[href*='ViewAttachment.aspx']").attr('href');
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
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

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

const port = Deno.env.get("PORT") ? Number(Deno.env.get("PORT")) : 8000;
console.log(`Servidor de scraping listo para recibir peticiones en el puerto ${port}.`);
serve(handler, { port, hostname: "0.0.0.0" });
serve(handler, { port, hostname: "0.0.0.0" });
