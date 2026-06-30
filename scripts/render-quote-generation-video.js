/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const audioPath = path.join(root, "docs", "videos", "quote-generation-voiceover.wav");
const outputPath = path.join(root, "docs", "videos", "quote-generation-process-with-voice.webm");

const slides = [
  {
    eyebrow: "QuoteBase",
    title: "Quote Generation Process",
    body: "A consistent workflow for delivered-material quotes.",
    steps: ["Customer", "Job site", "Material", "Quantity"],
  },
  {
    eyebrow: "Step 1",
    title: "Start With Quote Inputs",
    body: "The estimator selects the customer, job site, material, and quantity. QuoteBase confirms that the job site belongs to the selected customer.",
    steps: ["Validate customer", "Validate job site", "Capture quantity"],
  },
  {
    eyebrow: "Step 2",
    title: "Load Pricing Configuration",
    body: "The system loads organization-specific pricing: R1-R4 markups, trucking rates, minimums, fees, surcharges, and overhead.",
    steps: ["Tier markups", "Truck rates", "Minimums", "Fees"],
  },
  {
    eyebrow: "Step 3",
    title: "Compare Supplier And Plant Options",
    body: "QuoteBase evaluates the complete delivered result, not just the raw material cost.",
    steps: ["Supplier cost", "Route distance", "Deadhead", "Load count"],
  },
  {
    eyebrow: "Recommendation Logic",
    title: "Three Quote-Size Zones",
    body: "Small quotes prioritize delivered total. Mid-size quotes balance material and trucking. Larger quotes prioritize material economics.",
    steps: ["Zone 1: one load", "Zone 2: up to three loads", "Zone 3: larger orders"],
  },
  {
    eyebrow: "Step 4",
    title: "Calculate Material Price",
    body: "Supplier buy cost is combined with tier markup and, for ton-based materials, overhead per ton. Material minimums are enforced.",
    steps: ["Buy cost", "Tier markup", "Overhead", "Minimum"],
  },
  {
    eyebrow: "Step 5",
    title: "Calculate Trucking",
    body: "QuoteBase chooses the vehicle plan, determines load count, applies the truck rate, and includes round-trip and deadhead time when available.",
    steps: ["Vehicle capacity", "Load count", "Truck rate", "Travel time"],
  },
  {
    eyebrow: "Step 6",
    title: "Add Fees And Tax",
    body: "Fuel, environmental fees, optional credit-card surcharge, and sales tax are added to produce the final quote total.",
    steps: ["Fuel fee", "Environmental fee", "Surcharge", "Sales tax"],
  },
  {
    eyebrow: "Step 7",
    title: "Save A Traceable Draft",
    body: "The draft stores subtotals, line-item details, selected supplier, recommendation reason, route data, and overrides.",
    steps: ["Quote header", "Line item", "Overrides", "Audit log"],
  },
  {
    eyebrow: "Step 8",
    title: "Approve And Send",
    body: "Approved quotes can generate a branded PDF, secure public link, and customer email.",
    steps: ["Approval", "PDF", "Email", "Customer response"],
  },
  {
    eyebrow: "Business Value",
    title: "Consistent. Auditable. Configuration-Driven.",
    body: "QuoteBase makes delivered-material quoting faster, more traceable, and less dependent on manual spreadsheet maintenance.",
    steps: ["Repeatable rules", "Clear decisions", "Professional output"],
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function main() {
  const audioBytes = await fs.readFile(audioPath);
  const audioDataUrl = `data:audio/wav;base64,${audioBytes.toString("base64")}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const result = await page.evaluate(
    async ({ audioUrl, slides }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      document.body.style.margin = "0";
      document.body.appendChild(canvas);

      const context = canvas.getContext("2d");
      const audio = document.createElement("audio");
      audio.src = audioUrl;
      document.body.appendChild(audio);

      await new Promise((resolve, reject) => {
        audio.addEventListener("loadedmetadata", resolve, { once: true });
        audio.addEventListener("error", () => reject(new Error("Audio failed to load.")), {
          once: true,
        });
        audio.load();
      });

      const canvasStream = canvas.captureStream(30);
      const audioStream = audio.captureStream();
      const mixedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(mixedStream, {
        mimeType,
        videoBitsPerSecond: 1400000,
        audioBitsPerSecond: 128000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const duration = audio.duration;
      const segment = duration / slides.length;
      let animationFrame = 0;

      function roundRect(x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + width, y, x + width, y + height, radius);
        context.arcTo(x + width, y + height, x, y + height, radius);
        context.arcTo(x, y + height, x, y, radius);
        context.arcTo(x, y, x + width, y, radius);
        context.closePath();
      }

      function wrapText(text, x, y, maxWidth, lineHeight, font) {
        context.font = font;
        const words = text.split(" ");
        let line = "";
        const lines = [];
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (context.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = next;
          }
        }
        if (line) {
          lines.push(line);
        }
        lines.forEach((content, index) => context.fillText(content, x, y + index * lineHeight));
        return lines.length * lineHeight;
      }

      function draw() {
        const now = audio.currentTime || 0;
        const index = Math.min(slides.length - 1, Math.floor(now / segment));
        const slide = slides[index];
        const local = (now - index * segment) / segment;
        const progress = Math.min(1, now / duration);

        context.fillStyle = "#f6f7f4";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.52, "#eef3f8");
        gradient.addColorStop(1, "#e8efe8");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = "#12312f";
        context.font = "700 30px Segoe UI";
        context.fillText("QuoteBase", 76, 68);

        context.fillStyle = "#56716d";
        context.font = "500 20px Segoe UI";
        context.fillText("Delivered-material quote generation", 76, 98);

        context.fillStyle = "#c7d1ce";
        roundRect(76, 650, 1128, 10, 5);
        context.fill();
        context.fillStyle = "#1e6b5c";
        roundRect(76, 650, 1128 * progress, 10, 5);
        context.fill();

        context.fillStyle = "#1e6b5c";
        context.font = "700 20px Segoe UI";
        context.fillText(slide.eyebrow.toUpperCase(), 112, 190);

        context.fillStyle = "#102220";
        context.font = "700 52px Segoe UI";
        wrapText(slide.title, 112, 258, 620, 62, "700 52px Segoe UI");

        context.fillStyle = "#3d514e";
        context.font = "400 24px Segoe UI";
        wrapText(slide.body, 112, 406, 610, 34, "400 24px Segoe UI");

        const panelX = 790;
        const panelY = 164;
        roundRect(panelX, panelY, 374, 380, 14);
        context.fillStyle = "rgba(255,255,255,0.78)";
        context.fill();
        context.strokeStyle = "#d5dfdc";
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle = "#102220";
        context.font = "700 22px Segoe UI";
        context.fillText("Process View", panelX + 36, panelY + 52);

        slide.steps.forEach((step, stepIndex) => {
          const y = panelY + 100 + stepIndex * 60;
          const appear = Math.min(1, Math.max(0.18, (local * slide.steps.length - stepIndex) / 0.7));
          context.globalAlpha = appear;
          context.fillStyle = stepIndex % 2 === 0 ? "#e8f2ef" : "#edf0f6";
          roundRect(panelX + 36, y, 302, 42, 9);
          context.fill();
          context.fillStyle = "#1e6b5c";
          context.font = "700 17px Segoe UI";
          context.fillText(String(stepIndex + 1).padStart(2, "0"), panelX + 52, y + 28);
          context.fillStyle = "#243b38";
          context.font = "600 18px Segoe UI";
          context.fillText(step, panelX + 92, y + 28);
          context.globalAlpha = 1;
        });

        context.fillStyle = "#7a8f8a";
        context.font = "500 18px Segoe UI";
        context.fillText(`${index + 1} / ${slides.length}`, 112, 600);

        animationFrame = requestAnimationFrame(draw);
      }

      draw();

      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.start(1000);
        audio.addEventListener("ended", () => recorder.stop(), { once: true });
        audio.play();
      });
      cancelAnimationFrame(animationFrame);

      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 32768;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }

      return {
        base64: btoa(binary),
        duration,
        mimeType,
        size: blob.size,
      };
    },
    {
      audioUrl: audioDataUrl,
      slides: slides.map((slide) => ({
        eyebrow: escapeHtml(slide.eyebrow),
        title: escapeHtml(slide.title),
        body: escapeHtml(slide.body),
        steps: slide.steps.map(escapeHtml),
      })),
    },
  );

  await browser.close();
  await fs.writeFile(outputPath, Buffer.from(result.base64, "base64"));

  console.log(
    JSON.stringify(
      {
        outputPath,
        durationSeconds: Math.round(result.duration),
        mimeType: result.mimeType,
        size: result.size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
