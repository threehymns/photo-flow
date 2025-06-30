"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Loader2, Printer, Trash2 } from "lucide-react";
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
import type { UploadedImage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  isLoading: boolean;
  isConverting: boolean;
  conversionProgress: number;
  isPrintEnabled: boolean;
  displayGlobalSizeIn: number;
  marginIn: number;
  gapIn: number;
  uploadedImages: UploadedImage[];
  handleImageUpload: (files: File[]) => void;
  handlePrint: () => void;
  handleClearAll: () => void;
  setDisplayGlobalSizeIn: (value: number) => void;
  setGlobalTargetSizeIn: (value: number) => void;
  setMarginIn: (value: number) => void;
  setUploadedImages: (value: UploadedImage[]) => void;
  setGapIn: (value: number) => void;
  className?: string;
}
export function AppSidebar({
  isLoading,
  isConverting,
  conversionProgress,
  isPrintEnabled,
  displayGlobalSizeIn,
  marginIn,
  gapIn,
  uploadedImages,
  handleImageUpload,
  handlePrint,
  handleClearAll,
  setDisplayGlobalSizeIn,
  setGlobalTargetSizeIn,
  setMarginIn,
  setUploadedImages,
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
          <div className="space-y-1">
            <FileUpload
              value={uploadedImages.map((img) => img.rawFile)}
              onChange={(files) => {
                handleImageUpload(files);
                if (files.length === 0) {
                  setUploadedImages([]);
                }
              }}
              maxFiles={1000}
              maxSize={20 * 1024 * 1024} // 20MB
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
              }}
              className="w-full"
            />
            {isConverting && (
              <div className="text-muted-foreground flex flex-col items-center text-sm">
                <div className="flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Converting HEIC files...
                </div>
                <Progress value={conversionProgress} className="mt-2 w-full" />
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
              onClick={handlePrint}
              className="flex-1"
              disabled={!isPrintEnabled || isLoading}
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Printer />}
              Print
            </Button>
            <Button
              onClick={handleClearAll}
              variant="destructive"
              className="flex-1"
              disabled={!isPrintEnabled || isLoading}
            >
              <Trash2 />
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

