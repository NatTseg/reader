// Local file formats. Imported markup never runs scripts or fetches remote assets.
const LIBRARY_FILE_LIMIT = 50 * 1024 * 1024;
function libraryPdfBlocks(content) {
  const lines = [];
  let line;
  for (const item of content.items || []) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const size = Math.abs(item.transform?.[3] || item.height || 12);
    const x = item.transform?.[4] || 0, y = item.transform?.[5] || 0;
    if (!line || Math.abs(y - line.y) > size * .3) {
      line = {text: "", x, y, size}; lines.push(line);
    }
    line.text += (line.text && !/\s$/.test(line.text) && !/^\s|^[,.;:!?)]/.test(item.str) ? " " : "") + item.str;
    line.size = Math.max(line.size, size);
    if (item.hasEOL) line = null;
  }
  if (!lines.length) return [];
  const weighted = lines.flatMap(l => Array(Math.min(100, Math.max(1, l.text.length))).fill(l.size)).sort((a,b) => a-b);
  const bodySize = weighted[Math.floor(weighted.length / 2)];
  const gaps = lines.slice(1).map((l,i) => lines[i].y-l.y).filter(g => g > bodySize*.6 && g < bodySize*2.2).sort((a,b) => a-b);
  const leading = gaps[Math.floor(gaps.length / 2)] || bodySize*1.4;
  const blocks = [];
  let previous;
  for (const l of lines) {
    const text = l.text.trim();
    const heading = l.size > bodySize*1.17 && text.length < 180;
    const newParagraph = !previous || heading || blocks.at(-1)?.kind === "heading" ||
      previous.y-l.y > leading*1.35 || previous.y-l.y < -bodySize ||
      l.x-previous.x > bodySize || /^[•▪‣]|^\d+[.)]\s/.test(text);
    if (newParagraph) blocks.push({kind: heading ? "heading" : "paragraph", text});
    else blocks.at(-1).text += (/[-\u00ad]$/.test(blocks.at(-1).text) ? "" : " ") + text;
    previous = l;
  }
  return blocks;
}
function libraryBlocksHtml(blocks) {
  return blocks.map(b => b.kind === "heading" ? `<h3>${esc(b.text)}</h3>` : `<p>${esc(b.text)}</p>`).join("");
}
function libraryZipEntries(bytes, limit = 100 * 1024 * 1024, entryLimit = 20 * 1024 * 1024) {
  let total = 0, count = 0;
  const names = new Set();
  const files = fflate.unzipSync(bytes, {filter(entry) {
    const name = entry.name;
    if (++count > 5000 || names.has(name) || name.startsWith("/") || name.includes("\\") ||
        name.split("/").includes("..") || !Number.isSafeInteger(entry.originalSize) ||
        entry.originalSize < 0 || entry.originalSize > entryLimit || (total += entry.originalSize) > limit)
      throw new Error("This archive is too large or contains invalid entries.");
    names.add(name); return true;
  }});
  return files;
}
function libraryArchivePath(base, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return null;
  let decoded;
  try { decoded = decodeURIComponent(href.split("#")[0].split("?")[0]); } catch { return null; }
  if (!decoded) return base;
  const parts = href.startsWith("/") ? [] : base.split("/").slice(0,-1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part.includes("\\")) return null;
    else parts.push(part);
  }
  return parts.join("/");
}
function libraryXml(bytes) {
  if (!bytes) throw new Error("This EPUB is missing a required file.");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This EPUB contains an unreadable document.");
  return doc;
}
function libraryElements(node, name) { return [...node.getElementsByTagNameNS("*", name)]; }
function libraryEpubPlainText(node) {
  if (node.nodeType === 3) return node.textContent;
  const text = [...node.childNodes].map(libraryEpubPlainText).join("");
  return text + (/^(p|div|section|h[1-6]|li|blockquote|br|tr)$/.test(node.localName || "") ? " " : "");
}
function parseLibraryEpub(bytes) {
  const files = libraryZipEntries(bytes);
  if (new TextDecoder().decode(files.mimetype || []).trim() !== "application/epub+zip")
    throw new Error("Choose a valid EPUB book.");
  const container = libraryXml(files["META-INF/container.xml"]);
  const packagePath = libraryElements(container, "rootfile")[0]?.getAttribute("full-path");
  const opf = libraryXml(files[packagePath]);
  if (libraryElements(opf,"meta").some(n => n.getAttribute("property") === "rendition:layout" && n.textContent.trim() === "pre-paginated"))
    throw new Error("This EPUB uses fixed pages. Import its PDF edition instead.");
  // Font obfuscation is common in otherwise readable books; encrypted text is not.
  if (files["META-INF/encryption.xml"]) {
    const encrypted = libraryXml(files["META-INF/encryption.xml"]);
    if (libraryElements(encrypted,"EncryptedData").some(node => {
      const algorithm = libraryElements(node,"EncryptionMethod")[0]?.getAttribute("Algorithm");
      return !["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"].includes(algorithm);
    })) throw new Error("This EPUB is protected. Import an EPUB without DRM.");
  }
  const manifest = new Map(libraryElements(opf,"item").map(item => [item.getAttribute("id"), {
    path:libraryArchivePath(packagePath,item.getAttribute("href")),
    type:item.getAttribute("media-type"), properties:item.getAttribute("properties") || ""
  }]));
  const sections = libraryElements(opf,"itemref").filter(item => item.getAttribute("linear") !== "no").map(item => {
    const entry = manifest.get(item.getAttribute("idref"));
    if (!entry || !["application/xhtml+xml","text/html"].includes(entry.type) || !files[entry.path])
      throw new Error("This EPUB has an unsupported or missing reading section.");
    const doc = libraryXml(files[entry.path]);
    const body = libraryElements(doc,"body")[0];
    if (!body) throw new Error("This EPUB has an empty reading section.");
    for (const node of body.querySelectorAll("script,style,iframe,object,embed,form,audio,video")) node.remove();
    const title = libraryElements(body,"h1")[0]?.textContent || libraryElements(body,"h2")[0]?.textContent || "";
    return {path:entry.path, body, title:title.trim(), text:libraryEpubPlainText(body).replace(/\s+/g," ").trim()};
  });
  if (!sections.length || sections.length > 2000) throw new Error("This EPUB has no supported reading sections.");
  const toc = [];
  function addLink(label, href, base) {
    const path = libraryArchivePath(base,href), section = sections.findIndex(s => s.path === path);
    if (section < 0 || !label.trim()) return;
    const anchor = href.split("#").slice(1).join("#");
    let fragment = ""; try { fragment = decodeURIComponent(anchor); } catch {}
    toc.push({title:label.trim(), page:section+1, anchor:fragment});
    if (!sections[section].title) sections[section].title = label.trim();
  }
  const nav = [...manifest.values()].find(item => item.properties.split(/\s+/).includes("nav"));
  if (nav && files[nav.path]) {
    const doc = libraryXml(files[nav.path]);
    const navigation = libraryElements(doc,"nav").find(n => (n.getAttributeNS("http://www.idpf.org/2007/ops","type") || n.getAttribute("epub:type") || "").split(/\s+/).includes("toc"));
    if (navigation) for (const link of libraryElements(navigation,"a")) addLink(link.textContent,link.getAttribute("href") || "",nav.path);
  }
  if (!toc.length) {
    const ncx = [...manifest.values()].find(item => item.type === "application/x-dtbncx+xml");
    if (ncx && files[ncx.path]) for (const point of libraryElements(libraryXml(files[ncx.path]),"navPoint")) {
      const label = [...point.children].find(n => n.localName === "navLabel");
      const target = [...point.children].find(n => n.localName === "content");
      if (label && target) addLink(label.textContent,target.getAttribute("src") || "",ncx.path);
    }
  }
  sections.forEach((section,i) => { if (!section.title) section.title = `Section ${i+1}`; });
  return {files,sections,toc:toc.length ? toc : sections.map((s,i) => ({title:s.title,page:i+1,anchor:""})),
    title:libraryElements(opf,"title")[0]?.textContent.trim() || "",
    author:libraryElements(opf,"creator").map(n => n.textContent.trim()).filter(Boolean).join(", ")};
}
function libraryEpubHtml(epub, section, urls) {
  const allowed = new Set(["p","div","section","article","h1","h2","h3","h4","h5","h6","blockquote","ul","ol","li","em","strong","b","i","u","s","sup","sub","small","span","br","hr","pre","code","table","thead","tbody","tr","th","td","figure","figcaption","a","img"]);
  const discard = new Set(["script","style","iframe","object","embed","form","input","button","svg","math","link","audio","video"]);
  function clean(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    if (node.nodeType !== 1 || discard.has(node.localName)) return document.createDocumentFragment();
    const tag = node.localName;
    const result = allowed.has(tag) ? document.createElement(tag) : document.createDocumentFragment();
    if (result.nodeType === 1) {
      if (node.getAttribute("id")) result.id = `epub-${node.getAttribute("id")}`;
      if (tag === "a") {
        const href = node.getAttribute("href") || "", path = libraryArchivePath(section.path,href);
        const index = epub.sections.findIndex(s => s.path === path);
        if (index >= 0) {
          result.href = "#"; result.dataset.librarySection = String(index+1);
          try { result.dataset.libraryAnchor = decodeURIComponent(href.split("#").slice(1).join("#")); } catch {}
        } else if (/^https?:\/\//i.test(href)) { result.href=href; result.target="_blank"; result.rel="noopener noreferrer"; }
      }
      if (tag === "img") {
        const path = libraryArchivePath(section.path,node.getAttribute("src"));
        const type = /\.png$/i.test(path || "") ? "image/png" : /\.jpe?g$/i.test(path || "") ? "image/jpeg" : /\.gif$/i.test(path || "") ? "image/gif" : /\.webp$/i.test(path || "") ? "image/webp" : "";
        result.alt = node.getAttribute("alt") || "";
        if (type && epub.files[path]) { const url = URL.createObjectURL(new Blob([epub.files[path]],{type})); urls.push(url); result.src=url; }
      }
    }
    for (const child of node.childNodes) result.append(clean(child));
    return result;
  }
  const holder = document.createElement("div");
  for (const child of section.body.childNodes) holder.append(clean(child));
  return holder.innerHTML;
}
