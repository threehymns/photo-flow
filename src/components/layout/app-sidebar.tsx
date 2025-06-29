"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/ui/file-upload";
import { Loader2, Printer, Trash2 } from "lucide-react";
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
    <Sidebar className={className} variant="inset">
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
        <SidebarGroup className="px-3 py-2">
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

        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel asChild>
            <h2 className="">Controls</h2>
          </SidebarGroupLabel>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label
                className="text-muted-foreground block text-sm font-medium"
                htmlFor="global-size"
              >
                Global Size ({displayGlobalSizeIn.toFixed(1)}&quot; diag)
              </Label>
              <Slider
                id="global-size"
                min={1}
                max={10}
                step={0.01}
                value={[displayGlobalSizeIn]}
                onValueChange={(value) => {
                  if (value[0] !== undefined) setDisplayGlobalSizeIn(value[0]);
                }}
                onValueCommit={(value) => {
                  if (value[0] !== undefined) setGlobalTargetSizeIn(value[0]);
                }}
                disabled={!isPrintEnabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  className="text-muted-foreground text-sm font-medium"
                  htmlFor="margin"
                >
                  Page Margin
                </Label>
                <span className="text-muted-foreground text-xs">
                  {marginIn.toFixed(2)}&quot;
                </span>
              </div>
              <Slider
                id="margin"
                min={0}
                max={1}
                step={0.01}
                value={[marginIn]}
                onValueChange={(value) => {
                  if (value[0] !== undefined) setMarginIn(value[0]);
                }}
                disabled={!isPrintEnabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  className="text-muted-foreground text-sm font-medium"
                  htmlFor="gap"
                >
                  Gap
                </Label>
                <span className="text-muted-foreground text-xs">
                  {gapIn.toFixed(2)}&quot;
                </span>
              </div>
              <Slider
                id="gap"
                min={0}
                max={1}
                step={0.01}
                value={[gapIn]}
                onValueChange={(value) => {
                  if (value[0] !== undefined) setGapIn(value[0]);
                }}
                disabled={!isPrintEnabled}
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
              className="flex-1/2"
              disabled={!isPrintEnabled || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print
            </Button>
            <Button
              onClick={handleClearAll}
              variant="destructive"
              className="flex-1"
              disabled={!isPrintEnabled || isLoading}
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          </div>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
