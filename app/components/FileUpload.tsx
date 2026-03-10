"use client";

import { useCallback, useState } from "react";
import Image from "next/image";

interface FileUploadProps {
  onFileLoaded: (csvText: string, fileName: string) => void;
}

export default function FileUpload({ onFileLoaded }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const loadSampleData = useCallback(async () => {
    setLoadingSample(true);
    try {
      const res = await fetch(
        "/sampledata/EnergiaSample_April2024_Feb2026.csv",
      );
      const text = await res.text();
      setFileName("Sample Data (Apr 2024 – Feb 2026)");
      onFileLoaded(text, "Sample Data (Apr 2024 – Feb 2026)");
    } catch {
      alert("Failed to load sample data");
    } finally {
      setLoadingSample(false);
    }
  }, [onFileLoaded]);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        alert("Please upload a CSV file from Energia");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setFileName(file.name);
        onFileLoaded(text, file.name);
      };
      reader.readAsText(file);
    },
    [onFileLoaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile],
  );

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
      <a
        href="https://github.com/shaneosullivan/energiastats"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
        aria-label="View source code on GitHub"
        title="View source code on GitHub"
      >
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      </a>
      <div className="text-center flex flex-col items-center">
        <Image
          src="/logo_500.png"
          alt="Energia Insights"
          width={120}
          height={120}
          className="mb-4"
          priority
        />
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Energia Insights
        </h1>
        <p className="text-lg text-gray-500 max-w-lg">
          Upload your Energia electricity usage CSV to get detailed insights,
          comparisons, and cost analysis.
        </p>
      </div>

      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv";
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
              handleFile(file);
            }
          };
          input.click();
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          {fileName ? (
            <p className="text-sm text-green-600 font-medium">
              {fileName} loaded
            </p>
          ) : (
            <>
              <p className="text-base font-medium text-gray-700">
                Drop your Energia CSV file here
              </p>
              <p className="text-sm text-gray-400">or click to browse</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-gray-400">or</p>
        <button
          onClick={loadSampleData}
          disabled={loadingSample}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingSample ? "Loading..." : "Try with Sample Data"}
        </button>
        <p className="text-xs text-gray-400">
          See the app in action with example Energia usage data
        </p>
      </div>

      <div className="text-sm text-gray-400 max-w-md text-center">
        <p>
          Download your usage data from your{" "}
          <a
            href="https://energyonline.energia.ie/my-account/half-hourly-usage/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>Energia online account</strong>
          </a>
          .
        </p>
      </div>

      <div className="text-xs text-gray-400 max-w-md text-center border-t border-gray-200 pt-4">
        <p>
          Your data stays on your device. Nothing is sent to a server or stored
          in the cloud &mdash; all processing happens entirely in your browser.
        </p>
        <p className="mt-3">
          Created by{" "}
          <a
            href="https://chofter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-700 underline"
          >
            Shane O&apos;Sullivan
          </a>
        </p>
      </div>
    </div>
  );
}
