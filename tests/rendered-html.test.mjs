import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Griglia PCP shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Griglia PCP \| Repertory Grid Studio<\/title>/i);
  assert.match(html, /src="\/griglia-pcp\/index\.html"/i);
  assert.match(html, /title="Griglia PCP Repertory Grid Studio"/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships the complete static application and social preview", async () => {
  const [page, layout, packageJson, appHtml, appScript] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/griglia-pcp/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/griglia-pcp/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /\/griglia-pcp\/index\.html/);
  assert.match(layout, /Griglia PCP \| Repertory Grid Studio/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(appHtml, /data-view="dynamics"/);
  assert.match(appHtml, /Sperimentale/);
  assert.match(appHtml, /id="gridNameInput"/);
  assert.match(appScript, /Nome della griglia aggiornato/);
  await access(new URL("../public/griglia-pcp/styles.css", import.meta.url));
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
