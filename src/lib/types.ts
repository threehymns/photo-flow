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
};

export type PrintPageLayout = {
  photos: PlacedPhoto[];
};
