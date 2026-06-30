"use client";

import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";

import { importCrmLeads as importCrmLeadsAction } from "@/app/(dashboard)/customers/actions";

export function CrmLeadImportForm({
  imported,
  failed,
}: {
  imported?: string;
  failed?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Choose a .csv file.");
      setFileName("");
      return;
    }

    try {
      const text = await file.text();

      setCsvText(text);
      setFileName(file.name);
      setFileError("");

      if (!sourceName.trim()) {
        setSourceName(file.name.replace(/\.csv$/i, ""));
      }
    } catch {
      setFileError("Could not read this CSV file.");
      setFileName("");
    }
  }

  return (
    <form
      action={importCrmLeadsAction}
      className="w-full max-w-xl rounded-md border border-border bg-background p-3"
    >
      <div className="flex items-center gap-2">
        <Upload className="size-4 text-primary" />
        <p className="text-sm font-semibold">CSV lead import</p>
      </div>

      <input
        name="crm_source_name"
        value={sourceName}
        onChange={(event) => setSourceName(event.target.value)}
        className="soft-control mt-3 w-full"
        placeholder="Source name, e.g. Home show June"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mac-link mt-3 h-10 w-full justify-center rounded-md"
      >
        <FileUp className="size-4" />
        Choose CSV file
      </button>
      {fileName || fileError ? (
        <p
          className={`mt-2 text-xs ${
            fileError ? "text-rose-700" : "text-muted-foreground"
          }`}
        >
          {fileError || `Loaded ${fileName}`}
        </p>
      ) : null}

      <input
        type="hidden"
        name="crm_csv"
        value={csvText}
        readOnly
      />
      <button
        type="submit"
        disabled={!csvText.trim()}
        className="mac-button-primary mt-3 h-10 disabled:pointer-events-none disabled:opacity-50"
      >
        Import leads
      </button>
      {imported ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Imported {imported}; failed {failed ?? "0"}.
        </p>
      ) : null}
    </form>
  );
}
