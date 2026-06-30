/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function main() {
  const inputPath = path.join(
    process.cwd(),
    "extras",
    "Quote-21566G-Cedro-Construction.html",
  );
  let outputPath = path.join(process.cwd(), "docs", "sample-emailed-quote.pdf");
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

    await page.goto(pathToFileURL(inputPath).href, { waitUntil: "load" });
    await page.addStyleTag({ content: ".accept { display: none !important; }" });
    await page.evaluate(() => {
      document.querySelectorAll(".thankyou").forEach((element) => {
        element.innerHTML =
          "Thank you for contacting <strong>Western Materials</strong> for your Sand and Gravel needs. Please contact us if you would like to schedule a delivery or if you have any questions. Have a wonderful day.";
      });
    });
    const sections = await page.locator(".page").all();
    const images = [];

    for (const section of sections) {
      images.push((await section.screenshot()).toString("base64"));
    }

    const pdfPage = await browser.newPage();

    await pdfPage.setContent(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: Letter; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; }
    .sheet {
      width: 8.5in;
      height: 11in;
      page-break-after: always;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sheet:last-child { page-break-after: auto; }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>
  ${images
    .map(
      (image, index) =>
        `<section class="sheet"><img src="data:image/png;base64,${image}" alt="Quote page ${
          index + 1
        }"></section>`,
    )
    .join("")}
</body>
</html>`);
    const pdfOptions = {
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    };

    try {
      await pdfPage.pdf({
        ...pdfOptions,
        path: outputPath,
      });
    } catch (error) {
      if (!isBusyFileError(error)) {
        throw error;
      }

      outputPath = path.join(process.cwd(), "docs", "sample-emailed-quote-no-accept.pdf");
      await pdfPage.pdf({
        ...pdfOptions,
        path: outputPath,
      });
    }
    console.log(outputPath);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function isBusyFileError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EBUSY"
  );
}
