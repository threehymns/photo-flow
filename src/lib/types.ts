export type UploadedImage = {
  id: string;
  name: string;
  objectUrl: string;
  originalWidthPx: number;
  originalHeightPx: number;
  targetPrintDiagonalIn: number | null;
  rawFile: File;
};

export type PlacedPhoto = UploadedImage & {
  printXPx: number;
  printYPx: number;
  printWidthPx: number;
  printHeightPx: number;
  isRotated: boolean; // true if the image is rotated 90 degrees
};

export type PrintPageLayout = {
  photos: PlacedPhoto[];
};

export type EmptySpace = { x: number; y: number; w: number; h: number };
