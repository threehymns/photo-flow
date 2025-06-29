"use client";

import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useCallback, useState, useRef } from "react";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  value: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number;
  accept?: Record<string, string[]>;
  disabled?: boolean;
  className?: string;
};

export function FileUpload({
  value: files = [],
  onChange,
  maxFiles = 10,
  maxSize = 5 * 1024 * 1024, // 5MB
  accept = {
    "image/*": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"],
  },
  disabled = false,
  className = "",
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (newFiles: File[]) => {
      const validFiles = newFiles.filter(
        (file) =>
          file.size <= maxSize && !files.some((f) => f.name === file.name),
      );

      if (validFiles.length === 0) return;

      const updatedFiles = [...files, ...validFiles].slice(0, maxFiles);
      onChange(updatedFiles);
    },
    [files, maxFiles, maxSize, onChange],
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileChange(droppedFiles);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    handleFileChange(selectedFiles);
    // Reset the input value to allow selecting the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const acceptString = Object.entries(accept)
    .flatMap(([, exts]) => exts.map((ext) => `.${ext.replace(/^\./, "")}`))
    .join(",");

  return (
    <div className={`w-full ${className}`}>
      <div
        className={cn(
          "rounded-lg border-2 border-dashed p-6 transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border",
          disabled ? "cursor-not-allowed opacity-50" : "",
          "relative",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full p-2">
            <Upload className="text-primary h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-foreground text-sm font-medium">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-muted-foreground text-xs">
              Or click to browse (max {maxFiles} files, up to{" "}
              {formatFileSize(maxSize)} each)
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleClick}
            disabled={disabled || files.length >= maxFiles}
          >
            Browse files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple={maxFiles > 1}
            accept={acceptString}
            onChange={handleInputChange}
            disabled={disabled || files.length >= maxFiles}
          />
        </div>

        {/* Hidden file counter */}
        {files.length > 0 && (
          <div className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium">
            {files.length}
          </div>
        )}
      </div>
    </div>
  );
}
