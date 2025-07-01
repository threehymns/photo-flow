"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { GoogleDrivePickerButton } from "@/components/ui/google-drive-picker-button"; // Added
import { Loader2, Printer, Trash2, CloudUpload } from "lucide-react"; // Added CloudUpload for GDrive
import { SliderWithReset } from "@/components/ui/slider-with-reset";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  isLoading: boolean;
  // isConverting: boolean; // Potentially replaced by processingProgress
  // conversionProgress: number; // Potentially replaced by processingProgress
  processingProgress: {
    type: 'conversion' | 'extraction' | 'loading';
    loaded: number;
    total: number;
    currentFile?: string;
  } | null;
  isPrintEnabled: boolean;
  displayGlobalSizeIn: number;
  marginIn: number;
  gapIn: number;
  onImageUpload: (files: File[]) => void; // Renamed to onImageUpload
  onPrint: () => void; // Renamed to onPrint
  onClearAll: () => void; // Renamed to onClearAll
  setDisplayGlobalSizeIn: (value: number) => void;
  setGlobalTargetSizeIn: (value: number) => void;
  setMarginIn: (value: number) => void;
  setGapIn: (value: number) => void;
  className?: string;
}
export function AppSidebar({
  isLoading,
  // isConverting: _isConverting, // No longer directly used, derived from processingProgress if needed
  // conversionProgress: _conversionProgress, // No longer directly used
  processingProgress,
  isPrintEnabled,
  displayGlobalSizeIn,
  marginIn,
  gapIn,
  onImageUpload, // Keep this for handling files from both sources
  onPrint,
  onClearAll,
  setDisplayGlobalSizeIn,
  setGlobalTargetSizeIn,
  setMarginIn,
  setGapIn,
  className,
}: AppSidebarProps) {
  const { open } = useSidebar();
  return (
    <Sidebar className={cn("select-none", className)} variant="inset">
      <SidebarRail />
      <SidebarHeader className="">
        <h1 className="text-lg font-semibold">Photo Print</h1>
        <div
          className={`bg-sidebar absolute right-3 rounded-lg p-0.5 transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-16"}`}
        >
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="space-y-3"> {/* Increased spacing for new button */}
            <FileUpload
              onChange={onImageUpload} // Use the passed-in handler
              maxFiles={1000}
              maxSize={20 * 1024 * 1024} // Consider making this a shared constant
              accept={{
                "image/*": [
                  ".jpg",
                  ".jpeg",
                  ".png",
                  ".gif",
                  ".webp",
                  ".svg",
                  ".heic",
                  ".heif",
                ],
                "application/zip": [".zip"],
              }}
              className="w-full"
            />
            <GoogleDrivePickerButton
              onFilesSelected={onImageUpload} // Use the same handler
              imageAcceptConfig={{ // Pass necessary config for processing
                "image/*": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".heic", ".heif"],
              }}
              maxIndividualSize={20 * 1024 * 1024} // Match FileUpload's maxSize for consistency
              disabled={isLoading}
            />
            {isLoading && processingProgress && (
              <div className="text-muted-foreground flex flex-col items-center text-sm pt-2">
                <div className="flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {processingProgress.type === 'conversion' && `Converting HEIC: ${processingProgress.currentFile ?? ''} (${processingProgress.loaded}/${processingProgress.total})`}
                  {processingProgress.type === 'extraction' && `Extracting from Zip: ${processingProgress.currentFile ?? ''} (${processingProgress.loaded}/${processingProgress.total})`}
                  {processingProgress.type === 'loading' && (processingProgress.currentFile ?? 'Processing...')}
                </div>
                {(processingProgress.type === 'conversion' || processingProgress.type === 'extraction') && processingProgress.total > 0 && (
                  <Progress value={(processingProgress.loaded / processingProgress.total) * 100} className="mt-2 w-full" />
                )}
              </div>
            )}
          </div>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Controls</SidebarGroupLabel>
          <div className="px-2">
            <div className="space-y-4">
              <SliderWithReset
                id="global-size"
                label="Global Size"
                value={displayGlobalSizeIn}
                min={1}
                max={10}
                step={0.01}
                onReset={() => {
                  setDisplayGlobalSizeIn(DEFAULT_DIAGONAL_IN);
                  setGlobalTargetSizeIn(DEFAULT_DIAGONAL_IN);
                }}
                format={(value) => `${value.toFixed(1)}" diag`}
                onCommit={(value) => {
                  setDisplayGlobalSizeIn(value);
                  setGlobalTargetSizeIn(value);
                }}
              />
              <SliderWithReset
                id="margin"
                label="Page Margin"
                value={marginIn}
                min={0}
                max={1}
                step={0.01}
                onReset={() => setMarginIn(DEFAULT_MARGIN_IN)}
                format={(value) => `${value.toFixed(2)}"`}
                onCommit={setMarginIn}
              />
              <SliderWithReset
                id="gap"
                label="Gap"
                value={gapIn}
                min={0}
                max={1}
                step={0.01}
                onReset={() => setGapIn(DEFAULT_GAP_IN)}
                format={(value) => `${value.toFixed(2)}"`}
                onCommit={setGapIn}
              />
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <div className="flex space-x-2">
            <Button
              onClick={onPrint} // Use renamed prop
              className="flex-1"
              disabled={!isPrintEnabled || isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Print
            </Button>
            <Button
              onClick={onClearAll} // Use renamed prop
              variant="destructive"
              className="flex-1"
              disabled={!isPrintEnabled || isLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
          </div>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}export const DEFAULT_DIAGONAL_IN = 5;
export const DEFAULT_MARGIN_IN = 0.1;
export const DEFAULT_GAP_IN = 0;

