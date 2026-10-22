import { describe, expect, it } from "vitest";
import { detectSource } from "@/lib/integrations/url-analysis/detect";
import { extractMetadata, parsePage } from "@/lib/integrations/url-analysis/extract";

describe("deteccao de origem", () => {
  it("identifica publicacoes do X", () => {
    const source = detectSource("https://x.com/acervo/status/1234567890");
    expect(source.kind).toBe("twitter");
    expect(source.resourceId).toBe("1234567890");
  });

  it("identifica videos do YouTube", () => {
    expect(detectSource("https://youtu.be/abc123").kind).toBe("youtube");
    expect(detectSource("https://www.youtube.com/watch?v=abc123").kind).toBe("youtube");
  });

  it("identifica midia direta", () => {
    expect(detectSource("https://cdn.exemplo.com/foto.jpg").kind).toBe("direct-media");
  });

  it("trata paginas comuns", () => {
    expect(detectSource("https://exemplo.com/artigo").kind).toBe("webpage");
  });
});

describe("extracao de metadados", () => {
  const html = `
    <html>
      <head>
        <title>Foto de paisagem</title>
        <meta property="og:title" content="Foto de paisagem" />
        <meta property="og:description" content="Uma imagem de montanha" />
        <meta property="og:image" content="/capa.jpg" />
        <meta property="og:site_name" content="Exemplo" />
        <link rel="canonical" href="https://exemplo.com/post/1" />
        <script type="application/ld+json">
          {"@type":"VideoObject","contentUrl":"https://exemplo.com/video.mp4","thumbnailUrl":"/thumb.jpg","name":"Video 1"}
        </script>
      </head>
      <body><img src="/outra.jpg" /><video src="/clip.mp4"></video></body>
    </html>`;

  it("extrai metadados Open Graph", () => {
    const metadata = extractMetadata(html, "https://exemplo.com/post/1");
    expect(metadata.title).toBe("Foto de paisagem");
    expect(metadata.description).toBe("Uma imagem de montanha");
    expect(metadata.siteName).toBe("Exemplo");
    expect(metadata.image).toBe("https://exemplo.com/capa.jpg");
    expect(metadata.canonicalUrl).toBe("https://exemplo.com/post/1");
  });

  it("encontra midias via JSON-LD e tags", () => {
    const { candidates } = parsePage(html, "https://exemplo.com/post/1");
    const urls = candidates.map((candidate) => candidate.downloadUrl);
    expect(urls).toContain("https://exemplo.com/video.mp4");
    expect(urls).toContain("https://exemplo.com/capa.jpg");
    expect(urls).toContain("https://exemplo.com/outra.jpg");
    expect(urls).toContain("https://exemplo.com/clip.mp4");
  });

  it("nao inventa midias em paginas sem midia", () => {
    const { candidates } = parsePage("<html><head><title>Vazio</title></head><body></body></html>", "https://exemplo.com");
    expect(candidates).toHaveLength(0);
  });
});
