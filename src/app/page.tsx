'use client';

import React, { useState, useRef, useCallback, type ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Header } from '@/components/layout/header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Upload, Printer, Settings, Image as ImageIcon, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';


// Types
type UploadedImage = {
    id: string;
    name: string;
    dataUrl: string;
    originalWidthPx: number;
    originalHeightPx: number;
    targetPrintDiagonalIn: number | null;
};

type PlacedPhoto = UploadedImage & {
    printXPx: number;
    printYPx: number;
    printWidthPx: number;
    printHeightPx: number;
};

type PrintPageLayout = {
    photos: PlacedPhoto[];
};

type PhotoPrintSettings = {
    marginIn: number;
    spacingIn: number;
};

// Constants
const RENDER_DPI = 96;
const LETTER_WIDTH_IN = 8.5;
const LETTER_HEIGHT_IN = 11;
const DEFAULT_MARGIN_IN = 0.5;
const DEFAULT_TARGET_DIAGONAL_IN = 3.5;
const MAX_TARGET_DIAGONAL_IN = 10;

const PrintableContent = React.forwardRef<HTMLDivElement, { pageLayouts: PrintPageLayout[] }>(({ pageLayouts }, ref) => {
    return (
        <div ref={ref}>
            {pageLayouts.map((layout, pageIndex) => (
                <div key={pageIndex} className="page-break"
                    style={{
                        width: `${LETTER_WIDTH_IN}in`,
                        height: `${LETTER_HEIGHT_IN}in`,
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                    {layout.photos.map((photo) => (
                        <img
                            key={photo.id}
                            src={photo.dataUrl}
                            alt={photo.name}
                            style={{
                                position: 'absolute',
                                left: `${photo.printXPx / RENDER_DPI}in`,
                                top: `${photo.printYPx / RENDER_DPI}in`,
                                width: `${photo.printWidthPx / RENDER_DPI}in`,
                                height: `${photo.printHeightPx / RENDER_DPI}in`,
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
});
PrintableContent.displayName = 'PrintableContent';

export default function PrintPage() {
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [globalTargetSizeIn, setGlobalTargetSizeIn] = useState<number>(DEFAULT_TARGET_DIAGONAL_IN);
    const [displayGlobalSizeIn, setDisplayGlobalSizeIn] = useState<number>(globalTargetSizeIn);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [pageLayouts, setPageLayouts] = useState<PrintPageLayout[]>([]);
    const [marginIn, setMarginIn] = useState<number>(0.1);
    const [gapIn, setGapIn] = useState<number>(0);
    

    const [previewScale, setPreviewScale] = useState(0.5);
    const [selectedImage, setSelectedImage] = useState<PlacedPhoto | null>(null);
    const [overrideSizeIn, setOverrideSizeIn] = useState<number>(DEFAULT_TARGET_DIAGONAL_IN);
    const [isLoading, setIsLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const printComponentRef = useRef<HTMLDivElement>(null);

    const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            setIsLoading(true);
            const newImagesPromises = Array.from(files).map((file, index) => {
                return new Promise<UploadedImage>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            resolve({
                                id: `${Date.now()}-${index}-${file.name}`,
                                name: file.name,
                                dataUrl: e.target?.result as string,
                                originalWidthPx: img.width,
                                originalHeightPx: img.height,
                                targetPrintDiagonalIn: null,
                            });
                        };
                        img.onerror = reject;
                        img.src = e.target?.result as string;
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(newImagesPromises).then(newImages => {
                setUploadedImages(prev => [...prev, ...newImages].sort((a, b) => (b.originalWidthPx * b.originalHeightPx) - (a.originalWidthPx * a.originalHeightPx)));
            }).catch(error => {
                console.error("Error loading images:", error);
            }).finally(() => {
                setIsLoading(false);
            });
        }
    };

    const calculateLayout = useCallback(() => {
        if (uploadedImages.length === 0) {
            setPageLayouts([]);
            return;
        }

        const usablePageWidthIn = LETTER_WIDTH_IN - 2 * marginIn;
        const usablePageHeightIn = LETTER_HEIGHT_IN - 2 * marginIn;

        if (usablePageWidthIn <= 0 || usablePageHeightIn <= 0) {
            setPageLayouts([{ photos: [] }]);
            return;
        }

        const spacingPx = gapIn * RENDER_DPI;
        const newPageLayouts: PrintPageLayout[] = [];
        newPageLayouts[0] = { photos: [] };
        let currentPageIndex = 0;
        let currentX = marginIn * RENDER_DPI;
        let currentY = marginIn * RENDER_DPI;
        let currentRowMaxHeight = 0;

        uploadedImages.forEach(img => {
            const targetDiagonalIn = img.targetPrintDiagonalIn ?? globalTargetSizeIn;
            if (targetDiagonalIn <= 0) return;

            const aspectRatio = img.originalHeightPx / img.originalWidthPx;
            const printWidthIn = targetDiagonalIn / Math.sqrt(1 + aspectRatio * aspectRatio);
            const printHeightIn = aspectRatio * printWidthIn;
            const printWidthPx = printWidthIn * RENDER_DPI;
            const printHeightPx = printHeightIn * RENDER_DPI;

            if (printWidthPx <= 0 || printHeightPx <= 0) return;

            if (currentX + printWidthPx > (marginIn + usablePageWidthIn) * RENDER_DPI) {
                currentX = marginIn * RENDER_DPI;
                currentY += currentRowMaxHeight + spacingPx;
                currentRowMaxHeight = 0;
            }

            if (currentY + printHeightPx > (marginIn + usablePageHeightIn) * RENDER_DPI) {
                newPageLayouts.push({ photos: [] });
                currentPageIndex++;
                currentX = marginIn * RENDER_DPI;
                currentY = marginIn * RENDER_DPI;
                currentRowMaxHeight = 0;
            }

            if (!newPageLayouts[currentPageIndex]) {
                newPageLayouts.push({ photos: [] });
            }

            let currentPage: PrintPageLayout | undefined = newPageLayouts[currentPageIndex];
            if (!currentPage) {
                currentPage = { photos: [] };
                newPageLayouts[currentPageIndex] = currentPage;
            }
            currentPage.photos.push({
                ...img,
                printXPx: currentX,
                printYPx: currentY,
                printWidthPx: printWidthPx,
                printHeightPx: printHeightPx,
            });

            currentX += printWidthPx + spacingPx;
            currentRowMaxHeight = Math.max(currentRowMaxHeight, printHeightPx);
        });

        setPageLayouts(newPageLayouts);

    }, [uploadedImages, globalTargetSizeIn, marginIn, gapIn]);

    const updateGlobalSize = useCallback((newSize: number) => {
        setGlobalTargetSizeIn(newSize);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        debounceTimeoutRef.current = setTimeout(() => {
            calculateLayout();
        }, 300);
    }, [calculateLayout]);

    useEffect(() => {
        setDisplayGlobalSizeIn(globalTargetSizeIn);
    }, [globalTargetSizeIn]);

    useEffect(() => {
        calculateLayout();
    }, [calculateLayout]);

    useEffect(() => {
        const calculateScale = () => {
            if (!previewContainerRef.current) return;
            const availableWidth = previewContainerRef.current.clientWidth - 32; // p-4
            const scale = availableWidth / (LETTER_WIDTH_IN * RENDER_DPI);
            setPreviewScale(Math.max(0.1, Math.min(scale, 1.0)));
        };

        calculateScale();
        const resizeObserver = new ResizeObserver(calculateScale);
        if (previewContainerRef.current) {
            resizeObserver.observe(previewContainerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [pageLayouts]);

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const pageStyle = `
        @page {
            size: ${LETTER_WIDTH_IN}in ${LETTER_HEIGHT_IN}in;
            margin: 0;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .page-break {
                page-break-after: always;
                break-after: page;
            }
            .page-break:last-child {
                page-break-after: auto;
                break-after: auto;
            }
            @page { margin: 0; }
            body { margin: 0.5cm; }
        }
    `;

    const handlePrint = useReactToPrint({
        contentRef: printComponentRef,
        pageStyle: pageStyle,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                handlePrint();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handlePrint]);

    const handleOpenOverride = (image: PlacedPhoto) => {
        setSelectedImage(image);
        setOverrideSizeIn(image.targetPrintDiagonalIn ?? globalTargetSizeIn);
    };

    const handleApplyOverride = () => {
        const imageToUpdate = selectedImage;
        if (imageToUpdate) {
            setUploadedImages(prevImages =>
                prevImages.map(img =>
                    img.id === imageToUpdate.id
                        ? { ...img, targetPrintDiagonalIn: overrideSizeIn }
                        : img
                )
            );
        }
    };

    const handleResetOverride = () => {
        const imageToUpdate = selectedImage;
        if (imageToUpdate) {
            setUploadedImages(prevImages =>
                prevImages.map(img =>
                    img.id === imageToUpdate.id
                        ? { ...img, targetPrintDiagonalIn: null }
                        : img
                )
            );
            setSelectedImage(null);
        }
    };

    const handleClearAll = () => {
        setUploadedImages([]);
    };

    const firstPagePhotosLength = pageLayouts[0]?.photos?.length ?? 0;
    const isPrintEnabled = pageLayouts.length > 0 && firstPagePhotosLength > 0;

    return (
        <>
            <Header />
            <div className="container mx-auto p-4 sm:p-6 lg:p-8 print:hidden">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold tracking-tight">Photo Print Layout</h1>
                    <p className="text-muted-foreground mt-2">
                        Upload your photos, arrange them on letter-sized pages, and print.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <aside className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="h-5 w-5" />
                                    Controls
                                </CardTitle>
                                <CardDescription>Adjust settings for your print layout.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button onClick={triggerFileInput} className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Upload className="mr-2 h-4 w-4" />
                                    )}
                                    Upload Images
                                </Button>
                                <Input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                />
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="block text-sm font-medium text-muted-foreground" htmlFor="global-size">Global Size ({displayGlobalSizeIn.toFixed(1)}&quot; diag)</Label>
                                        <Slider
                                            id="global-size"
                                            min={1}
                                            max={MAX_TARGET_DIAGONAL_IN}
                                            step={0.01}
                                            value={[displayGlobalSizeIn]}
                                            onValueChange={(value) => { if (value[0] !== undefined) setDisplayGlobalSizeIn(value[0]); }}
                                            onValueCommit={(value) => { if (value[0] !== undefined) updateGlobalSize(value[0]); }}
                                            disabled={!isPrintEnabled}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm font-medium text-muted-foreground" htmlFor="margin">Page Margin</Label>
                                            <span className="text-xs text-muted-foreground">{marginIn.toFixed(1)}"</span>
                                        </div>
                                        <Slider
                                            id="margin"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={[marginIn]}
                                            onValueChange={(value) => { if (value[0] !== undefined) setMarginIn(value[0]); }}
                                            disabled={!isPrintEnabled}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm font-medium text-muted-foreground" htmlFor="gap">Photo Gap</Label>
                                            <span className="text-xs text-muted-foreground">{gapIn.toFixed(1)}"</span>
                                        </div>
                                        <Slider
                                            id="gap"
                                            min={0}
                                            max={0.5}
                                            step={0.05}
                                            value={[gapIn]}
                                            onValueChange={(value) => { if (value[0] !== undefined) setGapIn(value[0]); }}
                                            disabled={!isPrintEnabled}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2">
                                <Button onClick={handlePrint} className="w-full" variant="secondary" disabled={!isPrintEnabled}>
                                    <Printer className="mr-2 h-4 w-4" /> Print
                                </Button>
                                <Button onClick={handleClearAll} className="w-full" variant="destructive" disabled={!isPrintEnabled}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Clear All
                                </Button>
                            </CardFooter>
                        </Card>
                    </aside>

                    <main className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Print Preview</CardTitle>
                                <CardDescription>{isPrintEnabled ? `${pageLayouts.length} page(s) will be printed.` : 'Upload images to begin.'}</CardDescription>
                            </CardHeader>
                            <CardContent ref={previewContainerRef} className="bg-muted/20 p-2 rounded-lg min-h-[600px] flex items-center justify-center">
                                {isPrintEnabled ? (
                                    <div className="space-y-4">
                                        {pageLayouts.map((layout, pageIndex) => (
                                            <div key={pageIndex}>
                                                <p className="text-sm font-medium text-muted-foreground/80 mb-2 text-center">Page {pageIndex + 1} of {pageLayouts.length}</p>
                                                <div
                                                    className="relative bg-background shadow-lg mx-auto border border-border"
                                                    style={{
                                                        width: LETTER_WIDTH_IN * RENDER_DPI * previewScale,
                                                        height: LETTER_HEIGHT_IN * RENDER_DPI * previewScale,
                                                    }}
                                                >
                                                    {layout.photos.map((photo) => (
                                                        <Popover key={photo.id} onOpenChange={(open) => !open && setSelectedImage(null)}>
                                                            <PopoverTrigger asChild>
                                                                <button
                                                                    onClick={() => handleOpenOverride(photo)}
                                                                    className="absolute border border-border hover:border-primary hover:ring-2 hover:ring-ring focus:outline-none focus:ring-2 focus:ring-ring rounded-sm overflow-hidden transition-all duration-150"
                                                                    style={{
                                                                        left: photo.printXPx * previewScale,
                                                                        top: photo.printYPx * previewScale,
                                                                        width: photo.printWidthPx * previewScale,
                                                                        height: photo.printHeightPx * previewScale,
                                                                    }}
                                                                >
                                                                    <img
                                                                        src={photo.dataUrl}
                                                                        alt={photo.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                    {photo.targetPrintDiagonalIn !== null && (
                                                                        <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[8px] px-1 py-0.5 rounded-tl-sm font-mono">
                                                                            {photo.targetPrintDiagonalIn.toFixed(1)}"
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-56" side="top" align="center" sideOffset={8}>
                                                                <div className="space-y-4">
                                                                    <h4 className="font-medium text-sm text-center">Adjust Photo Size</h4>
                                                                    
                                                                    <div className="space-y-2">
                                                                        <div className="flex justify-between items-center">
                                                                            <Label htmlFor="override-size" className="text-xs">
                                                                                Diagonal: {overrideSizeIn.toFixed(1)}"
                                                                            </Label>
                                                                        </div>
                                                                        <Slider
                                                                            id="override-size"
                                                                            min={1}
                                                                            max={MAX_TARGET_DIAGONAL_IN}
                                                                            step={0.1}
                                                                            value={[overrideSizeIn]}
                                                                            onValueChange={(value) => value.length > 0 && setOverrideSizeIn(value[0]!)}
                                                                            className="py-2"
                                                                        />
                                                                    </div>

                                                                    <div className="flex gap-2 pt-1">
                                                                        <Button 
                                                                            onClick={handleResetOverride} 
                                                                            variant="outline" 
                                                                            size="sm"
                                                                            className="flex-1 h-8 text-xs"
                                                                        >
                                                                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                                                            Reset
                                                                        </Button>
                                                                        <Button 
                                                                            onClick={handleApplyOverride} 
                                                                            size="sm"
                                                                            className="flex-1 h-8 text-xs"
                                                                        >
                                                                            Apply
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground/70">
                                        <ImageIcon className="mx-auto h-12 w-12" />
                                        <p className="mt-4">Upload images to see the print preview.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </main>
                </div>
            </div>
            <div style={{ position: 'absolute', left: '-9999px' }}>
                <PrintableContent ref={printComponentRef} pageLayouts={pageLayouts} />
            </div>
        </>
    );
}
