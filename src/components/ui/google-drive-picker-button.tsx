"use client";

import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { UploadedImage } from "@/lib/types"; // Keep for type consistency if needed elsewhere, but not for direct output
import { env } from "@/env.js"; // Import t3-env
// processFiles will now be called by the parent component that receives File[]

const GOOGLE_API_KEY = env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_APP_ID = env.NEXT_PUBLIC_GOOGLE_APP_ID || ""; // APP_ID is optional

// No need for manual console.warn, t3-env handles this at build/runtime if vars are missing

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

type GoogleDrivePickerButtonProps = {
  onFilesSelected: (files: File[]) => void; // Changed to emit File[]
  disabled?: boolean;
  // imageAcceptConfig and maxIndividualSize are no longer needed here
  // as processFiles will be called by the parent.
};

export function GoogleDrivePickerButton({
  onFilesSelected,
  disabled = false,
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
          callback: (tokenResponse: any) => { // Added detailed callback for success
            if (gisScriptMounted) {
              if (tokenResponse && tokenResponse.access_token) {
                // Ensure gapi client is available before setting token
                if (window.gapi && window.gapi.client) {
                  window.gapi.client.setToken({ access_token: tokenResponse.access_token });
                  console.log("Token acquired, calling createPicker from GIS callback.");
                  createPicker(); // Call createPicker on successful token acquisition
                } else {
                  console.error("GAPI client not ready when token received.");
                  setError("Google API client not ready. Please refresh.");
                }
              } else {
                console.error("Access token not received in GIS callback.", tokenResponse);
                // Avoid setting error if popup was closed, as error_callback handles that.
                if (tokenResponse?.type !== "popup_closed" && tokenResponse?.type !== "popup_failed_to_open") {
                    setError("Failed to get Google Drive access. Please grant permission.");
                }
              }
            }
          },
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

  // Callback for Google Picker
  const pickerCallback = useCallback(
    async (data: google.picker.ResponseObject) => {
      setError(null); // Clear previous errors
      if (data.action === google.picker.Action.PICKED) {
        setIsProcessing(true);
        const filesToFetch: { id: string; name: string, mimeType?: string }[] = [];
        if (data.docs && data.docs.length > 0) {
            data.docs.forEach((doc: google.picker.DocumentObject) => { // Added type for doc
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
        // const accessToken = token.access_token; // Not directly used, gapi client handles it

        if (!window.gapi.client.drive) {
            try {
                await new Promise<void>((resolve, reject) => {
                    window.gapi.client.load('drive', 'v3', resolve).catch(reject);
                });
            } catch (loadErr: any) {
                console.error("Error loading Drive API for file fetching:", loadErr);
                setError("Failed to prepare for file download. Please try again.");
                setIsProcessing(false);
                return;
            }
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
            const contentType = res.headers?.['content-type'] || fileToFetch.mimeType || 'application/octet-stream';
            const blob = new Blob([res.body], { type: contentType });
            fetchedFiles.push(new File([blob], fileToFetch.name, { type: contentType }));

          } catch (fetchError: any) {
            console.error(`Error fetching file ${fileToFetch.name} from Google Drive:`, fetchError);
            if (!error) setError(`Error downloading some files. Check console for details.`);
          }
        }

        if (fetchedFiles.length > 0) {
          onFilesSelected(fetchedFiles);
        } else if (filesToFetch.length > 0 && !error) {
          setError("Could not retrieve any of the selected files.");
        }
        setIsProcessing(false);
      } else if (data.action === google.picker.Action.CANCEL) {
        console.log("Google Picker: User cancelled.");
      } else if (data.action === google.picker.Action.PICKED) {
        console.log("Google Picker: User picked files.");
      } else {
        console.warn("Unhandled picker action or data:", data);
        if (!error) setError("An unexpected issue occurred with the file picker.");
      }
    },
    [onFilesSelected, error], // Removed imageAcceptConfig, maxIndividualSize from dependencies
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

  // Handle authentication click
  const handleAuthClick = useCallback(async () => {
    setError(null);
    if (!tokenClient) {
      console.error("Google Identity Services client not initialized.");
      setError("Google authentication is not ready. Please try again in a moment.");
      return;
    }

    // The callback for token response is handled by initTokenClient's `callback` and `error_callback`
    // when using the GIS library as configured.
    // `initTokenClient` callback internally calls createPicker on success.

    if (window.gapi?.client?.getToken()?.access_token) {
      createPicker(); // Already has token, create picker
    } else {
      // No token, or token expired. Request one.
      // The success/failure of this operation is handled by the callbacks configured in initTokenClient.
      tokenClient.requestAccessToken({ prompt: "consent" });
    }
  }, [tokenClient, createPicker]); // createPicker is a stable dependency


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
