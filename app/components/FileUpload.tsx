'use client';

import { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileLoaded: (csvText: string, fileName: string) => void;
}

export default function FileUpload({ onFileLoaded }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file from Energia');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileName(file.name);
      onFileLoaded(text, file.name);
    };
    reader.readAsText(file);
  }, [onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Energia Insights</h1>
        <p className="text-lg text-gray-500 max-w-lg">
          Upload your Energia electricity usage CSV to get detailed insights, comparisons, and cost analysis.
        </p>
      </div>

      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {fileName ? (
            <p className="text-sm text-green-600 font-medium">{fileName} loaded</p>
          ) : (
            <>
              <p className="text-base font-medium text-gray-700">Drop your Energia CSV file here</p>
              <p className="text-sm text-gray-400">or click to browse</p>
            </>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-400 max-w-md text-center">
        <p>Download your usage data from your <strong>Energia online account</strong> under <strong>My Usage &gt; Download Usage Data</strong>.</p>
      </div>
    </div>
  );
}
