"use client";

import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { processFiles } from "@/lib/image-processor"; // Assuming this will handle the File objects
import type { UploadedImage } from "@/lib/types";
import { env } from "@/env.js"; // Import t3-env

const GOOGLE_API_KEY = env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_APP_ID = env.NEXT_PUBLIC_GOOGLE_APP_ID || ""; // APP_ID is optional

// No need for manual console.warn, t3-env handles this at build/runtime if vars are missing

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

type GoogleDrivePickerButtonProps = {
  onFilesSelected: (images: UploadedImage[]) => void;
  disabled?: boolean;
  imageAcceptConfig: Record<string, string[]>; // To pass to processFiles
  maxIndividualSize: number; // To pass to processFiles
};

export function GoogleDrivePickerButton({
  onFilesSelected,
  disabled = false,
  imageAcceptConfig,
  maxIndividualSize,
}: GoogleDrivePickerButtonProps) {
  const [pickerApiLoaded, setPickerApiLoaded] = useState(false);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null); // For displaying errors

  // Load GAPI and GIS (Google Identity Services) scripts
  useEffect(() => {
    let gapiScriptMounted = true;
    let gisScriptMounted = true;

    const scriptGapi = document.createElement("script");
    scriptGapi.src = "https://apis.google.com/js/api.js";
    scriptGapi.async = true;
    scriptGapi.defer = true;
    scriptGapi.onload = () => {
      if (!gapiScriptMounted) return;
      window.gapi.load("client:picker", () => {
        if (!gapiScriptMounted) return;
        setGapiLoaded(true);
        window.gapi.client.load('drive', 'v3', () => {
          if (gapiScriptMounted) console.log("Google Drive API client loaded");
        }).catch((err: any) => {
            if (gapiScriptMounted) {
                console.error("Error loading Google Drive API client:", err);
                setError("Error loading Google Drive API. Please refresh.");
            }
        });
      });
    };
    scriptGapi.onerror = () => {
        if (gapiScriptMounted) setError("Failed to load Google API script. Check connection or adblockers.");
    }
    document.body.appendChild(scriptGapi);

    const scriptGis = document.createElement("script");
    scriptGis.src = "https://accounts.google.com/gsi/client";
    scriptGis.async = true;
    scriptGis.defer = true;
    scriptGis.onload = () => {
      if (!gisScriptMounted || !window.google?.accounts?.oauth2) {
        if (gisScriptMounted) setError("Google Identity Service not available after script load.");
        return;
      }
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: "", // Handled by requestAccessToken promise/callback
          error_callback: (gisError: any) => {
            if (gisScriptMounted) {
                console.error("GIS Error:", gisError);
                let message = "Google Authentication Error.";
                if (gisError?.type === "popup_closed") message = "Authentication popup closed by user.";
                else if (gisError?.type === "popup_failed_to_open") message = "Authentication popup blocked. Please disable popup blockers.";
                setError(message);
            }
          }
        });
        if (gisScriptMounted) setTokenClient(client);
      } catch (e: any) {
        if (gisScriptMounted) {
            console.error("Error initializing GIS token client:", e);
            setError("Failed to initialize Google Authentication.");
        }
      }
    };
    scriptGis.onerror = () => {
        if (gisScriptMounted) setError("Failed to load Google Identity script. Check connection or adblockers.");
    }
    document.body.appendChild(scriptGis);

    return () => {
      gapiScriptMounted = false;
      gisScriptMounted = false;
      // Attempt to remove scripts if they were added
      if (scriptGapi.parentNode) scriptGapi.parentNode.removeChild(scriptGapi);
      if (scriptGis.parentNode) scriptGis.parentNode.removeChild(scriptGis);
    };
  }, [GOOGLE_CLIENT_ID]); // Added GOOGLE_CLIENT_ID to dependency array

  // Initialize Picker API once GAPI is loaded
  useEffect(() => {
    if (gapiLoaded && window.gapi?.picker) {
      setPickerApiLoaded(true);
    }
  }, [gapiLoaded]);

  const handleAuthClick = useCallback(async () => {
    setError(null); // Clear previous errors
    if (!tokenClient) {
      console.error("Google Identity Services client not initialized.");
      setError("Google authentication is not ready. Please try again in a moment.");
      return;
    }

    const processAuthResult = (tokenResponse: any) => {
      // This callback is invoked when the token client successfully obtains a token or if there's an error during the token request.
      if (tokenResponse && tokenResponse.access_token) {
        window.gapi.client.setToken({ access_token: tokenResponse.access_token });
        createPicker();
      } else {
        // This 'else' might be hit if tokenResponse is null or doesn't have access_token.
        // The initTokenClient's error_callback should handle more specific errors.
        console.error("Access token not received or token response issue:", tokenResponse);
        // Check if GIS error_callback already set an error
        if (!error) setError("Failed to get Google Drive access. Please grant permission or check console.");
      }
    };

    if (window.gapi?.client?.getToken()?.access_token) {
      createPicker();
    } else {
      tokenClient.requestAccessToken({
        prompt: "consent",
        // callback: processAuthResult, // This callback in requestAccessToken is for success
        // For GIS, the callback in initTokenClient is the primary one for success/error.
        // However, some flows might still use this one.
        // Let's rely on the one in initTokenClient for now to avoid duplicate calls/handling.
        // If issues arise, this might need to be processAuthResult.
      });
      // The actual token processing and picker creation will be triggered by the callback in initTokenClient
      // if requestAccessToken is successful. If it fails, error_callback in initTokenClient handles it.
    }
  }, [tokenClient, GOOGLE_CLIENT_ID, createPicker, error]);


  const pickerCallback = useCallback(
    async (data: google.picker.ResponseObject) => {
      setError(null); // Clear previous errors
      if (data.action === google.picker.Action.PICKED) {
        setIsProcessing(true);
        const filesToFetch: { id: string; name: string, mimeType?: string }[] = [];
        if (data.docs && data.docs.length > 0) {
            data.docs.forEach((doc) => {
              // Ensure doc.id and doc.name exist
              if (doc.id && doc.name) {
                filesToFetch.push({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
              } else {
                console.warn("Picker returned a document without id or name:", doc);
              }
            });
        }


        if (filesToFetch.length === 0) {
          setIsProcessing(false);
          if (data.docs && data.docs.length > 0) {
            setError("No valid files selected or files were missing details.");
          }
          return;
        }

        const fetchedFiles: File[] = [];
        const token = window.gapi.client.getToken();
        if (!token || !token.access_token) {
          console.error("No access token available to fetch files.");
          setError("Authentication error: Cannot fetch files. Please try authenticating again.");
          setIsProcessing(false);
          return;
        }
        const accessToken = token.access_token;

        // Ensure Drive API client is loaded
        if (!window.gapi.client.drive) {
            await new Promise<void>((resolve, reject) => {
                window.gapi.client.load('drive', 'v3', resolve).catch(reject);
            });
        }

        for (const fileToFetch of filesToFetch) {
          try {
            const res = await window.gapi.client.drive.files.get({
              fileId: fileToFetch.id,
              alt: "media",
            });

            if (res.status !== 200 || !res.body) {
                 let errorBody = "Unknown error";
                if (typeof res.body === 'string') errorBody = res.body;
                else if (res.result && typeof res.result.error === 'string') errorBody = res.result.error;
                else if (res.result && res.result.error && typeof res.result.error.message === 'string') errorBody = res.result.error.message;
              throw new Error(
                `Failed to download file ${fileToFetch.name}. Status: ${res.status}. Body: ${errorBody}`,
              );
            }
            // res.body is a string for text files, for binary it's ArrayBuffer like.
            // We need to convert this to a Blob/File.
            // The 'content-type' header from the response is crucial.
            const contentType = res.headers?.['content-type'] || fileToFetch.mimeType || 'application/octet-stream';
            const blob = new Blob([res.body], { type: contentType });
            fetchedFiles.push(new File([blob], fileToFetch.name, { type: contentType }));

          } catch (error: any) {
            console.error(`Error fetching file ${fileToFetch.name} from Google Drive:`, error);
            // alert(`Could not download ${fileToFetch.name}: ${error.message || 'Unknown error'}`);
            // Individual file errors are logged, and a general error might be set after the loop.
            if (!error) setError(`Error downloading some files. Check console for details.`); // Set a general error if not already set
          }
        }

        if (fetchedFiles.length > 0) {
          try {
            const processed = await processFiles(
              fetchedFiles,
              imageAcceptConfig,
              maxIndividualSize,
              (progress) => console.log("Google Drive Import Progress:", progress) // TODO: Integrate with main page progress
            );
            onFilesSelected(processed);
          } catch (processingError: any) {
            console.error("Error processing files from Google Drive:", processingError);
            setError(`Error processing images: ${processingError.message || 'Unknown error'}`);
          }
        } else if (filesToFetch.length > 0 && !error) {
          // Files were selected, but none were fetched successfully, and no specific error was set
          setError("Could not retrieve any of the selected files.");
        }
        setIsProcessing(false);
      } else if (data.action === google.picker.Action.CANCEL) {
        console.log("Google Picker: User cancelled.");
        // setError("File selection cancelled."); // Optional: notify user of cancellation
      } else if (data.action === google.picker.Action.LOADED) {
        console.log("Google Picker: Loaded.");
      } else {
        console.warn("Unhandled picker action or data:", data);
        if (!error) setError("An unexpected issue occurred with the file picker.");
      }
    },
    [onFilesSelected, imageAcceptConfig, maxIndividualSize, error], // Added error to dependencies
  );

  const createPicker = useCallback(() => {
    setError(null); // Clear previous errors
    const token = window.gapi?.client?.getToken();
    if (!pickerApiLoaded || !token?.access_token || !GOOGLE_API_KEY) {
        let message = "Google Picker cannot be created: ";
        if (!GOOGLE_API_KEY) message += "API Key is missing. ";
        else if (!pickerApiLoaded) message += "Picker API not loaded. ";
        else if (!token?.access_token) message += "Not authenticated. ";
        else message += "Unknown reason."
        console.error(message);
        setError(message + "Please try again or check console.");
      return;
    }

    const view = new window.google.picker.View(window.google.picker.ViewId.DOCS_IMAGES_AND_VIDEOS);
    view.setMimeTypes("image/png,image/jpeg,image/jpg,image/gif,image/webp,image/heic,image/heif,image/svg+xml");


    const pickerBuilder = new window.google.picker.PickerBuilder()
      .setApiKey(GOOGLE_API_KEY)
      .setOAuthToken(window.gapi.client.getToken().access_token)
      .addView(view)
      .setLocale("en")
      .setCallback(pickerCallback);

    if (GOOGLE_APP_ID) {
      pickerBuilder.setAppId(GOOGLE_APP_ID);
    }

    // Add features like multi-select and navigation
    pickerBuilder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    pickerBuilder.enableFeature(window.google.picker.Feature.NAV_HIDDEN); // Example: hide navigation if desired

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  }, [pickerApiLoaded, pickerCallback, GOOGLE_API_KEY, GOOGLE_APP_ID]);

  const handleClick = () => {
    setError(null); // Clear previous errors
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID) {
        setError("Google Drive integration is not configured. Admin: Check API Key/Client ID.");
        return;
    }
    if (!gapiLoaded || !tokenClient) {
      setError("Google services are still loading. Please wait a moment and try again.");
      return;
    }
    handleAuthClick();
  };

  const buttonDisabled = disabled || isProcessing || !gapiLoaded || !tokenClient;

  return (
    <div className="flex flex-col items-start space-y-2">
        <Button
          onClick={handleClick}
          disabled={buttonDisabled}
          variant="outline"
          className="w-full" // Make button full width to match FileUpload
        >
          <ImageIcon className="mr-2 h-4 w-4" />
          {isProcessing && "Processing..."}
          {!isProcessing && error && "Error! Retry?"}
          {!isProcessing && !error && "Import from Google Drive"}
        </Button>
        {error && (
            <p className="text-xs text-red-500 dark:text-red-400 px-1">
                {error}
            </p>
        )}
    </div>
  );
}

// Add types for gapi and google.picker to the global window object
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
