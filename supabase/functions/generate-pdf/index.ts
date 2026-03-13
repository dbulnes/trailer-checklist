// Supabase Edge Function: generate-pdf
// Receives structured inspection data, generates a PDF using pdf-lib,
// saves it to Supabase Storage, and returns the PDF + signed URL.

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import {
  PDFDocument,
  rgb,
  StandardFonts,
  PageSizes,
} from "https://esm.sh/pdf-lib@1.17.1";

const BUCKET = "inspection-pdfs";

function getCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Expose-Headers": "X-PDF-URL, X-PDF-Path, X-PDF-Error",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { info, stats, sections, summary, multi } = body;

    // ---- Build PDF ----
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 10;
    const headerSize = 20;
    const sectionSize = 13;
    const margin = 50;
    const lineHeight = 14;

    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    const green = rgb(0.2, 0.65, 0.2);
    const red = rgb(0.75, 0.15, 0.15);
    const orange = rgb(0.7, 0.45, 0.05);

    let page = doc.addPage(PageSizes.Letter);
    let { width, height } = page.getSize();
    let y = height - margin;

    function ensureSpace(needed: number) {
      if (y - needed < margin) {
        page = doc.addPage(PageSizes.Letter);
        y = height - margin;
      }
    }

    function drawText(
      text: string,
      x: number,
      yPos: number,
      options: {
        font?: typeof font;
        size?: number;
        color?: typeof black;
        maxWidth?: number;
      } = {}
    ) {
      const f = options.font || font;
      const s = options.size || fontSize;
      const c = options.color || black;
      const maxW = options.maxWidth || width - margin * 2;

      // Word wrap
      const words = text.split(" ");
      let line = "";
      let currentY = yPos;

      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(test, s) > maxW && line) {
          ensureSpace(lineHeight);
          page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
          currentY -= lineHeight;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        ensureSpace(lineHeight);
        page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
        currentY -= lineHeight;
      }
      return currentY;
    }

    // ---- HEADER ----
    const title = info.name || "RV Inspection";
    y = drawText(title, margin, y, {
      font: fontBold,
      size: headerSize,
      color: black,
    });
    y -= 4;

    // Info line
    const infoFields = [
      ["Date", info.date],
      ["Location", info.location],
      ["Seller", info.seller],
      ["Price", info.price],
      ["VIN", info.vin],
      ["Mileage", info.mileage],
    ].filter(([, v]) => v);
    if (infoFields.length) {
      const infoLine = infoFields.map(([k, v]) => `${k}: ${v}`).join("  |  ");
      y = drawText(infoLine, margin, y, { size: 9, color: gray });
    }
    y -= 8;

    // ---- STATS ----
    const total = stats.ok + stats.issues + stats.pending + stats.na;
    const pct = (n: number) =>
      total ? ((n / total) * 100).toFixed(0) + "%" : "0%";
    ensureSpace(lineHeight * 2);
    y = drawText(
      `${stats.ok} passed (${pct(stats.ok)})  |  ${stats.issues} issues  |  ${stats.pending} pending  |  ${stats.na} N/A`,
      margin,
      y,
      { font: fontBold, size: 11 }
    );
    y -= 12;

    // ---- ASSESSMENT ----
    const majorList = summary.majorIssuesList || [];
    const minorList = summary.minorIssuesList || [];
    if (
      summary.condition ||
      summary.action ||
      majorList.length ||
      minorList.length ||
      summary.repairCosts
    ) {
      ensureSpace(lineHeight * 3);
      y = drawText("Assessment", margin, y, {
        font: fontBold,
        size: sectionSize,
      });
      y -= 2;
      if (summary.condition) {
        y = drawText(`Overall Condition: ${summary.condition}`, margin + 10, y, {
          size: 10,
        });
      }
      if (summary.action) {
        y = drawText(
          `Recommended Action: ${summary.action}`,
          margin + 10,
          y,
          { size: 10 }
        );
      }
      if (summary.repairCosts) {
        y = drawText(
          `Est. Repair Costs: ${summary.repairCosts}`,
          margin + 10,
          y,
          { size: 10 }
        );
      }
      if (majorList.length) {
        y -= 4;
        y = drawText("Major Issues:", margin + 10, y, {
          font: fontBold,
          size: 10,
          color: red,
        });
        for (const item of majorList) {
          y = drawText(`  - ${item}`, margin + 16, y, { size: 9.5 });
        }
      }
      if (minorList.length) {
        y -= 4;
        y = drawText("Minor Issues:", margin + 10, y, {
          font: fontBold,
          size: 10,
          color: orange,
        });
        for (const item of minorList) {
          y = drawText(`  - ${item}`, margin + 16, y, { size: 9.5 });
        }
      }
      y -= 12;
    }

    // ---- ISSUES ALERT ----
    const allIssues: {
      section: string;
      text: string;
      note: string;
      input: string;
    }[] = [];
    sections.forEach(
      (s: {
        title: string;
        items: {
          status: string;
          text: string;
          note: string;
          input: string;
        }[];
      }) =>
        s.items.forEach((it) => {
          if (it.status === "issue")
            allIssues.push({ section: s.title, ...it });
        })
    );
    if (allIssues.length) {
      ensureSpace(lineHeight * 3);
      y = drawText(`Issues Found (${allIssues.length})`, margin, y, {
        font: fontBold,
        size: sectionSize,
        color: red,
      });
      y -= 2;
      for (const it of allIssues) {
        ensureSpace(lineHeight * 2);
        y = drawText(`${it.section}: ${it.text}`, margin + 10, y, {
          font: fontBold,
          size: 9.5,
          color: red,
        });
        const meta = [it.input, it.note].filter(Boolean).join(" - ");
        if (meta) {
          y = drawText(meta, margin + 16, y, { size: 9, color: gray });
        }
      }
      y -= 12;
    }

    // ---- SECTION DETAILS ----
    const statusSym = (s: string) =>
      s === "ok" ? "PASS" : s === "issue" ? "ISSUE" : s === "na" ? "N/A" : "TODO";
    const statusColor = (s: string) =>
      s === "ok" ? green : s === "issue" ? red : s === "na" ? gray : orange;

    for (const s of sections) {
      ensureSpace(lineHeight * 3);
      const sStats = { ok: 0, issue: 0, pending: 0 };
      s.items.forEach(
        (it: { status: string }) => {
          if (it.status === "ok") sStats.ok++;
          else if (it.status === "issue") sStats.issue++;
          else if (it.status !== "na") sStats.pending++;
        }
      );
      const tag = sStats.issue
        ? ` (${sStats.issue} issue${sStats.issue > 1 ? "s" : ""})`
        : "";
      y = drawText(
        `${s.title} - ${sStats.ok}/${s.items.length} passed${tag}`,
        margin,
        y,
        { font: fontBold, size: 11 }
      );
      y -= 2;

      for (const it of s.items) {
        ensureSpace(lineHeight * 2);
        const sym = statusSym(it.status);
        const symWidth = fontBold.widthOfTextAtSize(sym, 8) + 8;

        page.drawText(sym, {
          x: margin + 10,
          y,
          size: 8,
          font: fontBold,
          color: statusColor(it.status),
        });

        const itemText =
          (it.critical ? "[!] " : "") +
          it.text +
          (multi && it.by ? ` (${it.by})` : "");
        y = drawText(itemText, margin + 10 + symWidth, y, {
          size: 9.5,
          font: it.status === "issue" ? fontBold : font,
          color: it.status === "issue" ? red : black,
          maxWidth: width - margin * 2 - symWidth - 10,
        });

        const meta = [it.input, it.note].filter(Boolean).join(" - ");
        if (meta) {
          y = drawText(meta, margin + 10 + symWidth, y, {
            size: 8.5,
            color: gray,
            maxWidth: width - margin * 2 - symWidth - 10,
          });
        }
      }
      y -= 10;
    }

    // ---- FOOTER ----
    ensureSpace(lineHeight * 2);
    y -= 8;
    y = drawText(
      `Generated ${new Date().toLocaleDateString()} - RV Inspect`,
      margin,
      y,
      { size: 8, color: gray }
    );

    // ---- Serialize PDF ----
    const pdfBytes = await doc.save();
    const baseName = (title.replace(/[^a-zA-Z0-9 _-]/g, "") || "inspection").replace(/ /g, "_");
    const MAX_VERSIONS = 5;

    // ---- Save to Supabase Storage (versioned, up to 5 per checklist) ----
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${baseName}_${timestamp}.pdf`;
    const storagePath = `${baseName}/${filename}`;

    // List existing versions for this checklist
    const { data: existing } = await adminClient.storage
      .from(BUCKET)
      .list(baseName, { sortBy: { column: "created_at", order: "asc" } });

    // Delete oldest versions if at the limit
    if (existing && existing.length >= MAX_VERSIONS) {
      const toDelete = existing.slice(0, existing.length - MAX_VERSIONS + 1);
      await adminClient.storage
        .from(BUCKET)
        .remove(toDelete.map((f: { name: string }) => `${baseName}/${f.name}`));
    }

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, new Blob([pdfBytes], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });

    let signedUrl = "";
    let uploadErrorMsg = "";
    if (uploadError) {
      uploadErrorMsg = uploadError.message || JSON.stringify(uploadError);
      console.error("Storage upload error:", uploadErrorMsg);
    } else {
      const { data } = await adminClient.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 3600);
      signedUrl = data?.signedUrl || "";
    }

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-PDF-URL": signedUrl || "",
        "X-PDF-Path": storagePath,
        "X-PDF-Error": uploadErrorMsg,
      },
    });
  } catch (e) {
    console.error("PDF generation error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
