import JSZip from 'jszip';
// import heic2any from 'heic2any'; // Removed static import
import type { UploadedImage } from '@/lib/types';

// Helper function to get image dimensions
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectURL = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectURL);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(objectURL);
      reject(new Error(`Failed to load image ${file.name} to get dimensions: ${error instanceof Event ? error.type : String(error)}`));
    };
    img.src = objectURL;
  });
}

// Helper to check if a file is an image based on mime type and extension
function isImageFile(file: File, imageAcceptConfig: Record<string, string[]>): boolean {
  const fileExtension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  for (const mimeType in imageAcceptConfig) {
    if (file.type.startsWith(mimeType.replace('*', ''))) {
      const extensions = imageAcceptConfig[mimeType];
      if (extensions && extensions.includes(fileExtension)) {
        return true;
      }
    }
  }
  // Fallback for files that might not have a type (e.g. from zip) but have a valid extension
  if (!file.type) {
    for (const mimeType in imageAcceptConfig) {
        const extensions = imageAcceptConfig[mimeType];
        if (extensions && extensions.includes(fileExtension)) {
            return true;
        }
    }
  }
  return false;
}

// Helper to check if a file is a HEIC file
function isHeicFile(file: File): boolean {
  const fileNameLower = file.name.toLowerCase();
  return file.type === 'image/heic' || file.type === 'image/heif' || fileNameLower.endsWith('.heic') || fileNameLower.endsWith('.heif');
}


export async function processFiles(
  inputFiles: File[],
  imageAcceptConfig: Record<string, string[]>,
  maxIndividualSize: number,
  onProgress?: (progress: { type: 'conversion' | 'extraction'; loaded: number; total: number; currentFile?: string }) => void
): Promise<UploadedImage[]> {
  const processedImages: UploadedImage[] = [];
  const filesToProcess: File[] = [];

  // Phase 1: Extract files from zips
  const zipFiles = inputFiles.filter(file => file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip'));
  const otherFiles = inputFiles.filter(file => !(file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')));

  for (const file of otherFiles) {
    filesToProcess.push(file);
  }

  if (zipFiles.length > 0) {
    const totalZipFilesToExtract = zipFiles.length;
    let extractedZipCount = 0;
    onProgress?.({ type: 'extraction', loaded: extractedZipCount, total: totalZipFilesToExtract });

    for (const zipFile of zipFiles) {
      try {
        onProgress?.({ type: 'extraction', loaded: extractedZipCount, total: totalZipFilesToExtract, currentFile: zipFile.name });
        const zip = await JSZip.loadAsync(zipFile);
        const imagePromises: Promise<File | null>[] = [];

        zip.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir && isImageFile({ name: zipEntry.name, type: '' } as File, imageAcceptConfig)) { // Use a mock File for isImageFile
            const promise = zipEntry.async('blob').then(blob => {
              // Try to determine mime type from extension if blob.type is generic
              let determinedType = blob.type;
              const extension = zipEntry.name.split('.').pop()?.toLowerCase();
              if (blob.type === 'application/octet-stream' || !blob.type) {
                if (extension === 'jpg' || extension === 'jpeg') determinedType = 'image/jpeg';
                else if (extension === 'png') determinedType = 'image/png';
                else if (extension === 'gif') determinedType = 'image/gif';
                else if (extension === 'webp') determinedType = 'image/webp';
                else if (extension === 'svg') determinedType = 'image/svg+xml';
                else if (extension === 'heic' || extension === 'heif') determinedType = `image/${extension}`; // Keep for HEIC check
              }
              return new File([blob], zipEntry.name, { type: determinedType });
            }).catch(err => {
              console.error(`Error extracting ${zipEntry.name} from ${zipFile.name}:`, err);
              return null; // Skip this file if extraction fails
            });
            imagePromises.push(promise);
          }
        });
        const extractedFiles = (await Promise.all(imagePromises)).filter((f): f is File => f !== null);
        filesToProcess.push(...extractedFiles);
        extractedZipCount++;
        onProgress?.({ type: 'extraction', loaded: extractedZipCount, total: totalZipFilesToExtract, currentFile: zipFile.name });
      } catch (error) {
        console.error(`Failed to process zip file ${zipFile.name}:`, error);
        // Optionally, notify the user about the failed zip file
        extractedZipCount++; // Count as processed even if failed to avoid infinite loop on progress
        onProgress?.({ type: 'extraction', loaded: extractedZipCount, total: totalZipFilesToExtract, currentFile: zipFile.name });
      }
    }
  }

  // Phase 2: Filter by size, convert HEIC, and create UploadedImage objects
  const heicFilesToConvert = filesToProcess.filter(isHeicFile);
  const otherImageFiles = filesToProcess.filter(file => !isHeicFile(file) && isImageFile(file, imageAcceptConfig));

  let convertedHeicCount = 0;
  let heic2any: ((options: any) => Promise<Blob | Blob[]>) | null = null;

  if (heicFilesToConvert.length > 0) {
    onProgress?.({ type: 'conversion', loaded: convertedHeicCount, total: heicFilesToConvert.length });
    try {
      heic2any = (await import('heic2any')).default;
    } catch (e) {
      console.error("Failed to dynamically import heic2any:", e);
      // If heic2any fails to load, we can't process these files.
      // Add them to otherImageFiles to be processed as non-HEIC, or mark as error.
      // For now, they will be filtered out later if not valid images or fail dimension checks.
    }
  }

  const conversionPromises = heicFilesToConvert.map(async (file) => {
    if (file.size > maxIndividualSize) {
      console.warn(`Skipping HEIC file ${file.name} as it exceeds max size before conversion.`);
      return null;
    }
    if (!heic2any) {
      console.warn(`Skipping HEIC conversion for ${file.name} as heic2any module failed to load.`);
      // Return the original file to see if it can be processed by other means, or null
      return null;
    }
    try {
      onProgress?.({ type: 'conversion', loaded: convertedHeicCount, total: heicFilesToConvert.length, currentFile: file.name });
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      }) as Blob; // heic2any can return Blob[] but for image/jpeg it's Blob
      const convertedFile = new File([convertedBlob], `${file.name.substring(0, file.name.lastIndexOf('.')) || file.name}.jpeg`, { type: 'image/jpeg' });
      convertedHeicCount++;
      onProgress?.({ type: 'conversion', loaded: convertedHeicCount, total: heicFilesToConvert.length, currentFile: file.name });
      return convertedFile;
    } catch (error) {
      console.error(`Failed to convert HEIC file ${file.name}:`, error);
      convertedHeicCount++; // Still increment to ensure progress completes
      onProgress?.({ type: 'conversion', loaded: convertedHeicCount, total: heicFilesToConvert.length, currentFile: file.name });
      return null; // Skip this file if conversion fails
    }
  });

  const successfullyConvertedFiles = (await Promise.all(conversionPromises)).filter((f): f is File => f !== null);

  const allImageFiles = [...otherImageFiles, ...successfullyConvertedFiles];

  for (const file of allImageFiles) {
    if (file.size > maxIndividualSize) {
      console.warn(`Skipping file ${file.name} as it exceeds max size ${maxIndividualSize}. Size: ${file.size}`);
      continue;
    }
    if (!isImageFile(file, imageAcceptConfig)) { // Final check after potential conversions
        console.warn(`Skipping file ${file.name} as it's not a recognized image type after processing.`);
        continue;
    }

    try {
      const dimensions = await getImageDimensions(file);
      const objectURL = URL.createObjectURL(file); // Create object URL here for UploadedImage
      processedImages.push({
        id: `${Date.now()}-${processedImages.length}-${file.name}`,
        name: file.name,
        objectUrl: objectURL,
        originalWidthPx: dimensions.width,
        originalHeightPx: dimensions.height,
        targetPrintDiagonalIn: null,
        rawFile: file, // Keep the processed file (e.g., converted JPEG)
      });
    } catch (error) {
      console.error(`Error processing file ${file.name} for UploadedImage:`, error);
      // Object URL might not have been created or needs cleanup if error happened after creation
    }
  }

  // Sort images by size (descending) as in the original implementation
  processedImages.sort(
    (a, b) =>
      b.originalWidthPx * b.originalHeightPx -
      a.originalWidthPx * a.originalHeightPx,
  );

  return processedImages;
}
