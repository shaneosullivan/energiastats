"use client";

import { useState, useCallback, useEffect } from "react";
import FileUpload from "./components/FileUpload";
import Dashboard from "./components/Dashboard";
import { EnergyData } from "./lib/types";
import { parseCSV } from "./lib/parseCSV";

const STORAGE_KEY_CSV = "energiainsights_csv";
const STORAGE_KEY_FILENAME = "energiainsights_filename";

export default function Home() {
  const [data, setData] = useState<EnergyData | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // On mount, try to restore from localStorage
  useEffect(() => {
    try {
      const savedCsv = localStorage.getItem(STORAGE_KEY_CSV);
      const savedName = localStorage.getItem(STORAGE_KEY_FILENAME);
      if (savedCsv) {
        const parsed = parseCSV(savedCsv);
        if (parsed.days.length > 0) {
          setData(parsed);
          setFileName(savedName || "Saved data");
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setLoaded(true);
  }, []);

  const handleFileLoaded = useCallback((csvText: string, name: string) => {
    try {
      const parsed = parseCSV(csvText);
      if (parsed.days.length === 0) {
        setError(
          "No valid data found in the CSV file. Please check the file format.",
        );
        return;
      }
      setData(parsed);
      setFileName(name);
      setError(null);

      // Persist to localStorage
      try {
        localStorage.setItem(STORAGE_KEY_CSV, csvText);
        localStorage.setItem(STORAGE_KEY_FILENAME, name);
      } catch {
        // localStorage full or unavailable — not critical
      }
    } catch {
      setError(
        "Failed to parse the CSV file. Please make sure it's a valid Energia usage export.",
      );
    }
  }, []);

  const handleReset = useCallback(() => {
    setData(null);
    setFileName("");
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY_CSV);
      localStorage.removeItem(STORAGE_KEY_FILENAME);
    } catch {
      // Ignore
    }
  }, []);

  // Don't render until we've checked localStorage to avoid flash of upload screen
  if (!loaded) {
    return null;
  }

  if (data) {
    return <Dashboard data={data} fileName={fileName} onReset={handleReset} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FileUpload onFileLoaded={handleFileLoaded} />
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
