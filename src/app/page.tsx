"use client";

import React from "react";
import { useRef, useState, useCallback, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { SliderWithReset } from "@/components/ui/slider-with-reset";
import { AppSidebar, DEFAULT_DIAGONAL_IN, DEFAULT_GAP_IN, DEFAULT_MARGIN_IN } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import type { UploadedImage, PrintPageLayout } from "@/lib/types";
import Image from "next/image";
import { Image as ImageIcon, X } from "lucide-react";

// Constants
const RENDER_DPI = 96;
const PAPER_WIDTH_IN = 8.5;
const PAPER_HEIGHT_IN = 11;

const PrintableContent = React.forwardRef<
  HTMLDivElement,
  { pageLayouts: PrintPageLayout[] }
>(({ pageLayouts }, ref) => {
  return (
    <div ref={ref}>
      {pageLayouts.map((layout, pageIndex) => (
        <div
          key={pageIndex}
          className="page-break"
          style={{
            width: `${PAPER_WIDTH_IN}in`,
            height: `${PAPER_HEIGHT_IN}in`,
            position: "relative",
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          {layout.photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                position: "absolute",
                left: `${photo.printXPx / RENDER_DPI}in`,
                top: `${photo.printYPx / RENDER_DPI}in`,
                width: `${photo.printWidthPx / RENDER_DPI}in`,
                height: `${photo.printHeightPx / RENDER_DPI}in`,
              }}
            >
              <Image
                src={photo.objectUrl}
                alt={photo.name}
                fill
                style={{ objectFit: "cover" }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
PrintableContent.displayName = "PrintableContent";

export default function PrintPage() {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [globalTargetSizeIn, setGlobalTargetSizeIn] = useState<number>(
    DEFAULT_DIAGONAL_IN,
  );
  const [displayGlobalSizeIn, setDisplayGlobalSizeIn] =
    useState<number>(globalTargetSizeIn);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pageLayouts, setPageLayouts] = useState<PrintPageLayout[]>([]);
  const [marginIn, setMarginIn] = useState<number>(DEFAULT_MARGIN_IN);
  const [gapIn, setGapIn] = useState<number>(DEFAULT_GAP_IN);

  const [previewScale, setPreviewScale] = useState(0.5);
  const [isLoading, setIsLoading] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const printComponentRef = useRef<HTMLDivElement>(null);
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(
    null,
  );

  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  const handleImageUpload = (files: File[]) => {
    if (files.length === 0) {
      setUploadedImages([]);
      return;
    }
    setIsLoading(true);
    setIsConverting(false);

    const processFiles = async () => {
      const heic2any = (await import("heic2any")).default;
      const filesToConvert = files.filter(
        (file) =>
          file.type === "image/heic" ||
          file.name.toLowerCase().endsWith(".heic"),
      );
      let convertedCount = 0;

      const newImagesPromises = files.map(async (file, index) => {
        let processedFile = file;
        if (
          file.type === "image/heic" ||
          file.name.toLowerCase().endsWith(".heic")
        ) {
          try {
            setIsConverting(true);
            const convertedBlob = await heic2any({
              blob: file,
              toType: "image/jpeg",
              quality: 0.8,
            });
            processedFile = new File(
              [convertedBlob as Blob],
              `${file.name.split(".")[0]}.jpeg`,
              {
                type: "image/jpeg",
              },
            );
            convertedCount++;
            setConversionProgress(
              (convertedCount / filesToConvert.length) * 100,
            );
          } catch (error) {
            console.error(`Failed to convert HEIC file: ${file.name}`, error);
            throw new Error(
              `Failed to convert HEIC file: ${file.name}. Error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return new Promise<UploadedImage>((resolve, reject) => {
          const objectURL = URL.createObjectURL(processedFile);
          const img = document.createElement("img");
          img.onload = () => {
            resolve({
              id: `${Date.now()}-${index}-${processedFile.name}`,
              name: processedFile.name,
              objectUrl: objectURL,
              originalWidthPx: img.width,
              originalHeightPx: img.height,
              targetPrintDiagonalIn: null,
              rawFile: file, // Keep track of the original file
            });
          };
          img.onerror = (errorEvent) => {
            URL.revokeObjectURL(objectURL);
            reject(
              new Error(
                `Failed to load image: ${processedFile.name}. Error: ${errorEvent instanceof Event ? `Event type: ${errorEvent.type}` : String(errorEvent)}`,
              ),
            );
          };
          img.src = objectURL;
        });
      });

      try {
        const newImages = await Promise.all(newImagesPromises);
        setUploadedImages((prev) =>
          [...prev, ...newImages].sort(
            (a, b) =>
              b.originalWidthPx * b.originalHeightPx -
              a.originalWidthPx * a.originalHeightPx,
          ),
        );
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setIsLoading(false);
        setIsConverting(false);
      }
    };

    void processFiles();
  };

  const processedImages = React.useMemo(() => {
    return uploadedImages.map((img) => {
      const targetDiagonalIn = img.targetPrintDiagonalIn ?? globalTargetSizeIn;
      if (targetDiagonalIn <= 0) {
        return { ...img, printWidthPx: 0, printHeightPx: 0 };
      }
      const aspectRatio = img.originalHeightPx / img.originalWidthPx;
      const printWidthIn =
        targetDiagonalIn / Math.sqrt(1 + aspectRatio * aspectRatio);
      const printHeightIn = aspectRatio * printWidthIn;
      const printWidthPx = printWidthIn * RENDER_DPI;
      const printHeightPx = printHeightIn * RENDER_DPI;
      return { ...img, printWidthPx, printHeightPx };
    });
  }, [uploadedImages, globalTargetSizeIn]);

  const calculateLayout = useCallback(() => {
    if (processedImages.length === 0) {
      setPageLayouts([]);
      return;
    }

    const usablePageWidthPx = (PAPER_WIDTH_IN - 2 * marginIn) * RENDER_DPI;
    const usablePageHeightPx = (PAPER_HEIGHT_IN - 2 * marginIn) * RENDER_DPI;

    if (usablePageWidthPx <= 0 || usablePageHeightPx <= 0) {
      setPageLayouts([{ photos: [] }]);
      return;
    }

    const spacingPx = gapIn * RENDER_DPI;
    const newPageLayouts: PrintPageLayout[] = [];

    type EmptySpace = { x: number; y: number; w: number; h: number };
    const pageEmptySpaces: EmptySpace[][] = [];

    const addNewPage = () => {
      newPageLayouts.push({ photos: [] });
      pageEmptySpaces.push([
        {
          x: marginIn * RENDER_DPI,
          y: marginIn * RENDER_DPI,
          w: usablePageWidthPx,
          h: usablePageHeightPx,
        },
      ]);
    };

    addNewPage();

    processedImages.forEach((img) => {
      if (
        !img.printWidthPx ||
        !img.printHeightPx ||
        img.printWidthPx <= 0 ||
        img.printHeightPx <= 0
      ) {
        return;
      }

      let placed = false;
      let bestFit: { pageIdx: number; spaceIdx: number; score: number } | null =
        null;

      for (let pageIdx = 0; pageIdx < newPageLayouts.length; pageIdx++) {
        const spaces = pageEmptySpaces[pageIdx];
        if (!spaces) continue;

        for (let spaceIdx = 0; spaceIdx < spaces.length; spaceIdx++) {
          const space = spaces[spaceIdx];
          if (!space) continue;

          if (img.printWidthPx <= space.w && img.printHeightPx <= space.h) {
            const score = space.w * space.h; // Simple score: prefer smaller spaces
            if (!bestFit || score < bestFit.score) {
              bestFit = { pageIdx, spaceIdx, score };
            }
          }
        }
      }

      if (bestFit) {
        const { pageIdx, spaceIdx } = bestFit;
        const spaces = pageEmptySpaces[pageIdx];
        if (!spaces || spaceIdx >= spaces.length) {
          console.error("Invalid space index");
          return;
        }
        const space = spaces[spaceIdx];
        if (!space) {
          console.error("Space not found");
          return;
        }

        const layout = newPageLayouts[pageIdx];
        if (!layout) {
          console.error("Layout not found");
          return;
        }
        layout.photos.push({
          ...img,
          printXPx: space.x,
          printYPx: space.y,
        });

        const requiredWidth = img.printWidthPx + spacingPx;
        const requiredHeight = img.printHeightPx + spacingPx;

        const newSpaces: EmptySpace[] = [];
        // Horizontal cut:
        // R1: space below
        if (space.h > requiredHeight) {
          newSpaces.push({
            x: space.x,
            y: space.y + requiredHeight,
            w: space.w,
            h: space.h - requiredHeight,
          });
        }
        // R2: space to the right of photo
        if (space.w > requiredWidth) {
          newSpaces.push({
            x: space.x + requiredWidth,
            y: space.y,
            w: space.w - requiredWidth,
            h: img.printHeightPx,
          });
        }

        spaces.splice(spaceIdx, 1, ...newSpaces);
        placed = true;
      }

      if (!placed) {
        addNewPage();
        const newPageIdx = newPageLayouts.length - 1;
        const newPageLayout = newPageLayouts[newPageIdx];
        const newPageSpaces = pageEmptySpaces[newPageIdx];

        if (!newPageLayout || !newPageSpaces || newPageSpaces.length === 0) {
          console.error("Failed to create a new page correctly.");
          return;
        }
        const firstSpace = newPageSpaces[0];
        if (!firstSpace) {
          console.error("No space available on new page.");
          return;
        }

        if (
          img.printWidthPx <= firstSpace.w &&
          img.printHeightPx <= firstSpace.h
        ) {
          newPageLayout.photos.push({
            ...img,
            printXPx: firstSpace.x,
            printYPx: firstSpace.y,
          });

          const requiredWidth = img.printWidthPx + spacingPx;
          const requiredHeight = img.printHeightPx + spacingPx;

          const newSpaces: EmptySpace[] = [];
          if (firstSpace.h > requiredHeight) {
            newSpaces.push({
              x: firstSpace.x,
              y: firstSpace.y + requiredHeight,
              w: firstSpace.w,
              h: firstSpace.h - requiredHeight,
            });
          }
          if (firstSpace.w > requiredWidth) {
            newSpaces.push({
              x: firstSpace.x + requiredWidth,
              y: firstSpace.y,
              w: firstSpace.w - requiredWidth,
              h: img.printHeightPx,
            });
          }
          newPageSpaces.splice(0, 1, ...newSpaces);
        }
      }
    });

    setPageLayouts(newPageLayouts);
  }, [processedImages, marginIn, gapIn]);

  const updateSelectedImageSize = useCallback(
    (sizeInInches: number | null) => {
      if (selectedImage) {
        setUploadedImages((prevImages) => {
          const updatedImages = prevImages.map((image) =>
            image.id === selectedImage.id
              ? { ...image, targetPrintDiagonalIn: sizeInInches }
              : image,
          );
          const newlySelectedImage = updatedImages.find(
            (img) => img.id === selectedImage.id,
          );
          if (newlySelectedImage) {
            setSelectedImage(newlySelectedImage);
          }
          return updatedImages;
        });
      }
    },
    [selectedImage, setUploadedImages],
  );

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectedImage &&
        !event
          .composedPath()
          .some(
            (el) =>
              el instanceof Element &&
              (el.classList.contains("popover-content") ||
                el.classList.contains("popover-trigger")),
          )
      ) {
        setSelectedImage(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedImage]);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      calculateLayout();
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [calculateLayout]);

  useEffect(() => {
    setDisplayGlobalSizeIn(globalTargetSizeIn);
  }, [globalTargetSizeIn]);

  useEffect(() => {
    calculateLayout();
  }, [processedImages, calculateLayout]);

  useEffect(() => {
    const calculateScale = () => {
      if (!previewContainerRef.current) return;
      const availableWidth = previewContainerRef.current.clientWidth - 32; // p-4
      const availableHeight = previewContainerRef.current.clientHeight - 32; // p-4

      const scaleX = availableWidth / (PAPER_WIDTH_IN * RENDER_DPI);
      const scaleY = availableHeight / (PAPER_HEIGHT_IN * RENDER_DPI);

      setPreviewScale(Math.max(0.1, Math.min(scaleX, scaleY, 1.0)));
    };

    calculateScale();
    const resizeObserver = new ResizeObserver(calculateScale);
    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [pageLayouts]);

  const imagesRef = useRef(uploadedImages);
  imagesRef.current = uploadedImages;

  useEffect(() => {
    const calculateScale = () => {
      if (!previewContainerRef.current) return;
      const availableWidth = previewContainerRef.current.clientWidth - 32; // p-4
      const availableHeight = previewContainerRef.current.clientHeight - 32; // p-4

      const scaleX = availableWidth / (PAPER_WIDTH_IN * RENDER_DPI);
      const scaleY = availableHeight / (PAPER_HEIGHT_IN * RENDER_DPI);

      setPreviewScale(Math.max(0.1, Math.min(scaleX, scaleY, 1.0)));
    };

    calculateScale();
    const resizeObserver = new ResizeObserver(calculateScale);
    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [pageLayouts]);

  useEffect(() => {
    // On unmount, revoke all object URLs
    return () => {
      imagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.objectUrl);
      });
    };
  }, []);

  const pageStyle = `
        @page {
            size: ${PAPER_WIDTH_IN}in ${PAPER_HEIGHT_IN}in;
            margin: 0;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .page-break {
                page-break-after: always;
                break-after: page;
            }
            .page-break:last-child {
                page-break-after: auto;
                break-after: auto;
            }
        }
    `;

  const handlePrint = useReactToPrint({
    pageStyle: pageStyle,
    onAfterPrint: () => {
      console.log("after print");
    },
    onPrintError: (errorLocation: string, error: unknown) => {
      console.error(
        `Error during printing (${errorLocation}):`,
        error instanceof Error ? error.message : String(error),
      );
    },
    documentTitle: "Photo Print Layout",
    contentRef: printComponentRef,
  });

  const isPrintEnabled =
    pageLayouts.length > 0 && (pageLayouts[0]?.photos?.length ?? 0) > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        if (isPrintEnabled) {
          handlePrint?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlePrint, isPrintEnabled]);

  const handleClearAll = () => {
    uploadedImages.forEach((image) => URL.revokeObjectURL(image.objectUrl));
    setUploadedImages([]);
  };

  const handleRemoveImage = (id: string) => {
    const imageToRemove = uploadedImages.find((img) => img.id === id);
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.objectUrl);
    }
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  return (
    <div className="flex w-full print:hidden">
      <AppSidebar
        isLoading={isLoading}
        isConverting={isConverting}
        conversionProgress={conversionProgress}
        isPrintEnabled={isPrintEnabled}
        displayGlobalSizeIn={displayGlobalSizeIn}
        marginIn={marginIn}
        gapIn={gapIn}
        uploadedImages={uploadedImages}
        handleImageUpload={handleImageUpload}
        handlePrint={handlePrint}
        handleClearAll={handleClearAll}
        setDisplayGlobalSizeIn={setDisplayGlobalSizeIn}
        setMarginIn={setMarginIn}
        setUploadedImages={setUploadedImages}
        setGapIn={setGapIn}
        setGlobalTargetSizeIn={setGlobalTargetSizeIn}
      />
      <SidebarInset
        ref={previewContainerRef}
        className="flex items-center justify-center overflow-auto p-4"
      >
        {isPrintEnabled ? (
          <div
            className="shadow-lg"
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: "top center",
            }}
          >
            {pageLayouts.map((layout, pageIndex) => (
              <React.Fragment key={pageIndex}>
                <div className="text-muted-foreground flex w-full items-center justify-center py-2 text-sm">
                  Page {pageIndex + 1} of {pageLayouts.length}
                </div>
                <div
                  className="relative mb-4 overflow-hidden rounded border bg-white dark:bg-card last:mb-0"
                  style={{
                    width: `${PAPER_WIDTH_IN}in`,
                    height: `${PAPER_HEIGHT_IN}in`,
                    boxShadow: "0 0 0.5rem rgba(0,0,0,0.1)",
                  }}
                >
                  {layout.photos.map((photo) => (
                    <Popover.Root
                      key={photo.id}
                      open={selectedImage?.id === photo.id}
                      onOpenChange={(open) => !open && setSelectedImage(null)}
                    >
                      <Popover.Trigger asChild className="popover-trigger">
                        <div
                          onClick={() => setSelectedImage(photo)}
                          className="group absolute overflow-hidden transition-all duration-150 hover:ring-2 hover:ring-secondary hover:scale-[97.5%]"
                          style={{
                            left: `${photo.printXPx / RENDER_DPI}in`,
                            top: `${photo.printYPx / RENDER_DPI}in`,
                            width: `${photo.printWidthPx / RENDER_DPI}in`,
                            height: `${photo.printHeightPx / RENDER_DPI}in`,
                          }}
                        >
                          <Image
                            src={photo.objectUrl}
                            alt={photo.name}
                            fill
                            className="h-full w-full object-cover"
                          />
                          {photo.targetPrintDiagonalIn !== null && (
                            <div className="absolute right-0 bottom-0 rounded-tl-sm bg-blue-600 px-1 py-0.5 font-mono text-[8px] text-white">
                              {photo.targetPrintDiagonalIn.toFixed(1)}&quot;
                            </div>
                          )}
                          <Button
                            variant="destructive"
                            size="icon"
                            className="pointer-events-none absolute top-1 right-1 h-5 w-5 rounded-full opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(photo.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </Popover.Trigger>
                      <Popover.Content
                        className="popover-content bg-popover text-popover-foreground z-50 w-64 rounded-md border p-4 shadow-lg"
                        side="top"
                        align="center"
                        sideOffset={8}
                      >
                        <div className="space-y-4">
                          <h4 className="text-center text-sm font-medium">
                            Adjust Photo Size
                          </h4>

                          <SliderWithReset
                            id="size-slider"
                            label="Diagonal"
                            value={selectedImage?.targetPrintDiagonalIn ?? globalTargetSizeIn ?? DEFAULT_DIAGONAL_IN}
                            min={1}
                            max={10}
                            step={0.1}
                            onReset={() => updateSelectedImageSize(null)}
                            format={(value) => `${value.toFixed(1)}"`}
                            onCommit={(value) => {
                              if (selectedImage) {
                                updateSelectedImageSize(value);
                              }
                            }}
                          />

                          <div className="flex gap-2 pt-1">
                            <Button
                              onClick={() => updateSelectedImageSize(null)}
                              variant="outline"
                              size="sm"
                              className="h-8 flex-1 text-xs"
                            >
                              Reset
                            </Button>
                            <Button
                              onClick={() => setSelectedImage(null)}
                              size="sm"
                              className="h-8 flex-1 text-xs"
                            >
                              Done
                            </Button>
                          </div>
                        </div>
                      </Popover.Content>
                    </Popover.Root>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="m-auto text-center">
            <ImageIcon className="text-muted-foreground mx-auto h-12 w-12" />
            <h3 className="text-muted-foreground mt-4 text-sm font-medium">
              No photos uploaded
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Upload some photos to begin.
            </p>
          </div>
        )}
      </SidebarInset>
      {/* Always render the PrintableContent but keep it hidden */}
      <div style={{ display: "none" }}>
        <PrintableContent ref={printComponentRef} pageLayouts={pageLayouts} />
      </div>
    </div>
  );
}
