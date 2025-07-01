"use client";

import React from "react";
import { useRef, useState, useCallback, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { SliderWithReset } from "@/components/ui/slider-with-reset";
import {
  AppSidebar,
  DEFAULT_DIAGONAL_IN,
  DEFAULT_GAP_IN,
  DEFAULT_MARGIN_IN,
} from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UploadedImage, PrintPageLayout, EmptySpace } from "@/lib/types";
import Image from "next/image";
import { Image as ImageIcon, X } from "lucide-react";

// Constants
const RENDER_DPI = 96;
const PAPER_WIDTH_IN = 8.5;
const PAPER_HEIGHT_IN = 11;

const RotatedImage = ({
  photo,
  className,
}: {
  photo: {
    objectUrl: string;
    name: string;
    isRotated?: boolean;
    printWidthPx: number;
    printHeightPx: number;
  };
  className: string;
}) => {
  if (photo.isRotated) {
    return (
      <div
        className="relative overflow-hidden w-full h-full"
      >
        <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-90"
          style={{
            width: `${(photo.printHeightPx / photo.printWidthPx) * 100}%`,
            height: `${(photo.printWidthPx / photo.printHeightPx) * 100}%`,
          }}
        >
          <Image
            src={photo.objectUrl}
            alt={photo.name}
            fill
            className={className}
          />
        </div>
      </div>
    );
  }

  return (
    <Image
      src={photo.objectUrl}
      alt={photo.name}
      fill
      className={className}
    />
  );
};

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
              <RotatedImage photo={photo} className="h-full w-full object-cover" />
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
  const [globalTargetSizeIn, setGlobalTargetSizeIn] =
    useState<number>(DEFAULT_DIAGONAL_IN);
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


  const mergeEmptySpaces = useCallback((spaces: (EmptySpace | undefined)[]): EmptySpace[] => {
    let wasMerged = true;
    let currentSpaces: EmptySpace[] = spaces.filter((s): s is EmptySpace => !!s);

    while (wasMerged) {
      wasMerged = false;
      const nextSpaces: EmptySpace[] = [];
      const mergedIndices = new Set<number>();

      for (let i = 0; i < currentSpaces.length; i++) {
        if (mergedIndices.has(i)) continue;

        const r1 = currentSpaces[i]!;
        for (let j = i + 1; j < currentSpaces.length; j++) {
          if (mergedIndices.has(j)) continue;

          const r2 = currentSpaces[j]!;

          // Vertical merge
          if (r1.x === r2.x && r1.w === r2.w) {
            if (r1.y + r1.h === r2.y) {
              r1.h += r2.h;
              mergedIndices.add(j);
              wasMerged = true;
              continue;
            }
            if (r2.y + r2.h === r1.y) {
              r1.y = r2.y;
              r1.h += r2.h;
              mergedIndices.add(j);
              wasMerged = true;
              continue;
            }
          }

          // Horizontal merge
          if (r1.y === r2.y && r1.h === r2.h) {
            if (r1.x + r1.w === r2.x) {
              r1.w += r2.w;
              mergedIndices.add(j);
              wasMerged = true;
              continue;
            }
            if (r2.x + r2.w === r1.x) {
              r1.x = r2.x;
              r1.w += r2.w;
              mergedIndices.add(j);
              wasMerged = true;
              continue;
            }
          }
        }
        nextSpaces.push(r1);
      }

      currentSpaces = nextSpaces;
    }
    return currentSpaces;
  }, []);

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

    for (const img of processedImages) {
      if (
        !img.printWidthPx ||
        !img.printHeightPx ||
        img.printWidthPx <= 0 ||
        img.printHeightPx <= 0
      ) {
        continue;
      }

      type BestFit = {
        pageIdx: number;
        spaceIdx: number;
        score: number;
        isRotated: boolean;
        width: number;
        height: number;
      };

      let bestFit: BestFit | null = null;

      const orientationsToTry = [
        {
          width: img.printWidthPx,
          height: img.printHeightPx,
          isRotated: false,
        },
      ];
      if (img.printWidthPx !== img.printHeightPx) {
        orientationsToTry.push({
          width: img.printHeightPx,
          height: img.printWidthPx,
          isRotated: true,
        });
      }

      for (let pageIdx = 0; pageIdx < newPageLayouts.length; pageIdx++) {
        const spaces = pageEmptySpaces[pageIdx];
        if (!spaces) continue;
        for (let spaceIdx = 0; spaceIdx < spaces.length; spaceIdx++) {
          const space = spaces[spaceIdx];
          if (!space) continue;
          for (const orientation of orientationsToTry) {
            const { width, height, isRotated } = orientation;
            if (width <= space.w && height <= space.h) {
              const leftoverW = space.w - width;
              const leftoverH = space.h - height;
              const score = Math.min(leftoverW, leftoverH); // BSSF

              if (!bestFit || score < bestFit.score) {
                bestFit = { pageIdx, spaceIdx, score, isRotated, width, height };
              }
            }
          }
        }
      }

      if (!bestFit) {
        addNewPage();
        const pageIdx = newPageLayouts.length - 1;
        const spaces = pageEmptySpaces[pageIdx];
        const space = spaces?.[0];
        if (!space) continue;

        for (const orientation of orientationsToTry) {
          const { width, height, isRotated } = orientation;
          if (width <= space.w && height <= space.h) {
            const leftoverW = space.w - width;
            const leftoverH = space.h - height;
            const score = Math.min(leftoverW, leftoverH);
            if (!bestFit || score < bestFit.score) {
              bestFit = {
                pageIdx,
                spaceIdx: 0,
                score,
                isRotated,
                width,
                height,
              };
            }
          }
        }
      }

      if (bestFit) {
        const { pageIdx, spaceIdx, isRotated, width, height } = bestFit;
        const space = pageEmptySpaces[pageIdx]?.[spaceIdx];
        if (!space) continue;

        const layout = newPageLayouts[pageIdx];
        if (!layout) continue;

        layout.photos.push({
          ...img,
          printXPx: space.x,
          printYPx: space.y,
          printWidthPx: width,
          printHeightPx: height,
          isRotated,
        });

        const requiredWidth = width + spacingPx;
        const requiredHeight = height + spacingPx;
        const newSpaces: EmptySpace[] = [];

        const leftoverW = space.w - requiredWidth;
        const leftoverH = space.h - requiredHeight;

        if (leftoverW > 0 && leftoverH > 0) {
            if (space.w > space.h) { // wide space, split vertically
                newSpaces.push({ x: space.x + requiredWidth, y: space.y, w: leftoverW, h: space.h });
                newSpaces.push({ x: space.x, y: space.y + requiredHeight, w: requiredWidth, h: leftoverH });
            } else { // tall space, split horizontally
                newSpaces.push({ x: space.x, y: space.y + requiredHeight, w: space.w, h: leftoverH });
                newSpaces.push({ x: space.x + requiredWidth, y: space.y, w: leftoverW, h: height });
            }
        } else if (leftoverW > 0) {
            newSpaces.push({ x: space.x + requiredWidth, y: space.y, w: leftoverW, h: space.h });
        } else if (leftoverH > 0) {
            newSpaces.push({ x: space.x, y: space.y + requiredHeight, w: space.w, h: leftoverH });
        }

        const currentSpaces = pageEmptySpaces[pageIdx];
        if(currentSpaces) {
            currentSpaces.splice(spaceIdx, 1, ...newSpaces);
            pageEmptySpaces[pageIdx] = mergeEmptySpaces(currentSpaces);
        }
      } else {
        console.warn("Image is too large to fit on a page:", img);
      }
    }

    setPageLayouts(newPageLayouts.filter(layout => layout.photos.length > 0));
  }, [processedImages, marginIn, gapIn, mergeEmptySpaces]);

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
      <SidebarInset ref={previewContainerRef} className="overflow-hidden">
        <ScrollArea className="h-[calc(100vh-1rem)] w-full">
          <div className="flex min-h-full w-full items-center justify-center">
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
                      className="dark:bg-card relative mb-4 overflow-hidden rounded border bg-white last:mb-0"
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
                          onOpenChange={(open) =>
                            !open && setSelectedImage(null)
                          }
                        >
                          <Popover.Trigger asChild className="popover-trigger">
                            <div
                              onClick={() => setSelectedImage(photo)}
                              className="group hover:ring-secondary absolute overflow-hidden transition-all duration-150 hover:scale-[97.5%] hover:ring-2"
                              style={{
                                left: `${photo.printXPx / RENDER_DPI}in`,
                                top: `${photo.printYPx / RENDER_DPI}in`,
                                width: `${photo.printWidthPx / RENDER_DPI}in`,
                                height: `${photo.printHeightPx / RENDER_DPI}in`,
                              }}
                            >
                              <RotatedImage photo={photo} className="h-full w-full object-cover" />
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
                                value={
                                  selectedImage?.targetPrintDiagonalIn ??
                                  globalTargetSizeIn ??
                                  DEFAULT_DIAGONAL_IN
                                }
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
              <div className="flex h-[calc(100vh-1rem)] w-full items-center justify-center">
                <div className="text-center">
                  <ImageIcon className="text-muted-foreground mx-auto h-12 w-12" />
                  <h3 className="text-muted-foreground mt-4 text-sm font-medium">
                    No photos uploaded
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Upload some photos to begin.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SidebarInset>
      {/* Always render the PrintableContent but keep it hidden */}
      <div style={{ display: "none" }}>
        <PrintableContent ref={printComponentRef} pageLayouts={pageLayouts} />
      </div>
    </div>
  );
}